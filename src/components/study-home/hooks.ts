import { useCallback, useEffect, useState } from 'react';
import type { RecallCard } from '../../types';
import type { FlashcardCycle, FlashcardCycleState, SidebarCollapse } from './types';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const SIDEBAR_STORAGE_KEY = 'kojlux_sidebar_collapsed';

// ---------------------------------------------------------------------------
// prefers-reduced-motion
// ---------------------------------------------------------------------------

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches
  );

  useEffect(() => {
    const query: MediaQueryList = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = (event: MediaQueryListEvent): void => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

// ---------------------------------------------------------------------------
// Flashcard cross-fade cycle: Front -> Back -> (next card) Front -> ...
// ---------------------------------------------------------------------------

const INITIAL_CYCLE: FlashcardCycleState = { frontIndex: 0, backIndex: 0, isFlipped: false, epoch: 0 };

/** Pure transition so it is trivial to unit-test. */
export function advanceCycle(state: FlashcardCycleState, count: number): FlashcardCycleState {
  if (count === 0) return state;
  if (!state.isFlipped) {
    // Front -> Back: lock the back face to the card currently shown.
    return { ...state, isFlipped: true, backIndex: state.frontIndex };
  }
  // Back -> Front: move on to the next card.
  return { ...state, isFlipped: false, frontIndex: (state.frontIndex + 1) % count };
}

/**
 * Drives the "Due cards" preview. Ticks every `intervalMs` (4s by default),
 * pauses on demand (hover / focus), and does not auto-advance for people who
 * prefer reduced motion — they can still flip manually with `flip()`.
 */
export function useFlashcardCycle(
  cards: readonly RecallCard[],
  intervalMs: number = 4000
): FlashcardCycle {
  const count: number = cards.length;
  const reducedMotion: boolean = usePrefersReducedMotion();
  const [state, setState] = useState<FlashcardCycleState>(INITIAL_CYCLE);
  const [paused, setPaused] = useState<boolean>(false);

  // If the deck shrinks below the current position, start over.
  useEffect(() => {
    setState((prev) =>
      count === 0 || (prev.frontIndex < count && prev.backIndex < count)
        ? prev
        : { ...INITIAL_CYCLE, epoch: prev.epoch }
    );
  }, [count]);

  useEffect(() => {
    if (count === 0 || paused || reducedMotion) return undefined;
    const id: ReturnType<typeof setInterval> = setInterval(() => {
      setState((prev) => advanceCycle(prev, count));
    }, intervalMs);
    return () => clearInterval(id);
  }, [count, intervalMs, paused, reducedMotion, state.epoch]);

  const flip = useCallback((): void => {
    setState((prev) => ({ ...advanceCycle(prev, count), epoch: prev.epoch + 1 }));
  }, [count]);

  return {
    frontIndex: state.frontIndex,
    backIndex: state.backIndex,
    isFlipped: state.isFlipped,
    flip,
    setPaused,
  };
}

// ---------------------------------------------------------------------------
// Sidebar collapse (persisted)
// ---------------------------------------------------------------------------

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function useSidebarCollapse(): SidebarCollapse {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* storage can be unavailable (private mode); the toggle still works */
    }
  }, [collapsed]);

  const toggle = useCallback((): void => setCollapsed((prev) => !prev), []);

  return { collapsed, toggle };
}
