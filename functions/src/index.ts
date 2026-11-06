// functions/index.ts — deploy this to Firebase Cloud Functions.
//
// This is the piece that actually runs while the student's browser is
// closed: Cloud Scheduler wakes this function up on a timer, it looks
// through every user's due dates and paused-quiz reminder records (synced to
// Firestore by App.tsx), then sends FCM pushes to saved device tokens (see
// lib/push.ts).
//
// SETUP (one-time):
//   1. `firebase init functions` in your project root if you haven't already
//      (choose TypeScript). This creates a functions/ folder with its own
//      package.json.
//   2. Requires the Blaze (pay-as-you-go) plan — Cloud Scheduler/outbound
//      networking isn't available on the free Spark plan. In practice, for
//      this usage pattern (checking a handful of users every few minutes),
//      cost is essentially $0–1/month.
//   3. `npm install firebase-admin firebase-functions` inside functions/.
//   4. Put this file's content in functions/src/index.ts.
//   5. `firebase deploy --only functions`
//
// This checks every 15 minutes, which matches the granularity the app
// already polls at client-side (see App.tsx's 60s interval — 15 min server-
// side is plenty since review "due" times aren't second-precise).

import * as admin from 'firebase-admin';
import * as functionsV1 from 'firebase-functions/v1';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenAI } from '@google/genai';
import {
  getKojluxResponseSchema,
  KOJLUX_COMPONENT_INSTRUCTIONS,
  KOJLUX_MATH_NOTATION_INSTRUCTIONS,
  KOJLUX_QUIZ_COMPONENT_INSTRUCTIONS,
  type KojluxGenerationMode,
  validateKojluxPayload,
} from '../../shared/kojluxSchema.js';

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
const WEB_PUSH_TTL_SECONDS = '2419200';
const ORCHESTRATION_KEY_PLACEHOLDERS = [
  'PASTE_YOUR_NEW_ORCHESTRATION_KEY_1_HERE',
  'PASTE_YOUR_NEW_ORCHESTRATION_KEY_2_HERE',
  'PASTE_YOUR_NEW_ORCHESTRATION_KEY_3_HERE',
] as const;
const orchestrationSecrets = ORCHESTRATION_KEY_PLACEHOLDERS.map((_, index) =>
  defineSecret(`ORCHESTRATION_KEY_${index + 1}`)
);

export const generateKojluxContent = onCall(
  { secrets: orchestrationSecrets, timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to use orchestration fallback.');
    }

    const data = request.data as {
      mode?: unknown;
      subject?: unknown;
      topic?: unknown;
      contents?: unknown;
    };
    if (data.mode !== 'quiz' && data.mode !== 'notes') {
      throw new HttpsError('invalid-argument', 'Generation mode must be quiz or notes.');
    }
    if (
      typeof data.subject !== 'string' ||
      data.subject.length > 80 ||
      typeof data.topic !== 'string' ||
      data.topic.length > 2000
    ) {
      throw new HttpsError('invalid-argument', 'Subject and topic are required.');
    }
    if (!Array.isArray(data.contents) || data.contents.length === 0) {
      throw new HttpsError('invalid-argument', 'Generation content is missing.');
    }
    if (Buffer.byteLength(JSON.stringify(data.contents), 'utf8') > 900_000) {
      throw new HttpsError('invalid-argument', 'The source material is too large for orchestration fallback. Try a smaller file or less text.');
    }

    const now = Date.now();
    const rateLimitRef = db.collection('orchestrationRateLimits').doc(request.auth.uid);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(rateLimitRef);
      const limit = snapshot.data();
      const windowStart = typeof limit?.windowStart === 'number' ? limit.windowStart : 0;
      const calls = typeof limit?.calls === 'number' ? limit.calls : 0;
      if (now - windowStart < 10 * 60_000 && calls >= 6) {
        throw new HttpsError('resource-exhausted', 'Orchestration fallback limit reached. Try again in a few minutes.');
      }
      transaction.set(rateLimitRef, {
        windowStart: now - windowStart >= 10 * 60_000 ? now : windowStart,
        calls: now - windowStart >= 10 * 60_000 ? 1 : calls + 1,
      });
    });

    const ORCHESTRATION_KEYS = orchestrationSecrets
      .map((secret, index) => secret.value() || ORCHESTRATION_KEY_PLACEHOLDERS[index])
      .filter((key, index) => key !== ORCHESTRATION_KEY_PLACEHOLDERS[index]);
    if (ORCHESTRATION_KEYS.length === 0) {
      throw new HttpsError('failed-precondition', 'Orchestration keys are not configured in Firebase Secrets.');
    }

    const contents = data.contents as Array<{ role?: string; parts?: Array<Record<string, unknown>> }>;
    const currentTimestamp = new Date().toISOString();
    const orchestrationInstruction = [
      'Act as Kojlux Study Hub’s pedagogical orchestrator. Generate the complete final payload for this request using the supplied response schema.',
      `Generation mode: ${data.mode}. Subject: ${data.subject}. Topic: ${data.topic}.`,
      data.mode === 'quiz'
        ? `${KOJLUX_QUIZ_COMPONENT_INSTRUCTIONS} ${KOJLUX_MATH_NOTATION_INSTRUCTIONS} Set metadata.generatedAt to ${currentTimestamp}.`
        : `${KOJLUX_COMPONENT_INSTRUCTIONS} ${KOJLUX_MATH_NOTATION_INSTRUCTIONS} ${currentTimestamp}`,
      'For quiz mode, preserve the requested questions and answer format. For notes mode, preserve the overview, keyPoints, and glossary fields.',
      'For notes, select only the educational components that add clear conceptual value.',
      'metadata.orchestratorReasoning is a brief user-facing rationale for component choices, not private step-by-step reasoning.',
    ].join('\n');
    const orchestratedContents = [
      ...contents,
      { role: 'user', parts: [{ text: orchestrationInstruction }] },
    ];

    let lastError: unknown;
    for (const apiKey of ORCHESTRATION_KEYS) {
      try {
        const client = new GoogleGenAI({ apiKey });
        const response = await client.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: orchestratedContents,
          config: {
            responseMimeType: 'application/json',
            responseSchema: getKojluxResponseSchema(data.mode as KojluxGenerationMode),
          },
        });
        if (!response.text) {
          throw new Error('Gemini returned an empty orchestration response.');
        }
        const payload: unknown = JSON.parse(response.text);
        validateKojluxPayload(payload, data.mode as KojluxGenerationMode);
        return { text: JSON.stringify(payload) };
      } catch (error) {
        console.error('Orchestration key attempt failed; trying the next configured key.', error);
        lastError = error;
      }
    }
    console.error('All configured orchestration keys failed.');
    throw new HttpsError('internal', 'Orchestration could not generate a valid response.', {
      cause: lastError instanceof Error ? lastError.message : 'Unknown Gemini error',
    });
  }
);

function notificationUrl(tab: 'review' | 'profile' | 'quiz', targetId?: string): string {
  const params = new URLSearchParams({ notification: '1', tab });
  if (targetId && tab === 'profile') params.set('examId', targetId);
  if (targetId && tab === 'quiz') params.set('resumeQuizId', targetId);
  return `?${params.toString()}`;
}

export const cleanupDeletedUserData = functionsV1
  .runWith({ timeoutSeconds: 540 })
  .auth.user()
  .onDelete(async (user) => {
    const uid = user.uid;
    const userRef = db.collection('users').doc(uid);
    const communityLinks = await db.collection('communityLinks').where('submittedBy', '==', uid).get();
    const mailRef = db.collection('mail_queue').doc(`account-deletion-${uid}`);

    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(mailRef);
      if (existing.exists) return;

      transaction.create(mailRef, {
        to: 'officialkojux@gmail.com',
        message: {
          subject: 'Kojlux Study Hub account deleted',
          text: [
            `Registered email: ${user.email ?? 'Unavailable'}`,
            `User ID: ${uid}`,
            `Deleted at: ${new Date().toISOString()}`,
          ].join('\n'),
        },
      });
    });

    for (let offset = 0; offset < communityLinks.docs.length; offset += 500) {
      const batch = db.batch();
      communityLinks.docs.slice(offset, offset + 500).forEach((link) => batch.delete(link.ref));
      await batch.commit();
    }

    await Promise.all([
      db.recursiveDelete(userRef),
      admin.storage().bucket().deleteFiles({ prefix: `materials/${uid}/` }),
    ]);

    console.info('Completed account data cleanup after Auth deletion', { uid });
  });

export const queueDeletionRequestEmail = onDocumentCreated(
  'deletion_requests/{requestId}',
  async (event) => {
    const request = event.data?.data();
    if (!request || typeof request.email !== 'string') return;

    const email = request.email.trim().slice(0, 254);
    const reason = typeof request.reason === 'string' ? request.reason.trim().slice(0, 1000) : '';
    const requestId = event.params.requestId;
    const mailRef = db.collection('mail_queue').doc(requestId);

    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(mailRef);
      if (existing.exists) return;

      transaction.create(mailRef, {
        to: 'officialkojux@gmail.com',
        message: {
          subject: 'Kojlux Study Hub account deletion request',
          text: [
            `Registered email: ${email}`,
            `Requested at: ${request.requestedAt?.toDate?.()?.toISOString?.() ?? 'Timestamp unavailable'}`,
            `Reason: ${reason || 'No reason provided.'}`,
            `Request ID: ${requestId}`,
          ].join('\n'),
        },
      });
    });
  }
);

interface DueDate {
  id: string;
  dueAt: string; // ISO
  sourceTitle: string;
}
interface ExamReminder {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
}

// Same "1 day before, 6pm local" rule as lib/examReminders.ts — duplicated
// here deliberately (functions/ is a separate deployable package with no
// access to src/lib without a shared workspace, which is more setup than
// this needs). Keep the two in sync if you change the reminder timing.
function examReminderIsDue(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const reminder = new Date(y, m - 1, d - 1);
  reminder.setHours(18, 0, 0, 0);
  return Date.now() >= reminder.getTime();
}

const sendPush = (tokens: string[], data: Record<string, string>) =>
  messaging.sendEachForMulticast({
    tokens,
    webpush: { headers: { TTL: WEB_PUSH_TTL_SECONDS, Urgency: 'high' } },
    data,
  });

// Card keys are `${id}:${dueAt}` so a card that is reviewed (new dueAt) can notify again.
const cardKey = (c: DueDate) => `${c.id}:${c.dueAt}`;

async function processUser(userDoc: admin.firestore.QueryDocumentSnapshot) {
  const data = userDoc.data();
  const tokens: string[] = data.fcmTokens || [];
  if (tokens.length === 0) {
    console.warn('Skipping reminders: user has no registered FCM token', { uid: userDoc.id });
    return;
  }

  await processQuizResumeReminders(userDoc, tokens);

  const dueDates: DueDate[] = data.recallCardDueDates || [];
  const examReminders: ExamReminder[] = data.examReminders || [];
  const notifiedCardKeys: string[] = data.notifiedCardKeys || [];
  const notifiedExamIds: string[] = data.notifiedExamIds || [];

  const now = Date.now();
  const newlyDueCards = dueDates.filter(
    (c) => new Date(c.dueAt).getTime() <= now && !notifiedCardKeys.includes(cardKey(c))
  );
  const newlyDueExams = examReminders.filter(
    (e) => examReminderIsDue(e.date) && !notifiedExamIds.includes(e.id)
  );

  console.info('checkDueReminders user', {
    uid: userDoc.id,
    tokens: tokens.length,
    newlyDueCards: newlyDueCards.length,
    newlyDueExams: newlyDueExams.length,
  });
  if (newlyDueCards.length === 0 && newlyDueExams.length === 0) return;

  const allResponses: admin.messaging.BatchResponse[] = [];
  const succeededCardKeys: string[] = [];
  const succeededExamIds: string[] = [];

  if (newlyDueCards.length > 0) {
    const r = await sendPush(tokens, {
      title: newlyDueCards.length === 1 ? 'A review is ready' : `${newlyDueCards.length} reviews are ready`,
      body: 'Head back to Kojlux Study Hub to keep your streak going.',
      tag: 'kojlux-reviews-ready',
      url: notificationUrl('review'),
    });
    allResponses.push(r);
    if (r.successCount > 0) succeededCardKeys.push(...newlyDueCards.map(cardKey));
    console.info('cards push', { success: r.successCount, failure: r.failureCount });
  }

  for (const exam of newlyDueExams) {
    const r = await sendPush(tokens, {
      title: "Don't forget to study!",
      body: `Your exam "${exam.title}" is tomorrow. Tap here to review your materials.`,
      tag: `kojlux-exam-reminder-${exam.id}`,
      url: notificationUrl('profile', exam.id),
    });
    allResponses.push(r);
    if (r.successCount > 0) succeededExamIds.push(exam.id);
    console.info('exam push', { examId: exam.id, success: r.successCount, failure: r.failureCount });
  }

  // Prune dead tokens (uninstalled app, cleared site data, revoked permission).
  const deadTokens = new Set<string>();
  for (const response of allResponses) {
    response.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (r.error) console.warn('push send error', { code, message: r.error.message });
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        deadTokens.add(tokens[i]);
      }
    });
  }

  // Only record reminders that actually reached at least one device, and drop
  // old keys/ids that no longer exist so the arrays don't grow forever.
  const currentCardKeys = new Set(dueDates.map(cardKey));
  const currentExamIds = new Set(examReminders.map((e) => e.id));

  await userDoc.ref.set(
    {
      notifiedCardKeys: [
        ...notifiedCardKeys.filter((k) => currentCardKeys.has(k)),
        ...succeededCardKeys,
      ],
      notifiedExamIds: [
        ...notifiedExamIds.filter((id) => currentExamIds.has(id)),
        ...succeededExamIds,
      ],
      ...(deadTokens.size > 0 ? { fcmTokens: tokens.filter((t) => !deadTokens.has(t)) } : {}),
    },
    { merge: true }
  );
}

async function processQuizResumeReminders(
  userDoc: admin.firestore.QueryDocumentSnapshot,
  tokens: string[]
): Promise<void> {
  const now = Date.now();
  const reminders = await userDoc.ref
    .collection('quizResumeReminders')
    .where('nextReminderAt', '<=', now)
    .get();

  for (const reminder of reminders.docs) {
    const data = reminder.data();
    if (typeof data.title !== 'string' || typeof data.workId !== 'string') {
      console.error('Skipping invalid quiz-resume reminder record', {
        uid: userDoc.id,
        reminderId: reminder.id,
      });
      continue;
    }

    try {
      const response = await sendPush(tokens, {
        title: `Your quiz is waiting: ${data.title}`,
        body: 'Your quiz is still saved. Resume it whenever you are ready to finish.',
        tag: `kojlux-quiz-resume-${data.workId}`,
        url: notificationUrl('quiz', data.workId),
      });
      if (response.successCount > 0) {
        await reminder.ref.update({
          lastSentAt: now,
          nextReminderAt: now + 24 * 60 * 60 * 1000,
        });
      }
      console.info('quiz-resume push', {
        uid: userDoc.id,
        workId: data.workId,
        success: response.successCount,
        failure: response.failureCount,
      });
    } catch (err) {
      console.error('Failed to send quiz-resume push', {
        uid: userDoc.id,
        reminderId: reminder.id,
        err,
      });
    }
  }
}

export const checkDueReminders = onSchedule('every 15 minutes', async () => {
  const usersSnap = await db.collection('users').get();
  console.info('checkDueReminders run', { users: usersSnap.size });

  for (const userDoc of usersSnap.docs) {
    try {
      await processUser(userDoc);
    } catch (err) {
      // One bad user must not abort everyone after them.
      console.error('checkDueReminders failed for user', { uid: userDoc.id, err });
    }
  }
});