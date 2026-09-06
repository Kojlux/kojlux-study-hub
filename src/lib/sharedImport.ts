import { RecallCard, SharedCardSnapshot, SharedCollectionCard } from '../types';
import { makeRecallCard } from './spacedRepetition';

// Turns a public share snapshot (no schedule/ease/reps/collectionId — see
// SharedCardSnapshot in types.ts) into a brand-new RecallCard scoped to
// whoever is importing it. makeRecallCard() already gives every card a
// fresh id via makeId()'s Date.now()+random scheme, so this can never
// collide with the original owner's card — the import is a clone, not a
// reference.
//
// sourceType 'shared' is what marks a card as having come in this way (see
// the RecallCard.sourceType comment in types.ts) rather than pretending the
// importing student typed or generated it themselves.
//
// makeRecallCard() only sets `saved: true` for sourceType 'manual', so a
// shared card needs that (and any target collectionId) applied afterward —
// otherwise an imported card would silently NOT show up in the student's
// saved-cards library until they saved it a second time by hand.
export function cardFromSharedSnapshot(
  snapshot: SharedCardSnapshot | SharedCollectionCard,
  collectionId?: string
): RecallCard {
  const card = makeRecallCard({
    sourceType: 'shared',
    sourceTitle: snapshot.sourceTitle,
    prompt: snapshot.prompt,
    answer: snapshot.answer,
    image: snapshot.image,
    immediate: true,
  });
  return {
    ...card,
    saved: true,
    ...(collectionId ? { collectionId } : {}),
  };
}
