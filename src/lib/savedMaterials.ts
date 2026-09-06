import { deleteDoc, doc, getDocs, orderBy, query, collection as fsCollection, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { CommunityLink } from '../types';

// A signed-in user's personal "Shared with me" / saved list lives at
// users/{uid}/savedMaterials/{materialId} — the doc id is always the
// original communityLinks id, so save/unsave is a single setDoc/deleteDoc
// by a known path rather than a query, and a material can't accidentally
// get saved twice under two different doc ids.
//
// This piggybacks on the existing `users/{uid}/{document=**}` security
// rule (read/write gated to request.auth.uid == uid), so it needs no new
// rules — a user can only ever read or write their own saved list.
//
// Fields are a denormalized snapshot of the material at save time, not a
// live reference: this list stays fully browsable/openable even if the
// original poster later edits or deletes their post (aside from the
// "delete" case, where the underlying file/link may itself be gone — the
// saved entry still shows what it *was*, same as e.g. a browser bookmark
// surviving a dead link).
export interface SavedMaterial {
  id: string; // == the original communityLinks doc id
  kind: 'link' | 'file';
  title: string;
  url: string;
  gradeLevel: string;
  subjectTag?: string;
  description: string;
  submittedBy: string;
  fileName?: string;
  fileType?: string;
  fileSizeBytes?: number;
  savedAt: string;
  savedAtMillis: number;
}

const SUBCOLLECTION = 'savedMaterials';

export async function saveMaterial(uid: string, material: CommunityLink): Promise<void> {
  const now = new Date();
  const saved: SavedMaterial = {
    id: material.id,
    kind: material.kind ?? 'link',
    title: material.title,
    url: material.url,
    gradeLevel: material.gradeLevel,
    ...(material.subjectTag ? { subjectTag: material.subjectTag } : {}),
    description: material.description,
    submittedBy: material.submittedBy,
    ...(material.fileName ? { fileName: material.fileName } : {}),
    ...(material.fileType ? { fileType: material.fileType } : {}),
    ...(material.fileSizeBytes ? { fileSizeBytes: material.fileSizeBytes } : {}),
    savedAt: now.toISOString(),
    savedAtMillis: now.getTime(),
  };
  await setDoc(doc(db, 'users', uid, SUBCOLLECTION, material.id), saved);
}

// Removes a material from this user's own saved list. This never touches
// the original communityLinks doc — it can't, since it writes only under
// users/{uid}, and there's no ownership check to make here because a user
// can always remove things from their own list regardless of who posted
// the original material.
export async function unsaveMaterial(uid: string, materialId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, SUBCOLLECTION, materialId));
}

export async function listSavedMaterials(uid: string): Promise<SavedMaterial[]> {
  const q = query(fsCollection(db, 'users', uid, SUBCOLLECTION), orderBy('savedAtMillis', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as SavedMaterial);
}