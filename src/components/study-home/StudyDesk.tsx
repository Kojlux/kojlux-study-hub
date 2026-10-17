import type { ReactElement } from 'react';
import type { Collection, RecallCard } from '../../types';
import type { NavigateHandler } from './types';
import FlashcardFolder from './FlashcardFolder';
import SavedCollections from './SavedCollections';

interface StudyDeskProps {
  dueCards: readonly RecallCard[];
  collections: readonly Collection[];
  recallCards: readonly RecallCard[];
  onNavigate: NavigateHandler;
  onOpenCollection?: (collection: Collection) => void;
}

/** Right column: the "Study Desk" with due cards and saved collections. */
export default function StudyDesk({ dueCards, collections, recallCards, onNavigate, onOpenCollection }: StudyDeskProps): ReactElement {
  return (
    <aside className="kh-desk" aria-label="Study desk">
      <FlashcardFolder cards={dueCards} onStartReview={() => onNavigate('review')} />
      <SavedCollections
        collections={collections}
        cards={recallCards}
        onOpen={onOpenCollection ?? (() => onNavigate('review'))}
      />
    </aside>
  );
}