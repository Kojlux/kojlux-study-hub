import { useEffect, useState } from 'react';
import type { MouseEvent, ReactElement } from 'react';
import { ArrowRight, Layers } from 'lucide-react';
import type { RecallCard } from '../../types';

interface FlashcardFolderProps {
  cards: readonly RecallCard[];
  onStartReview: () => void;
  /** Time each question stays on screen before moving to the next card. Defaults to 4000ms. */
  intervalMs?: number;
}

// Fixed card size: every card is the same height. Long questions are cut off with "..." (4 lines max).
// Kept in this file; selectors are scoped under .kh-folder so they override the shared stylesheet.
const CARD_CSS = `
.kh-folder .kh-fc {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 200px;
  box-sizing: border-box;
  overflow: hidden;
}
.kh-folder .kh-fc-stage {
  flex: 1 1 auto;
  min-height: 0;
  display: block;
  overflow: hidden;
}
.kh-folder .kh-fc-face {
  position: static;
  display: -webkit-box;
  width: 100%;
  opacity: 1;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  overflow: hidden;
  text-overflow: ellipsis;
  overflow-wrap: anywhere;
}
`;

/**
 * "Due cards" preview styled as a physical folder: an absolute-positioned
 * tab, a gradient folder body, and two sheets peeking out behind the card.
 * Shows only the question of each card, then moves on to the next one
 * (automatically, or immediately when the card is tapped).
 */
export default function FlashcardFolder({ cards, onStartReview, intervalMs = 4000 }: FlashcardFolderProps): ReactElement {
  const [index, setIndex] = useState<number>(0);
  const count: number = cards.length;
  const current: RecallCard | undefined = count > 0 ? cards[index % count] : undefined;
  const activeIndex: number = count > 0 ? index % count : 0;

  // Move to the next question after intervalMs. Re-arms after every change, so a tap restarts the timer.
  useEffect(() => {
    if (count < 2) return undefined;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => window.clearTimeout(id);
  }, [index, count, intervalMs]);

  const handleNext = (_event: MouseEvent<HTMLButtonElement>): void => {
    if (count > 1) setIndex((i) => (i + 1) % count);
  };
  const handleStart = (_event: MouseEvent<HTMLButtonElement>): void => onStartReview();

  return (
    <article className="kh-folder" aria-label="Due cards preview">
      <style>{CARD_CSS}</style>
      <div className="kh-folder-tab">
        <Layers size={13} aria-hidden="true" />
        Due today
        <span className="kh-folder-count">{cards.length}</span>
      </div>

      <div className="kh-folder-body">
        {current ? (
          <>
            <div className="kh-fc-wrap">
              <button type="button" className="kh-fc" onClick={handleNext} aria-label="Next flashcard">
                <span className="kh-fc-top">
                  <span className="kh-chip kh-tone-indigo">{current.sourceTitle || 'Recall card'}</span>
                </span>

                <span className="kh-fc-stage" aria-live="off">
                  <span className="kh-fc-face" data-active="true">
                    {current.prompt}
                  </span>
                </span>

                <span className="kh-fc-bottom">
                  <span className="kh-dots" aria-hidden="true">
                    {cards.slice(0, 6).map((card, i) => (
                      <span key={card.id} className="kh-dot" data-on={i === activeIndex} />
                    ))}
                  </span>
                </span>
              </button>
            </div>

            <button type="button" className="kh-cta" onClick={handleStart}>
              Start review <ArrowRight size={15} aria-hidden="true" />
            </button>
          </>
        ) : (
          <p className="kh-folder-empty">You&rsquo;re all caught up. No cards due right now.</p>
        )}
      </div>
    </article>
  );
}