import type { CSSProperties, MouseEvent, ReactElement } from 'react';
import { Folder } from 'lucide-react';
import type { Collection, RecallCard } from '../../types';
import type { TagTone } from './types';
import { pluralize } from './utils';

interface SavedCollectionsProps {
  collections: readonly Collection[];
  cards: readonly RecallCard[];
  onOpen: (collection: Collection) => void;
}

interface CollectionRowProps {
  collection: Collection;
  cards: readonly RecallCard[];
  index: number;
  onOpen: (collection: Collection) => void;
}

/** Custom properties are not part of CSSProperties, so give them a name. */
type StaggerStyle = CSSProperties & { '--i': number };
const TONES: readonly TagTone[] = ['emerald', 'indigo', 'sky', 'rose'];

function CollectionRow({ collection, cards, index, onOpen }: CollectionRowProps): ReactElement {
  const collectionCards: RecallCard[] = cards.filter((card) => card.saved && card.collectionId === collection.id);
  const masteredCount: number = collectionCards.filter((card) => card.reps >= 3 && card.intervalDays >= 7).length;
  const percent: number = collectionCards.length > 0 ? Math.round((masteredCount / collectionCards.length) * 100) : 0;
  const style: StaggerStyle = { '--i': index };
  const tone: TagTone = TONES[index % TONES.length];
  const handleClick = (_event: MouseEvent<HTMLButtonElement>): void => onOpen(collection);

  return (
    <li className="kh-collection-item" style={style}>
      <article>
        <button type="button" className={`kh-collection kh-tone-${tone}`} onClick={handleClick}>
          <span className="kh-collection-icon" aria-hidden="true">
            <Folder size={18} strokeWidth={2} />
          </span>
          <span className="kh-collection-copy">
            <span className="kh-collection-head">
              <span className="kh-collection-name">{collection.name}</span>
              <span className="kh-chip">Saved set</span>
            </span>
            <span className="kh-collection-meta">
              {pluralize(collectionCards.length, 'card')} &bull; {percent}% mastered
            </span>
            <span className="kh-meter" role="presentation">
              <span className="kh-meter-fill" style={{ width: `${percent}%` }} />
            </span>
          </span>
        </button>
      </article>
    </li>
  );
}

/** Stacked folder rows with a staggered entrance (delay driven by --i). */
export default function SavedCollections({ collections, cards, onOpen }: SavedCollectionsProps): ReactElement {
  return (
    <section className="kh-saved-collections" aria-labelledby="kh-collections-title">
      <h2 id="kh-collections-title" className="kh-section-title">
        Saved collections
      </h2>
      {collections.length > 0 ? (
        <ul className="kh-collections">
          {collections.map((collection, index) => (
            <CollectionRow key={collection.id} collection={collection} cards={cards} index={index} onOpen={onOpen} />
          ))}
        </ul>
      ) : (
        <p className="kh-folder-empty">Saved sets will show up here.</p>
      )}
    </section>
  );
}
