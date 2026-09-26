// functions/index.ts — deploy this to Firebase Cloud Functions.
//
// This is the piece that actually runs while the student's browser is
// closed: Cloud Scheduler wakes this function up on a timer, it looks
// through every user's due dates (synced to Firestore by App.tsx — see the
// "Server-side mirror" effects there), and for anything newly due it sends
// an FCM push to that user's saved device token(s) (see lib/push.ts).
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

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

export const cleanupDeletedUserData = functionsV1
  .runWith({ timeoutSeconds: 540 })
  .auth.user()
  .onDelete(async (user) => {
    const uid = user.uid;
    const userRef = db.collection('users').doc(uid);
    const communityLinks = await db.collection('communityLinks').where('submittedBy', '==', uid).get();

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
        to: 'officialkojlux@gmail.com',
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

export const checkDueReminders = onSchedule('every 15 minutes', async () => {
  const usersSnap = await db.collection('users').get();

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const tokens: string[] = data.fcmTokens || [];
    if (tokens.length === 0) continue; // never enabled notifications

    const dueDates: DueDate[] = data.recallCardDueDates || [];
    const examReminders: ExamReminder[] = data.examReminders || [];
    const notifiedCardIds: string[] = data.notifiedCardIds || [];
    const notifiedExamIds: string[] = data.notifiedExamIds || [];

    const now = Date.now();
    const newlyDueCards = dueDates.filter(
      (c) => new Date(c.dueAt).getTime() <= now && !notifiedCardIds.includes(c.id)
    );
    const newlyDueExams = examReminders.filter(
      (e) => examReminderIsDue(e.date) && !notifiedExamIds.includes(e.id)
    );

    if (newlyDueCards.length === 0 && newlyDueExams.length === 0) continue;

    const sends: Promise<admin.messaging.BatchResponse>[] = [];

    if (newlyDueCards.length > 0) {
      sends.push(
        messaging.sendEachForMulticast({
          tokens,
          data: {
            title: newlyDueCards.length === 1 ? 'A review is ready' : `${newlyDueCards.length} reviews are ready`,
            body: 'Head back to Kojlux Study Hub to keep your streak going.',
            tag: 'kojlux-reviews-ready',
            url: '/', // App.tsx routes activeTab='review' from here if you wire that up
          },
        })
      );
    }

    for (const exam of newlyDueExams) {
      sends.push(
        messaging.sendEachForMulticast({
          tokens,
          data: {
            title: "Don't forget to study!",
            body: `Your exam "${exam.title}" is tomorrow. Tap here to review your materials.`,
            tag: `kojlux-exam-reminder-${exam.id}`,
            url: '/',
          },
        })
      );
    }

    const responses = await Promise.all(sends);

    // Prune dead tokens (uninstalled app, cleared site data, revoked
    // permission, etc.) instead of leaving them in fcmTokens forever.
    // sendEachForMulticast reports per-token failures in the same order the
    // tokens were passed in, so index i of every response maps back to
    // tokens[i] here. Without this, a token that will never succeed again
    // stays in the array indefinitely, and on a multi-device account it can
    // also mask a *different* real, working token's send failing for an
    // unrelated transient reason during log review.
    const deadTokens = new Set<string>();
    for (const response of responses) {
      response.responses.forEach((r, i) => {
        const code = r.error?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          deadTokens.add(tokens[i]);
        }
      });
    }

    await userDoc.ref.set(
      {
        notifiedCardIds: [...notifiedCardIds, ...newlyDueCards.map((c) => c.id)],
        notifiedExamIds: [...notifiedExamIds, ...newlyDueExams.map((e) => e.id)],
        ...(deadTokens.size > 0
          ? { fcmTokens: tokens.filter((t) => !deadTokens.has(t)) }
          : {}),
      },
      { merge: true }
    );
  }
});