import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Collection, RecallCard, SharedCardSnapshot, SharedCollectionSnapshot } from '../types';

const COLLECTION = 'sharedCards';
const COLLECTIONS = 'sharedCollections';

// Publishes (or re-publishes) the public snapshot a `/card/:id` link
// resolves to. Uses setDoc keyed on the card's own id — not addDoc — so
// tapping Share again on the same card overwrites its snapshot instead of
// piling up duplicates. Only ever writes the fields on SharedCardSnapshot:
// no schedule/ease/reps/collectionId ever leaves the sender's private
// recallCards subcollection.
export async function publishSharedCard(card: RecallCard): Promise<void> {
  const snapshot: SharedCardSnapshot = {
    id: card.id,
    prompt: card.prompt,
    answer: card.answer,
    sourceTitle: card.sourceTitle,
    sharedAt: new Date().toISOString(),
  };
  // Firestore's setDoc throws synchronously on a literal `undefined` field —
  // only include `image` when the card actually has one, rather than
  // writing `image: undefined`.
  if (card.image) snapshot.image = card.image;
  await setDoc(doc(db, COLLECTION, card.id), snapshot);
}

// Resolves a deep-linked card id to its public snapshot. Returns null if the
// card was never shared (or the share was later removed) — callers should
// treat that as "this link doesn't point to anything," not as an error.
export async function fetchSharedCard(cardId: string): Promise<SharedCardSnapshot | null> {
  const snap = await getDoc(doc(db, COLLECTION, cardId));
  return snap.exists() ? (snap.data() as SharedCardSnapshot) : null;
}

export async function publishSharedCollection(collection: Collection, cards: RecallCard[]): Promise<void> {
  const snapshot: SharedCollectionSnapshot = {
    id: collection.id,
    name: collection.name,
    cards: cards.map(({ id, prompt, answer, sourceTitle, image }) => ({ id, prompt, answer, sourceTitle, ...(image ? { image } : {}) })),
    sharedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, COLLECTIONS, collection.id), snapshot);
}

export async function fetchSharedCollection(collectionId: string): Promise<SharedCollectionSnapshot | null> {
  const snap = await getDoc(doc(db, COLLECTIONS, collectionId));
  return snap.exists() ? (snap.data() as SharedCollectionSnapshot) : null;
}
