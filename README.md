# Kojlux Study Hub

Kojlux Study Hub is a study workspace for creating quizzes and summaries,
organizing flashcards, tracking review progress, and setting exam reminders.

## Local development

Prerequisites: Node.js and npm.

1. Install dependencies with `npm install`.
2. Create a local `.env` file with the Firebase and Gemini variables used by
   `src/firebase.ts` and `src/lib/gemini.ts`.
3. Start the development server with `npm run dev`.
4. Open the local URL printed by the server.

## Checks

- `npm run lint` runs the TypeScript check.
- `npm run build` creates the production web build and generates the service worker.
- `npm --prefix functions run build` compiles Firebase Cloud Functions.

## Firebase deployment

The repository contains [firestore.rules](firestore.rules) and
[storage.rules](storage.rules). Deploy them only after signing in to the
correct Firebase project:

```bash
firebase login
firebase use <project-id>
firebase deploy --only firestore:rules,storage,functions
```

Account deletion uses Firebase Auth's user-delete action followed by the
`cleanupDeletedUserData` Auth trigger. Test this flow in a non-production
Firebase project before release.

Quiz/Notes orchestration fallback runs in the authenticated
`generateKojluxContent` callable, not in the browser. Keep all existing Quiz
and Notes keys and rotations. Add the two additional feature keys as new
entries in `.env`:

```dotenv
VITE_QUIZ_GENERATOR_KEY_ROTATION_2=
VITE_SUMMARIZER_KEY_ROTATION_2=
```

The Quiz and Notes key pools try these new keys after their existing feature
keys. Since `VITE_` values are included in the web app bundle, restrict these
keys to the required Gemini API and configure suitable quotas.

Use the remaining three keys as Firebase Secrets. The CLI prompts for each
value; do not put orchestration keys in `.env`, source code, or chat:

```bash
firebase functions:secrets:set ORCHESTRATION_KEY_1 --project <project-id>
firebase functions:secrets:set ORCHESTRATION_KEY_2 --project <project-id>
firebase functions:secrets:set ORCHESTRATION_KEY_3 --project <project-id>
firebase deploy --only functions --project <project-id>
```

The callable tries each configured orchestration key in order until generation
succeeds. Configure all three values to use the full orchestration key pool.
The callable is limited to six requests per user per ten minutes. Large
source payloads over 900 KB cannot use orchestration fallback. Existing
Quiz/Notes feature key names and rotation order remain unchanged.

## Release requirements

Before submitting to Google Play or the App Store, configure release signing,
native push credentials, store privacy/data-safety declarations, support and
account-deletion URLs, screenshots, age ratings, and the final legal policy.
