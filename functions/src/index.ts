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
import { onSchedule } from 'firebase-functions/v2/scheduler';

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

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

    const sends: Promise<unknown>[] = [];

    if (newlyDueCards.length > 0) {
     // const title =
        newlyDueCards.length === 1
          ? `A review is ready`
          : `${newlyDueCards.length} reviews are ready`;
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

    await Promise.all(sends);

    await userDoc.ref.set(
      {
        notifiedCardIds: [...notifiedCardIds, ...newlyDueCards.map((c) => c.id)],
        notifiedExamIds: [...notifiedExamIds, ...newlyDueExams.map((e) => e.id)],
      },
      { merge: true }
    );
  }
});