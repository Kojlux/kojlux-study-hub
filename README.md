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

## Release requirements

Before submitting to Google Play or the App Store, configure release signing,
native push credentials, store privacy/data-safety declarations, support and
account-deletion URLs, screenshots, age ratings, and the final legal policy.
