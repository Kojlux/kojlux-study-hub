import React, { useEffect, useState } from 'react';
import { Link2, Search, ExternalLink, PlusCircle, Loader2, FileText, Upload, Trash2, X, Check, Heart, Users } from 'lucide-react';
import { CommunityLink } from '../types';
import {
  GRADE_LEVEL_OPTIONS,
  MATERIAL_ACCEPTED_FILE_TYPES,
  MATERIAL_DESCRIPTION_MAX_WORDS,
  MATERIAL_MAX_FILE_SIZE_BYTES,
} from '../constants';
import {
  deleteCommunityMaterial,
  listRecentCommunityMaterials,
  searchCommunityMaterials,
  submitCommunityLink,
  sweepExpiredMaterials,
  uploadCommunityFile,
} from '../lib/communityLinks';
import { listSavedMaterials, saveMaterial, unsaveMaterial, SavedMaterial } from '../lib/savedMaterials';
import { ToastProvider, useToast } from './Toast';
import Modal from './Modal';

interface Props {
  currentUserId: string | null; // Firebase Auth uid, or null when signed out
  defaultGradeLevel?: string;
  onError: (msg: string) => void;
}

export default function MaterialsHub({ currentUserId, defaultGradeLevel, onError }: Props) {
  return (
    <ToastProvider>
      <MaterialsHubInner currentUserId={currentUserId} defaultGradeLevel={defaultGradeLevel} onError={onError} />
    </ToastProvider>
  );
}

function MaterialsHubInner({ currentUserId, defaultGradeLevel, onError }: Props) {
  const { showToast } = useToast();
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<CommunityLink[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [searching, setSearching] = useState(false);
  // Whether `results` currently holds explicit search results (true) or the
  // default recent-materials browse list (false) — controls which empty
  // state to show below.
  const [searched, setSearched] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  // Id of the material currently showing its inline "delete this?" row.
  // Only one at a time — opening a new one implicitly closes any other.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 'browse' is the public feed (search/recent); 'saved' is this user's
  // own "Shared with me" list. Only meaningful for signed-in users — the
  // saved list lives under users/{uid}, which guests don't have.
  const [activeTab, setActiveTab] = useState<'browse' | 'saved'>('browse');
  const [savedMaterials, setSavedMaterials] = useState<SavedMaterial[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  // Ids currently saved, for showing a filled heart in the Browse tab.
  // Kept separate from `savedMaterials` (which holds the fuller denormalized
  // records used by the Saved tab) since Browse only needs membership.
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [togglingSaveId, setTogglingSaveId] = useState<string | null>(null);
  const [removingSavedId, setRemovingSavedId] = useState<string | null>(null);

  const loadSaved = async () => {
    if (!currentUserId) return;
    setLoadingSaved(true);
    try {
      const saved = await listSavedMaterials(currentUserId);
      setSavedMaterials(saved);
      setSavedIds(new Set(saved.map((m) => m.id)));
    } catch (err) {
      console.error('Failed to load saved materials', err);
      onError("Couldn't load your saved materials right now.");
    } finally {
      setLoadingSaved(false);
    }
  };

  // Load once on mount for signed-in users so the Browse tab's heart icons
  // start in the right state without waiting for the person to open the
  // Saved tab first.
  useEffect(() => {
    if (currentUserId) void loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const toggleSave = async (material: CommunityLink) => {
    if (!currentUserId) return;
    const alreadySaved = savedIds.has(material.id);
    setTogglingSaveId(material.id);
    try {
      if (alreadySaved) {
        await unsaveMaterial(currentUserId, material.id);
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(material.id);
          return next;
        });
        setSavedMaterials((prev) => prev.filter((m) => m.id !== material.id));
      } else {
        await saveMaterial(currentUserId, material);
        setSavedIds((prev) => new Set(prev).add(material.id));
        // Cheap client-side refresh rather than a full reload — good enough
        // since the Saved tab re-fetches from scratch every time it's opened.
        void loadSaved();
      }
    } catch (err) {
      console.error('Failed to update saved materials', err);
      onError("Couldn't update your saved list right now.");
    } finally {
      setTogglingSaveId(null);
    }
  };

  const removeSaved = async (material: SavedMaterial) => {
    if (!currentUserId) return;
    setRemovingSavedId(material.id);
    try {
      await unsaveMaterial(currentUserId, material.id);
      setSavedMaterials((prev) => prev.filter((m) => m.id !== material.id));
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(material.id);
        return next;
      });
    } catch (err) {
      console.error('Failed to remove saved material', err);
      onError("Couldn't remove that from your list right now.");
    } finally {
      setRemovingSavedId(null);
    }
  };

  // The default view of this page: whatever's been shared most recently,
  // no search required. Runs on mount, and again right after a student
  // shares something, so their own material shows up immediately instead
  // of requiring them to already know what to search for.
  const loadRecent = async () => {
    setLoadingRecent(true);
    try {
      const recent = await listRecentCommunityMaterials();
      setResults(recent);
      setSearched(false);
    } catch (err) {
      console.error('Failed to load recent materials', err);
      onError("Couldn't load materials right now.");
    } finally {
      setLoadingRecent(false);
    }
  };

  // Fire-and-forget: quietly clears out a small batch of expired uploads
  // whenever a student opens this page. Never blocks the UI or surfaces
  // errors — see sweepExpiredMaterials in lib/communityLinks.ts.
  useEffect(() => {
    void sweepExpiredMaterials();
    void loadRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = async () => {
    if (!queryText.trim()) {
      // Cleared back to empty — fall back to the recent-materials browse
      // list instead of leaving stale search results on screen.
      void loadRecent();
      return;
    }
    setSearching(true);
    try {
      const found = await searchCommunityMaterials(queryText);
      setResults(found);
      setSearched(true);
    } catch (err) {
      console.error('Materials search failed', err);
      onError("Couldn't search materials right now.");
    } finally {
      setSearching(false);
    }
  };

  // For a link, this hands the URL straight to the browser/OS. For an
  // uploaded file it does exactly the same thing — the file was uploaded
  // with a `contentDisposition: attachment` header (see
  // uploadCommunityFile in lib/communityLinks.ts), so the browser
  // downloads it to the student's device instead of opening a preview,
  // the same "you have to save it to open it" experience either way.
  // Nothing is fetched or proxied through our own servers here.
  const openMaterial = (material: { url: string }) => {
    window.open(material.url, '_blank', 'noopener,noreferrer');
  };

  // Ownership is real here, not a courtesy: submittedBy on every doc is now
  // always the poster's Firebase Auth uid (see communityLinks.ts — posting
  // requires currentUserId), so this comparison is exactly what the
  // Firestore delete rule also checks server-side.
  const isOwnMaterial = (material: CommunityLink) => !!currentUserId && material.submittedBy === currentUserId;

  const handleDelete = async (material: CommunityLink) => {
    if (!currentUserId) return;
    setDeletingId(material.id);
    try {
      await deleteCommunityMaterial({
        id: material.id,
        ownerId: material.submittedBy,
        requesterId: currentUserId,
        storagePath: material.storagePath,
      });
      setResults((prev) => prev.filter((m) => m.id !== material.id));
      showToast('Removed');
    } catch (err) {
      console.error('Failed to delete material', err);
      onError(err instanceof Error ? err.message : "Couldn't delete that — please try again.");
    } finally {
      setDeletingId(null);
      setConfirmingDeleteId(null);
    }
  };

  const hostnameOf = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          <Link2 className="w-3.5 h-3.5 text-focus-primary" /> Materials
        </span>
        <button
          type="button"
          onClick={() => (currentUserId ? setShowSubmit(true) : onError('Sign in to share a material.'))}
          title={currentUserId ? 'Share a study material with other students' : 'Sign in to share a material'}
          className={`flex items-center gap-1 text-[11px] font-bold ${
            currentUserId ? 'text-focus-primary' : 'text-slate-400'
          }`}
        >
          <PlusCircle className="w-3.5 h-3.5" /> Share material
        </button>
      </div>

      {!currentUserId && (
        <p className="text-[10px] text-slate-400 text-center">Sign in to share a material or save one to Shared with me.</p>
      )}

      {currentUserId && (
        <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('browse')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'browse' ? 'bg-white dark:bg-slate-900 text-focus-primary shadow-sm' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" /> Browse
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'saved' ? 'bg-white dark:bg-slate-900 text-focus-primary shadow-sm' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Shared with me
          </button>
        </div>
      )}

      {activeTab === 'browse' && (
      <div className="flex gap-2">
        <input
          value={queryText}
          onChange={(e) => {
            const next = e.target.value;
            setQueryText(next);
            if (!next.trim() && searched) void loadRecent();
          }}
          onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          placeholder='Search by title or grade level, e.g. "Algebra" or "High School"'
          className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary"
        />
        <button
          onClick={runSearch}
          disabled={searching || !queryText.trim()}
          title="Search"
          className="px-4 bg-focus-primary text-white rounded-xl disabled:opacity-50 flex items-center justify-center"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </button>
      </div>
      )}

      {activeTab === 'browse' && (loadingRecent || searching) && (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 text-focus-primary animate-spin" />
        </div>
      )}

      {activeTab === 'browse' &&
        !loadingRecent &&
        !searching &&
        (results.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-3">
            {searched ? (
              <>No materials found for &ldquo;{queryText}&rdquo; — be the first to share one.</>
            ) : (
              'No materials shared yet — be the first!'
            )}
          </p>
        ) : (
          <div className="space-y-2">
            {results.map((material) => {
              const mine = isOwnMaterial(material);
              const confirming = confirmingDeleteId === material.id;
              const busy = deletingId === material.id;
              return (
                <div
                  key={material.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden"
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openMaterial(material)}
                      disabled={confirming}
                      className="flex-1 min-w-0 text-left flex items-center justify-between gap-2 p-3 hover:border-focus-primary transition disabled:opacity-60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{material.title}</span>
                        <span className="block text-[10px] text-slate-400 truncate">
                          {material.gradeLevel}
                          {material.kind === 'file'
                            ? ` · ${material.fileType?.split('/')[0] || 'File'} · ${formatSize(material.fileSizeBytes)}`
                            : ` · ${hostnameOf(material.url)}`}
                        </span>
                        {material.description && (
                          <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {material.description}
                          </span>
                        )}
                      </span>
                      {material.kind === 'file' ? (
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      ) : (
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                    </button>

                    {currentUserId && !mine && !confirming && (
                      <button
                        type="button"
                        onClick={() => void toggleSave(material)}
                        disabled={togglingSaveId === material.id}
                        title={savedIds.has(material.id) ? 'Remove from Shared with me' : 'Save to Shared with me'}
                        className={`shrink-0 p-3 transition disabled:opacity-50 ${
                          savedIds.has(material.id) ? 'text-focus-primary' : 'text-slate-400 hover:text-focus-primary'
                        }`}
                      >
                        {togglingSaveId === material.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Heart className="w-3.5 h-3.5" fill={savedIds.has(material.id) ? 'currentColor' : 'none'} />
                        )}
                      </button>
                    )}

                    {mine && !confirming && (
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(material.id)}
                        title="Delete this post"
                        className="shrink-0 p-3 text-slate-400 hover:text-red-500 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {confirming && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/30 border-t border-red-100 dark:border-red-900/40">
                      <span className="text-[11px] font-bold text-red-600 dark:text-red-400">Delete this post?</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteId(null)}
                          disabled={busy}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 disabled:opacity-50"
                        >
                          <X className="w-3 h-3" /> Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(material)}
                          disabled={busy}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white bg-red-500 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          {busy ? 'Deleting…' : 'Confirm'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

      {activeTab === 'saved' && loadingSaved && (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 text-focus-primary animate-spin" />
        </div>
      )}

      {activeTab === 'saved' && !loadingSaved && (
        savedMaterials.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-3">
            Nothing saved yet — tap the heart on anything in Browse to keep it here.
          </p>
        ) : (
          <div className="space-y-4">
            {groupBySubject(savedMaterials).map(([subject, group]) => (
              <div key={subject} className="space-y-2">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">{subject}</span>
                {group.map((material) => {
                  const removing = removingSavedId === material.id;
                  return (
                    <div
                      key={material.id}
                      className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => openMaterial(material)}
                        className="flex-1 min-w-0 text-left flex items-center justify-between gap-2 p-3 hover:border-focus-primary transition"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{material.title}</span>
                          <span className="block text-[10px] text-slate-400 truncate">
                            {material.gradeLevel}
                            {material.kind === 'file'
                              ? ` · ${material.fileType?.split('/')[0] || 'File'} · ${formatSize(material.fileSizeBytes)}`
                              : ` · ${hostnameOf(material.url)}`}
                          </span>
                        </span>
                        {material.kind === 'file' ? (
                          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                      </button>
                      {/* Removes this from the user's own saved list only —
                          never the original post, which they don't own. */}
                      <button
                        type="button"
                        onClick={() => void removeSaved(material)}
                        disabled={removing}
                        title="Remove from Shared with me"
                        className="shrink-0 p-3 text-slate-400 hover:text-red-500 transition disabled:opacity-50"
                      >
                        {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )
      )}

      {showSubmit && currentUserId && (
        <SubmitMaterialModal
          submitterId={currentUserId}
          defaultGradeLevel={defaultGradeLevel}
          onClose={() => setShowSubmit(false)}
          onDone={() => {
            setShowSubmit(false);
            showToast('Material shared');
            // Show the student's own material immediately rather than
            // requiring them to search for it — reload whichever list is
            // currently active.
            if (searched) void runSearch();
            else void loadRecent();
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

// Groups a saved-materials list by subjectTag so a student's "Shared with
// me" list separates out different classmates' subjects instead of being
// one flat pile. Anything without a tag lands in a single 'Other' bucket
// rather than one bucket per untagged item. Subjects are sorted
// alphabetically with 'Other' always last, since it isn't a real subject.
function groupBySubject(materials: SavedMaterial[]): [string, SavedMaterial[]][] {
  const groups = new Map<string, SavedMaterial[]>();
  for (const material of materials) {
    const key = material.subjectTag?.trim() || 'Other';
    const list = groups.get(key);
    if (list) list.push(material);
    else groups.set(key, [material]);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => {
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });
}

type SubmitMode = 'link' | 'file';

function SubmitMaterialModal({
  submitterId,
  defaultGradeLevel,
  onClose,
  onDone,
  onError,
}: {
  submitterId: string;
  defaultGradeLevel?: string;
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [mode, setMode] = useState<SubmitMode>('link');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [gradeLevel, setGradeLevel] = useState(defaultGradeLevel ?? GRADE_LEVEL_OPTIONS[2]);
  const [subjectTag, setSubjectTag] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const wordCount = description.trim() ? description.trim().split(/\s+/).filter(Boolean).length : 0;
  const overWordLimit = wordCount > MATERIAL_DESCRIPTION_MAX_WORDS;
  const capMb = Math.round(MATERIAL_MAX_FILE_SIZE_BYTES / (1024 * 1024));
  const fileTooBig = !!file && file.size > MATERIAL_MAX_FILE_SIZE_BYTES;

  const canSubmit =
    title.trim().length > 0 &&
    gradeLevel.trim().length > 0 &&
    description.trim().length > 0 &&
    !overWordLimit &&
    (mode === 'link' ? url.trim().length > 0 : !!file && !fileTooBig);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      if (mode === 'link') {
        await submitCommunityLink({
          title,
          url,
          gradeLevel,
          description,
          subjectTag: subjectTag || undefined,
          submittedBy: submitterId,
        });
      } else if (file) {
        await uploadCommunityFile({
          file,
          title,
          gradeLevel,
          description,
          subjectTag: subjectTag || undefined,
          submittedBy: submitterId,
        });
      }
      onDone();
    } catch (err) {
      console.error('Failed to share material', err);
      onError(err instanceof Error ? err.message : "Couldn't share that material — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Share a study material">
      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
        <button
          type="button"
          onClick={() => setMode('link')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition ${
            mode === 'link' ? 'bg-white dark:bg-slate-900 text-focus-primary shadow-sm' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" /> Link
        </button>
        <button
          type="button"
          onClick={() => setMode('file')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition ${
            mode === 'file' ? 'bg-white dark:bg-slate-900 text-focus-primary shadow-sm' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Upload className="w-3.5 h-3.5" /> Upload file
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Chapter 7 study guide — Cell Biology"
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary"
        />
      </div>

      {mode === 'link' ? (
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary"
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">File</label>
          <input
            type="file"
            accept={MATERIAL_ACCEPTED_FILE_TYPES}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-focus-primary file:text-white"
          />
          <p className={`text-[10px] ${fileTooBig ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
            {file
              ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)}MB`
              : `Images, video, PDFs, or docs — up to ${capMb}MB.`}
            {fileTooBig && ` — too big, max ${capMb}MB. Try a link instead.`}
          </p>
          <p className="text-[10px] text-slate-400">
            Downloaded to auto-delete after ~75 days to keep storage low — others can still save a copy in the meantime.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Grade level</label>
        <select
          value={gradeLevel}
          onChange={(e) => setGradeLevel(e.target.value)}
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary"
        >
          {GRADE_LEVEL_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Subject/topic (optional)</label>
        <input
          value={subjectTag}
          onChange={(e) => setSubjectTag(e.target.value)}
          placeholder="e.g. Algebra 1"
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">What is this material?</label>
          <span className={`text-[10px] font-bold ${overWordLimit ? 'text-red-500' : 'text-slate-400'}`}>
            {wordCount}/{MATERIAL_DESCRIPTION_MAX_WORDS} words
          </span>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="e.g. Practice problems and answer key covering photosynthesis and cell respiration."
          className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none resize-none ${
            overWordLimit ? 'border-red-400' : 'border-slate-200 dark:border-slate-700 focus:border-focus-primary'
          }`}
        />
      </div>

      <div className="flex gap-2.5">
        <button onClick={onClose} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-2xl">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit || busy}
          className="flex-1 py-3 bg-focus-primary text-white text-xs font-bold rounded-2xl disabled:opacity-50"
        >
          {busy ? (mode === 'file' ? 'Uploading…' : 'Sharing…') : 'Share'}
        </button>
      </div>
    </Modal>
  );
}