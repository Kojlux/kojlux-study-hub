import { addDoc, collection as fsCollection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { CommunityLink } from '../types';

const COLLECTION = 'communityLinks';

// Submits a lightweight link — title + URL + subject tag, nothing else.
// There is no file-upload path in this module at all, by design: it's
// structurally impossible for this function to write anything to Firebase
// Storage, since it never touches it.
export async function submitCommunityLink(input: {
  title: string;
  url: string;
  subjectTag: string;
  submittedBy: string;
}): Promise<void> {
  const title = input.title.trim();
  const url = input.url.trim();
  const subjectTag = input.subjectTag.trim();
  if (!title || !url || !subjectTag) {
    throw new Error('Title, URL, and subject tag are all required.');
  }
  // Cheap client-side sanity check that it's at least a well-formed URL.
  // Real validation (dead links, scheme allowlisting against e.g. javascript:)
  // belongs server-side in a Cloud Function trigger before this ships to
  // production — see the note in the chat response.
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) links are supported.');
  }
  await addDoc(fsCollection(db, COLLECTION), {
    title,
    url,
    subjectTag,
    subjectTagLower: subjectTag.toLowerCase(),
    submittedBy: input.submittedBy,
    createdAt: new Date().toISOString(),
  });
}

// "Starts with" search on the normalized subject tag, using Firestore's
// standard prefix-range trick (`>=` / `< tag + '\uf8ff'`) since Firestore has
// no native text search. Matches "algebra 1" against "Algebra 1", "Algebra 1
// - Chapter 3", etc. Not fuzzy/full-text — a search for "algebra" alone
// won't match a tag stored as "1st year Algebra".
export async function searchCommunityLinks(subjectQuery: string): Promise<CommunityLink[]> {
  const normalized = subjectQuery.trim().toLowerCase();
  if (!normalized) return [];
  const q = query(
    fsCollection(db, COLLECTION),
    orderBy('subjectTagLower'),
    where('subjectTagLower', '>=', normalized),
    where('subjectTagLower', '<', `${normalized}\uf8ff`),
    limit(25)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityLink));
}
