/* eslint-disable no-undef */
// Kojlux Study Hub — service worker
//
// This is what makes "reviews are ready" / exam reminders show up even when
// the tab (or the whole browser) is closed. It has two jobs:
//
//   1. Receive push messages from Firebase Cloud Messaging (FCM) while
//      nothing else is running, and turn them into an OS notification.
//   2. Handle a tap on that notification by opening/focusing the app.
//
// IMPORTANT: this alone is not enough. A push only arrives here if:
//   - the student granted Notification permission,
//   - their device registered an FCM token (see lib/push.ts),
//   - and a server actually SENT a push at the right time (see
//     functions/index.ts — a Cloud Function reading due dates from
//     Firestore, since this worker can't read localStorage or run your
//     app's own due-date logic while suspended).
// See PUSH_NOTIFICATIONS_SETUP.md for the full picture.

importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js');

// Same values as src/firebase.ts — service workers can't read import.meta.env,
// so these are inlined here. None of these are secret; they're already public
// in the compiled client bundle. Fill in your real project's values (from the
// Firebase console > Project settings > General > Your apps > SDK setup).
firebase.initializeApp({
  apiKey: 'REPLACE_WITH_VITE_FIREBASE_API_KEY',
  authDomain: 'REPLACE_WITH_VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'REPLACE_WITH_VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'REPLACE_WITH_VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'REPLACE_WITH_VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'REPLACE_WITH_VITE_FIREBASE_APP_ID',
});

const messaging = firebase.messaging();

// Fires when a push arrives while no tab has the app open/focused (the case
// this whole feature exists for). FCM also supports a "notification" payload
// that displays itself automatically with no code here — but sending "data"-
// only messages and building the notification ourselves lets us control the
// tag (collapsing duplicates, same as the old in-app notifications.ts did)
// and attach a deep-link URL for notificationclick below.
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || 'Kojlux Study Hub';
  const body = data.body || 'You have something to review.';
  const tag = data.tag || 'kojlux-notification';
  const url = data.url || '/';

  self.registration.showNotification(title, {
    body,
    tag,
    data: { url },
    icon: '/icon-192.png', // swap for your actual app icon path
    badge: '/icon-192.png',
  });
});

// Tapping the notification focuses an already-open tab if there is one,
// otherwise opens a new one at the deep-linked URL (e.g. straight into
// Review, or the Study Calendar for an exam reminder).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});