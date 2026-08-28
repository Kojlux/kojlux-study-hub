import { RecallCard } from '../types';

export type RecallRating = 'again' | 'hard' | 'good' | 'easy';

// A simplified SM-2 (SuperMemo-2) scheduler. This is the same family of
// algorithm behind Anki and most spaced-repetition apps: each review updates
// an "ease factor" and grows the interval between reviews when recall
// succeeds, and resets it when recall fails — which is what actually spaces
// the repetition instead of just re-showing everything daily.
export function scheduleNextReview(card: RecallCard, rating: RecallRating): RecallCard {
  let { easeFactor, intervalDays, reps } = card;

  if (rating === 'again') {
    reps = 0;
    intervalDays = 0; // due again today (short-term relearn)
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else {
    reps += 1;
    if (rating === 'hard') {
      easeFactor = Math.max(1.3, easeFactor - 0.15);
      intervalDays = reps === 1 ? 1 : Math.max(1, Math.round(intervalDays * 1.2));
    } else if (rating === 'good') {
      intervalDays = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(intervalDays * easeFactor);
    } else if (rating === 'easy') {
      easeFactor += 0.15;
      intervalDays = reps === 1 ? 3 : Math.round(intervalDays * easeFactor * 1.3);
    }
  }

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + Math.max(intervalDays, rating === 'again' ? 0 : 1));
  // "Again" cards come back later the same session, not tomorrow.
  if (rating === 'again') {
    dueAt.setMinutes(dueAt.getMinutes() + 10);
  }

  return {
    ...card,
    easeFactor,
    intervalDays,
    reps,
    dueAt: dueAt.toISOString(),
    lastResult: rating,
  };
}

export function makeRecallCard(params: {
  sourceType: RecallCard['sourceType'];
  sourceTitle: string;
  prompt: string;
  answer: string;
  image?: string;
  // When true, the card is due right away instead of after the usual
  // 5–10 hour delay. Used for Recall Coach batches built from Recents (the
  // student picked material they already studied), since there's no need
  // for a first-exposure gap the way there is for a brand-new quiz/summary.
  immediate?: boolean;
  // Optional collection to file this card into right away (only meaningful
  // when the card is saved — see `saved` below).
  collectionId?: string;
}): RecallCard {
  // Hand-typed cards are kept by default — there's no AI output to review
  // before deciding whether it's worth keeping. Every other source starts
  // unsaved; the student saves it explicitly from the Review screen.
  const saved = params.sourceType === 'manual';
  const createdAt = new Date();
  // First review lands exactly 3 hours after creation rather than
  // immediately. This spaces a freshly-generated batch of cards out instead
  // of dumping the whole quiz back into Review the second it's made, and
  // lines the first repetition up with when a "reviews are ready"
  // notification would actually be useful.
  const FIRST_REVIEW_DELAY_MS = 3 * 60 * 60 * 1000;
  const dueAt = params.immediate ? createdAt : new Date(createdAt.getTime() + FIRST_REVIEW_DELAY_MS);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    sourceType: params.sourceType,
    sourceTitle: params.sourceTitle,
    prompt: params.prompt,
    answer: params.answer,
    createdAt: createdAt.toISOString(),
    dueAt: dueAt.toISOString(),
    intervalDays: 0,
    easeFactor: 2.5,
    reps: 0,
    ...(params.image ? { image: params.image } : {}),
    saved,
    ...(saved && params.collectionId ? { collectionId: params.collectionId } : {}),
  };
}

// Small helper for lib/collections.ts style ID generation, reused wherever
// a new Collection needs an id (kept here since RecallCard ids already use
// this exact shape and there's no reason for a second convention).
export function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isDue(card: RecallCard): boolean {
  return new Date(card.dueAt).getTime() <= Date.now();
}