import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { arrayUnion, doc, runTransaction } from 'firebase/firestore';
import { app, db } from '../firebase';

export type PushRegistrationStatus = 'idle' | 'checking' | 'registered' | 'failed' | 'local-only';

if (!app) {
  console.error(
    "[push] `app` imported from '../firebase' is undefined. " +
    'Export the initializeApp() instance from firebase.ts — push cannot register without it.'
  );
}

const VAPID_KEY = 'BO8UFVwIO8lJS5tkoF1aYoUEsT61YYO078T3r-gobhR-TU3ieo2BWbqtoC9NFuI83jCz2Ykcv2_PllZnYMqtZUE';

// `renotify` and `badge` aren't in every TS lib version of NotificationOptions.
type ShowOptions = NotificationOptions & { renotify?: boolean; badge?: string };

let unsubscribeForeground: (() => void) | null = null; // exactly one onMessage listener at a time
const inFlight = new Map<string, Promise<string | null>>();

export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.warn('[push] service workers unsupported in this browser');
    return null;
  }

  const swUrl = `${import.meta.env.BASE_URL}sw.js`;
  const registration = await navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' });
  await navigator.serviceWorker.ready;
  return registration;
}

async function doRegister(uid: string): Promise<string | null> {
  if (!app) return null;
  if (Notification.permission !== 'granted') {
    console.warn('[push] notification permission is', Notification.permission);
    return null;
  }
  try {
    if (!(await isSupported())) {
      console.warn('[push] Firebase Messaging not supported here (needs secure context, Push API, IndexedDB)');
      return null;
    }

    const registration = await registerNotificationServiceWorker();
    if (!registration) return null;
    await registration.update();

    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) {
      console.warn('[push] getToken returned empty (permission or service worker problem)');
      return null;
    }
    console.info('[push] token acquired', `${token.slice(0, 12)}…`, 'sw scope:', registration.scope);

    const userRef = doc(db, 'users', uid);
    await runTransaction(db, async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      const userData = userSnapshot.data();
      transaction.set(userRef, {
        fcmTokens: arrayUnion(token),
        notifiedCardKeys: Array.isArray(userData?.notifiedCardKeys) ? userData.notifiedCardKeys : [],
        notifiedExamIds: Array.isArray(userData?.notifiedExamIds) ? userData.notifiedExamIds : [],
      }, { merge: true });
    });

    // Replace (never stack) the foreground listener.
    unsubscribeForeground?.();
    unsubscribeForeground = onMessage(messaging, async (payload) => {
      const data = payload.data || {};
      if (Notification.permission !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const base = import.meta.env.BASE_URL;
      const options: ShowOptions = {
        body: data.body,
        tag: data.tag || 'kojlux-notification',
        renotify: true,
        data: { url: data.url || './' },
        icon: `${base}icon.png`,
        badge: `${base}notification-badge.svg`,
      };
      await reg.showNotification(data.title || 'Kojlux Study Hub', options);
    });

    return token;
  } catch (err) {
    console.error('[push] Failed to register for push notifications', err);
    return null;
  }
}

// App.tsx already calls this on load (effect keyed on user + permission) and
// from the "Enable Notifications" click. Concurrent calls share one run.
export function registerPushForUser(uid: string): Promise<string | null> {
  const existing = inFlight.get(uid);
  if (existing) return existing;
  const registration = doRegister(uid).finally(() => inFlight.delete(uid));
  inFlight.set(uid, registration);
  return registration;
}