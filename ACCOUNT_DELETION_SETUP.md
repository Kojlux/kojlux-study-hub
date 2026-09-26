# Account deletion

The signed-in user selects **Delete account** in Profile settings, reviews the
final confirmation at `public/account-deletion.html`, and explicitly confirms.
That page calls `await auth.currentUser.delete()`. It does not write a
client-authored deletion payload to Firestore.

The `cleanupDeletedUserData` Firebase Auth `onUserDeleted` function then recursively
deletes `users/{uid}` and its subcollections, removes that user's community
posts and `materials/{uid}/` uploads. It does not retain the user's email or
UID in a mail queue after deletion. Auth events are asynchronous and can be
retried; cleanup is server-side and idempotent, but should not be described as
literally instantaneous.

The cleanup uses the installed SDK's supported 1st-generation Auth deletion
trigger API. It runs asynchronously after Firebase Auth removes the account;
the UI cannot wait for Firestore and Storage cleanup to finish.

## Legacy deletion-request email flow

The Trigger Email extension and `queueDeletionRequestEmail` function remain
available for legacy or separately submitted documents in `deletion_requests`.
The current account-deletion page does not write to that collection or send an
email; it deletes the signed-in account directly. Do not retain personal
identifiers after deletion without a defined retention purpose and policy.

## Deploy and test

```bash
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,functions
```

When deploying, Firebase may ask to delete the obsolete callable
`deleteAccount`; approve removing it because the new flow deletes the Auth
user directly and the Auth trigger performs cleanup. Then publish the updated
site to GitHub Pages. Test with a disposable account and verify the Auth user,
Firestore user tree, community posts, and Storage files are removed.