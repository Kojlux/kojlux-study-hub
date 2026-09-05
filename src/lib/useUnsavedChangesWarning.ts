// lib/useUnsavedChangesWarning.ts
//
// Shows the browser's native "Leave site? Changes may not be saved" prompt
// when `active` is true and the user tries to close the tab, refresh, or
// navigate away (typed URL, closing the app, etc).
//
// IMPORTANT — read before relying on this for data safety:
// 1. This is a DETERRENT against *accidental* refreshes, not a data-safety
//    mechanism. It cannot stop a refresh — the user can always confirm
//    "Leave" — and it never fires at all for the case that actually caused
//    the original data loss (a mobile browser force-killing/reloading the
//    tab under memory pressure). The OS/engine doesn't ask permission for
//    that. The draft persistence in draftStore.ts is what actually makes a
//    refresh harmless; this hook is a nice-to-have on top of it.
// 2. Mobile Safari and some Android WebViews ignore beforeunload entirely,
//    so don't expect this to do anything on a lot of phones. Treat it as a
//    desktop-mostly convenience.
// 3. Custom messages are ignored by every modern browser (a generic native
//    string is always shown instead) — the `returnValue` assignment below
//    is just the required legacy incantation to trigger the prompt at all.
import { useEffect } from 'react';

export function useUnsavedChangesWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}
