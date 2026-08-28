import { Collection } from '../types';
import { makeId } from './spacedRepetition';

// Pure helpers for Collections (student-named folders of saved cards), same
// shape as examReminders.ts / spacedRepetition.ts — no side effects, no
// storage calls. App.tsx owns the actual `collections` state array and
// persists it the same way it already does history/recallCards/examEvents.

export function makeCollection(name: string): Collection {
  return {
    id: makeId(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
}
