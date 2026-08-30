import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { app, db } from '../firebase';

// GUARD: getMessaging(undefined) throws inside the try/catch below and is
// swallowed, silently reporting "notifications didn't turn on" with zero
// signal as to why. If firebase.ts doesn't do `export const app =
// initializeApp(config)` (only exporting `auth`/`db`, say), `app` here
// resolves to `undefined` and this whole feature quietly does nothing. This
// check turns that into a loud, specific console error instead.
if (!app) {
  console.error(
    "[push] `app` imported from '../firebase' is undefined. " +
    'Add `export const app = initializeApp(firebaseConfig);` to firebase.ts ' +
    '(and export that same `app` instance, not a new one) — push notifications ' +
    'cannot register without it.'
  );
}

// Registers the service worker and asks Firebase Cloud Messaging for a push
// token, then stores that token on the user's Firestore doc so the backend
// (functions/index.ts) knows where to deliver reminders. Only meaningful for
// signed-in users — a guest session has no server-side record to push to,
// so closed-browser notifications aren't possible for guests; the existing
// in-app-only notifications in lib/notifications.ts still work for them
// while the tab is open.
//
// Call this once, right after the student clicks "Enable Notifications" and
// permission comes back 'granted' (same spot App.tsx already calls
// requestNotificationPermission()).
export async function registerPushForUser(uid: string): Promise<string | null> {
  if (!app) return null; // see the loud console.error above — nothing to register against
  if (!('serviceWorker' in navigator)) return null;
  // isSupported() checks the full set Messaging actually needs (Push API,
  // Notification API, IndexedDB, a secure context) — broader than just
  // "does serviceWorker exist", which some older/in-app browsers pass while
  // still lacking a piece Messaging needs. Failing quietly here beats
  // getMessaging() throwing later.
  if (!(await isSupported())) return null;

  try {
    // { updateViaCache: 'none' } forces the browser to re-check /sw.js
    // against the network (bypassing HTTP cache) on every registration
    // attempt. Without it, a browser that cached an OLD sw.js (e.g. one
    // saved before generate-sw.js started injecting real Firebase config)
    // can keep running that stale worker for up to 24h even after you've
    // fixed and redeployed the file — "I fixed it and it's still broken"
    // is very often just this.
    const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    await registration.update();
    const messaging = getMessaging(app);

    // Generate this in Firebase console → Project settings → Cloud Messaging
    // → Web configuration → "Web Push certificates" → Generate key pair.
    const VAPID_KEY = 'BO8UFVwIO8lJS5tkoF1aYoUEsT61YYO078T3r-gobhR-TU3ieo2BWbqtoC9NFuI83jCz2Ykcv2_PllZnYMqtZUE';

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return null;

    // Store as an array (arrayUnion) rather than a single field — a student
    // may have this open on a phone and a laptop at once, and both should
    // get the push.
    await setDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) }, { merge: true });

    // Foreground messages (app open + focused) still go through here instead
    // of the service worker — keeps today's in-app toast/notification
    // behavior working exactly as before for that case.
    onMessage(messaging, (payload) => {
      const data = payload.data || {};
      if (Notification.permission === 'granted') {
        new Notification(data.title || 'Kojlux Study Hub', {
          body: data.body,
          tag: data.tag,
        });
      }
    });

    return token;
  } catch (err) {
    console.error('Failed to register for push notifications', err);
    return null;
  }
}