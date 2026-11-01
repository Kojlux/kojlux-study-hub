// generate-sw.js
//
// Generates public/sw.js from ./sw.template.js in this same folder,
// substituting real Firebase config read from the same VITE_FIREBASE_* env
// vars firebase.ts already uses. Run this before dev/build so public/sw.js
// is always in sync with your actual project — no more hand-copied
// placeholder values.
//
// ESM module (package.json has "type": "module", so this can't use
// require()/__dirname — import.meta.url + fileURLToPath stand in for them).
//
// Wired into package.json as:
//   "predev": "node generate-sw.js",
//   "prebuild": "node generate-sw.js"

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, 'sw.template.js');
const OUTPUT_PATH = path.resolve(__dirname, 'public/sw.js');

const REQUIRED_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const missing = REQUIRED_VARS.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  // Fail loudly at build time instead of silently shipping a broken service
  // worker — this is exactly the failure mode we're fixing: a bad SW config
  // that "looks fine" and only breaks push notifications, silently, days
  // later during testing.
  console.error(
    `[generate-sw] Missing required env var(s): ${missing.join(', ')}. ` +
    `public/sw.js was NOT regenerated — background push notifications would ` +
    `silently fail if it were. Add these to your .env and re-run.`
  );
  process.exit(1);
}

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY.trim(),
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN.trim(),
  projectId: process.env.VITE_FIREBASE_PROJECT_ID.trim(),
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET.trim(),
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID.trim(),
  appId: process.env.VITE_FIREBASE_APP_ID.trim(),
};

const appIdPrefix = `1:${firebaseConfig.messagingSenderId}:web:`;
if (!/^1:\d+:web:[A-Za-z0-9_-]+$/.test(firebaseConfig.appId) || !firebaseConfig.appId.startsWith(appIdPrefix)) {
  console.error(
    '[generate-sw] VITE_FIREBASE_APP_ID must be the Web App ID from Firebase Project settings ' +
    '(format: 1:<project-number>:web:<app-id>) and its project number must match ' +
    'VITE_FIREBASE_MESSAGING_SENDER_ID. Check the GitHub Actions secret; no service worker was generated.'
  );
  process.exit(1);
}

const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
const firebaseConfigLiteral = JSON.stringify(firebaseConfig, null, 2);
const initialization = 'firebase.initializeApp(__FIREBASE_CONFIG__);';
if (!template.includes(initialization)) {
  console.error('[generate-sw] Service worker template is missing its Firebase initialization placeholder.');
  process.exit(1);
}
const output = template.replace(initialization, `firebase.initializeApp(${firebaseConfigLiteral});`);

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, output, 'utf8');
console.log(`[generate-sw] Wrote ${OUTPUT_PATH} with real Firebase config (project: ${firebaseConfig.projectId}).`);