import type { FocusEvent, MouseEvent, ReactElement } from 'react';
import { ArrowRight, Layers } from 'lucide-react';
import type { RecallCard } from '../../types';
import type { FlashcardCycle } from './types';
import { useFlashcardCycle } from './hooks';

interface FlashcardFolderProps {
  cards: readonly RecallCard[];
  onStartReview: () => void;
  /** Time between flips. Defaults to 4000ms. */
  intervalMs?: number;
}

/**
 * "Due cards" preview styled as a physical folder: an absolute-positioned
 * tab, a gradient folder body, and two sheets peeking out behind the card.
 * Front and back faces are stacked in one grid cell and cross-faded.
 */
export default function FlashcardFolder({ cards, onStartReview, intervalMs = 4000 }: FlashcardFolderProps): ReactElement {
  const { frontIndex, backIndex, isFlipped, flip, setPaused }: FlashcardCycle = useFlashcardCycle(cards, intervalMs);

  const handlePause = (): void => setPaused(true);
  const handleResume = (): void => setPaused(false);
  const handleBlur = (event: FocusEvent<HTMLElement>): void => {
    // Only resume once focus has left the whole folder, not just moved between its buttons.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
  };
  const handleFlip = (_event: MouseEvent<HTMLButtonElement>): void => flip();
  const handleStart = (_event: MouseEvent<HTMLButtonElement>): void => onStartReview();

  const front: RecallCard | undefined = cards[frontIndex];
  const back: RecallCard | undefined = cards[backIndex];

  return (
    <article
      className="kh-folder"
      aria-label="Due cards preview"
      onMouseEnter={handlePause}
      onMouseLeave={handleResume}
      onFocus={handlePause}
      onBlur={handleBlur}
    >
      <div className="kh-folder-tab">
        <Layers size={13} aria-hidden="true" />
        Due today
        <span className="kh-folder-count">{cards.length}</span>
      </div>

      <div className="kh-folder-body">
        {front && back ? (
          <>
            <div className="kh-fc-wrap">
              <button type="button" className="kh-fc" onClick={handleFlip} aria-label="Flip flashcard">
                <span className="kh-fc-top">
                  <span className="kh-chip kh-tone-indigo">{front.sourceTitle || 'Recall card'}</span>
                  <span className="kh-fc-side" aria-hidden="true">
                    {isFlipped ? 'Answer' : 'Question'}
                  </span>
                </span>

                <span className="kh-fc-stage" aria-live="off">
                  <span className="kh-fc-face" data-active={!isFlipped} aria-hidden={isFlipped}>
                    {front.prompt}
                  </span>
                  <span className="kh-fc-face kh-fc-face--back" data-active={isFlipped} aria-hidden={!isFlipped}>
                    {back.answer}
                  </span>
                </span>

                <span className="kh-fc-bottom">
                  <span className="kh-dots" aria-hidden="true">
                    {cards.slice(0, 6).map((card, index) => (
                      <span key={card.id} className="kh-dot" data-on={index === frontIndex} />
                    ))}
                  </span>
                  <span className="kh-fc-hint">Tap to flip</span>
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
