import {
  addDoc,
  collection as fsCollection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../firebase';
import { CommunityLink } from '../types';
import {
  MATERIAL_FILE_EXPIRY_DAYS,
  MATERIAL_MAX_FILE_SIZE_BYTES,
  MATERIAL_DESCRIPTION_MAX_WORDS,
} from '../constants';

const COLLECTION = 'communityLinks';

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function assertDescription(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) throw new Error('A short description is required.');
  if (wordCount(trimmed) > MATERIAL_DESCRIPTION_MAX_WORDS) {
    throw new Error(`Description must be ${MATERIAL_DESCRIPTION_MAX_WORDS} words or fewer.`);
  }
  return trimmed;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Submits a link — title + URL + grade level + description, nothing else.
// There is no file-upload path in this function at all, by design: it's
// structurally impossible for it to write anything to Firebase Storage,
// since it never touches it. See uploadCommunityFile below for the
// separate upload flow.
//
// `submittedBy` must be the poster's real Firebase Auth uid — posting is
// signed-in-only now (the UI only ever calls this when currentUserId is
// set; see MaterialsHub.tsx). The check below is a client-side backstop;
// the actual enforcement is the Firestore rule requiring
// `request.resource.data.submittedBy == request.auth.uid`.
export async function submitCommunityLink(input: {
  title: string;
  url: string;
  gradeLevel: string;
  description: string;
  subjectTag?: string;
  submittedBy: string;
}): Promise<void> {
  const title = input.title.trim();
  const url = input.url.trim();
  const gradeLevel = input.gradeLevel.trim();
  const description = assertDescription(input.description);
  const subjectTag = input.subjectTag?.trim();
  if (!title || !url || !gradeLevel) {
    throw new Error('Title, URL, and grade level are all required.');
  }
  if (!input.submittedBy) {
    throw new Error('You must be signed in to share a material.');
  }
  // Cheap client-side sanity check that it's at least a well-formed URL.
  // Real validation (dead links, scheme allowlisting against e.g. javascript:)
  // belongs server-side in a Cloud Function trigger before this ships to
  // production.
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) links are supported.');
  }
  const now = new Date();
  await addDoc(fsCollection(db, COLLECTION), {
    kind: 'link',
    title,
    titleLower: title.toLowerCase(),
    url,
    gradeLevel,
    gradeLevelLower: gradeLevel.toLowerCase(),
    description,
    ...(subjectTag ? { subjectTag, subjectTagLower: subjectTag.toLowerCase() } : {}),
    submittedBy: input.submittedBy,
    createdAt: now.toISOString(),
    createdAtMillis: now.getTime(),
  });
}

// Uploads a file (image/video/PDF/doc/whatever) directly to Firebase
// Storage and records it in the same `communityLinks` collection as links,
// with kind: 'file'. Two things keep this cheap:
//  - MATERIAL_MAX_FILE_SIZE_BYTES caps every upload at 15MB.
//  - `expiresAt`/`createdAtMillis` mark the file for auto-deletion after
//    MATERIAL_FILE_EXPIRY_DAYS (~75 days) — see sweepExpiredMaterials
//    below and MATERIALS_SETUP.md for the security-rules side of this.
//
// The upload is made with `contentDisposition: attachment`, so the
// download URL Storage hands back always forces a browser download rather
// than opening an inline preview tab — the same "you have to save it
// before you can open it" experience as a file someone sends you on a
// phone. That means MaterialsHub can treat file results exactly like link
// results: window.open(material.url) and the browser does the right thing.
export async function uploadCommunityFile(input: {
  file: File;
  title: string;
  gradeLevel: string;
  description: string;
  subjectTag?: string;
  submittedBy: string;
}): Promise<void> {
  const { file } = input;
  const title = input.title.trim();
  const gradeLevel = input.gradeLevel.trim();
  const description = assertDescription(input.description);
  const subjectTag = input.subjectTag?.trim();
  if (!title || !gradeLevel) {
    throw new Error('Title and grade level are both required.');
  }
  if (!input.submittedBy) {
    throw new Error('You must be signed in to share a material.');
  }
  if (file.size > MATERIAL_MAX_FILE_SIZE_BYTES) {
    const capMb = Math.round(MATERIAL_MAX_FILE_SIZE_BYTES / (1024 * 1024));
    throw new Error(`That file is too large (max ${capMb}MB). Try a link instead for bigger files.`);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + MATERIAL_FILE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const safeName = sanitizeFileName(file.name || 'material');
  const storagePath = `materials/${input.submittedBy}/${now.getTime()}_${safeName}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, {
    contentType: file.type || 'application/octet-stream',
    contentDisposition: `attachment; filename="${safeName}"`,
  });
  const url = await getDownloadURL(storageRef);

  try {
    await addDoc(fsCollection(db, COLLECTION), {
      kind: 'file',
      title,
      titleLower: title.toLowerCase(),
      url,
      gradeLevel,
      gradeLevelLower: gradeLevel.toLowerCase(),
      description,
      ...(subjectTag ? { subjectTag, subjectTagLower: subjectTag.toLowerCase() } : {}),
      submittedBy: input.submittedBy,
      createdAt: now.toISOString(),
      createdAtMillis: now.getTime(),
      fileName: file.name,
      fileType: file.type,
      fileSizeBytes: file.size,
      storagePath,
      expiresAt: expiresAt.toISOString(),
      expiresAtMillis: expiresAt.getTime(),
    });
  } catch (err) {
    // Firestore write failed after the upload succeeded — clean up the
    // orphaned Storage object rather than leaving unlisted, undeletable
    // bytes behind.
    await deleteObject(storageRef).catch(() => {});
    throw err;
  }
}

// Deletes a material (link or file) the caller owns.
//
// `requesterId` is the caller's Firebase Auth uid; `ownerId` is the
// `submittedBy` value already on the doc, passed in by the caller (who
// read it off the material object being deleted) so this function never
// has to re-fetch the doc just to check who owns it.
//
// Posting is signed-in-only now (see submitCommunityLink/uploadCommunityFile),
// so `submittedBy` on every doc is always a real uid — the
// `ownerId !== requesterId` check below is backed by the matching Firestore
// rule (`request.auth.uid == resource.data.submittedBy`), not just a
// client-side courtesy the way it would be for an unverified guest id.
export async function deleteCommunityMaterial(input: {
  id: string;
  ownerId: string;
  requesterId: string;
  storagePath?: string;
}): Promise<void> {
  if (!input.requesterId || input.ownerId !== input.requesterId) {
    throw new Error("You can only delete your own posts.");
  }
  // Storage cleanup first (mirrors the rollback order in uploadCommunityFile):
  // if this fails we still want the Firestore doc gone rather than leaving a
  // visible post the owner can't get rid of. A missing/already-deleted
  // Storage object is not a reason to block the doc delete.
  if (input.storagePath) {
    await deleteObject(ref(storage, input.storagePath)).catch(() => {});
  }
  await deleteDoc(doc(db, COLLECTION, input.id));
}

function normalizeMaterial(id: string, data: any): CommunityLink {
  // Docs written before file uploads/grade levels existed only have
  // title/url/subjectTag/submittedBy/createdAt — fill in sane defaults so
  // older links keep rendering correctly instead of showing "undefined".
  return {
    id,
    kind: data.kind ?? 'link',
    title: data.title ?? '',
    titleLower: data.titleLower ?? (data.title ?? '').toLowerCase(),
    url: data.url ?? '',
    subjectTag: data.subjectTag,
    subjectTagLower: data.subjectTagLower,
    gradeLevel: data.gradeLevel ?? '',
    gradeLevelLower: data.gradeLevelLower ?? (data.gradeLevel ?? '').toLowerCase(),
    description: data.description ?? '',
    submittedBy: data.submittedBy ?? 'guest',
    createdAt: data.createdAt ?? new Date(0).toISOString(),
    createdAtMillis: data.createdAtMillis ?? 0,
    fileName: data.fileName,
    fileType: data.fileType,
    fileSizeBytes: data.fileSizeBytes,
    storagePath: data.storagePath,
    expiresAt: data.expiresAt,
    expiresAtMillis: data.expiresAtMillis,
  };
}

// "Recent" browse view for the default state of the Materials page — no
// search text typed yet. Ordered by createdAtMillis (numeric; the same
// field the auto-delete sweep and its security rules already key on) so
// newly shared materials surface first. Needs no composite index: it's a
// single-field orderBy with no `where` clause, which Firestore indexes
// automatically.
//
// NOTE: a doc written before createdAtMillis existed (very old links —
// see normalizeMaterial's defaults above) has no value for this field at
// all in Firestore, and Firestore's orderBy excludes documents missing the
// ordered field entirely. In practice that only affects a handful of
// legacy docs, if any exist; they'd still surface via search on title or
// grade level, just not in this recent-first browse list.
export async function listRecentCommunityMaterials(limitCount = 30): Promise<CommunityLink[]> {
  const recentQuery = query(fsCollection(db, COLLECTION), orderBy('createdAtMillis', 'desc'), limit(limitCount));
  const snap = await getDocs(recentQuery);
  return snap.docs.map((d) => normalizeMaterial(d.id, d.data()));
}

// "Starts with" search, using Firestore's standard prefix-range trick
// (`>=` / `< text + '\uf8ff'`) since Firestore has no native full-text
// search. Run against both the title and the grade level — those are the
// two fields a search here is meant to match — as two separate queries
// merged client-side, rather than one combined Firestore `or()` query, so
// each half only ever needs the simple single-field index Firestore
// already builds automatically. Not fuzzy: a search for "algebra" won't
// match a title stored as "Intro to Algebra" since that's not a prefix.
export async function searchCommunityMaterials(searchText: string): Promise<CommunityLink[]> {
  const normalized = searchText.trim().toLowerCase();
  if (!normalized) return [];

  const byTitle = query(
    fsCollection(db, COLLECTION),
    orderBy('titleLower'),
    where('titleLower', '>=', normalized),
    where('titleLower', '<', `${normalized}\uf8ff`),
    limit(25)
  );
  const byGrade = query(
    fsCollection(db, COLLECTION),
    orderBy('gradeLevelLower'),
    where('gradeLevelLower', '>=', normalized),
    where('gradeLevelLower', '<', `${normalized}\uf8ff`),
    limit(25)
  );

  const [titleSnap, gradeSnap] = await Promise.all([getDocs(byTitle), getDocs(byGrade)]);

  const merged = new Map<string, CommunityLink>();
  for (const d of [...titleSnap.docs, ...gradeSnap.docs]) {
    merged.set(d.id, normalizeMaterial(d.id, d.data()));
  }

  return Array.from(merged.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Best-effort cleanup, run opportunistically (e.g. once when the Materials
// page loads) rather than on a schedule: finds a small batch of file
// uploads past their expiresAt date, deletes the Storage object for each,
// then removes its Firestore doc. This exists so uploaded files actually
// get cleaned up without needing a Cloud Functions scheduled job (which
// requires the Blaze plan's scheduler + Cloud Scheduler, a further step
// beyond what Storage itself needs) — see MATERIALS_SETUP.md for a
// drop-in scheduled-function version if/when that's set up, which would
// be more reliable than this since it doesn't depend on someone opening
// the app after a file expires. Failures are swallowed per-item so one bad
// doc can't block the rest of the sweep, and this never throws — it's not
// on the critical path for loading or posting materials.
export async function sweepExpiredMaterials(): Promise<void> {
  try {
    // Query by expiresAtMillis (numeric) rather than the ISO expiresAt
    // string — this is the same field the security rules use to grant
    // "anyone can delete this once it's expired" permission, so client
    // query and rule stay in sync on what "expired" means.
    const cutoffMillis = Date.now();
    const dueQuery = query(
      fsCollection(db, COLLECTION),
      where('kind', '==', 'file'),
      where('expiresAtMillis', '<', cutoffMillis),
      limit(10)
    );
    const snap = await getDocs(dueQuery);
    for (const d of snap.docs) {
      const data = d.data() as any;
      try {
        if (data.storagePath) {
          await deleteObject(ref(storage, data.storagePath));
        }
        await deleteDoc(doc(db, COLLECTION, d.id));
      } catch {
        // Leave this one for the next sweep.
      }
    }
  } catch {
    // Never let a failed sweep surface to the UI.
  }
}