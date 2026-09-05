// lib/useFullscreen.ts
//
// Optional, purely cosmetic: puts an element into fullscreen (like the
// immersive mode you're thinking of from Wayground/Kahoot) — hides browser
// chrome for a more focused, game-like feel on a shared classroom device.
//
// READ THIS FIRST: Fullscreen does NOT prevent, intercept, or warn about a
// refresh. It does not survive a real reload — the browser exits fullscreen
// automatically on refresh/navigation, and it has zero effect on the mobile
// low-memory force-refresh from the original bug (that's an OS/engine-level
// page kill, not something a page-level API can see coming or block). Use
// this for atmosphere on top of draftStore.ts, never as a substitute for it.
import { useCallback, useEffect, useState } from 'react';

export function useFullscreen(ref: React.RefObject<HTMLElement>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const enter = useCallback(() => {
    ref.current?.requestFullscreen?.().catch(() => {
      // Fullscreen requires a direct user gesture and isn't supported/allowed
      // in every mobile browser context (e.g. some in-app webviews) — fail
      // silently rather than blocking the actual quiz/note/visualization.
    });
  }, [ref]);

  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }, []);

  return { isFullscreen, enter, exit };
}
