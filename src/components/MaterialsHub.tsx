import React, { useEffect, useState } from 'react';
import {
  Link2,
  Search,
  ExternalLink,
  PlusCircle,
  Loader2,
  FileText,
  Upload,
  Trash2,
  X,
  Check,
  Heart,
  Users,
  Image as ImageIcon,
  Video,
  Music,
  Presentation,
  FileSpreadsheet,
  File as FileIcon,
} from 'lucide-react';
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
  onStudyActivity: () => void;
  // Optional: wire this up to your moderation backend to enable the
  // "Report a problem" action in the preview. When omitted, the report
  // action simply doesn't render — nothing breaks either way.
  onReportMaterial?: (material: CommunityLink | SavedMaterial, reason: string) => void | Promise<void>;
}

// Maps a material to the icon + color it should show in the feed, so a
// student can tell a PDF from a video from a link at a glance instead of
// reading the filename. Falls back to a neutral file glyph for anything
// unrecognized rather than guessing wrong.
function getFileVisual(material: { kind: 'file' | 'link'; fileType?: string }) {
  if (material.kind === 'link') {
    return { Icon: ExternalLink, bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-500 dark:text-indigo-400' };
  }
  const type = material.fileType || '';
  if (type.startsWith('image/')) {
    return { Icon: ImageIcon, bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-500 dark:text-emerald-400' };
  }
  if (type.startsWith('video/')) {
    return { Icon: Video, bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-500 dark:text-purple-400' };
  }
  if (type.startsWith('audio/')) {
    return { Icon: Music, bg: 'bg-pink-50 dark:bg-pink-950/40', text: 'text-pink-500 dark:text-pink-400' };
  }
  if (type === 'application/pdf') {
    return { Icon: FileText, bg: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-500 dark:text-rose-400' };
  }
  if (type.includes('presentation') || type.includes('powerpoint')) {
    return { Icon: Presentation, bg: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-500 dark:text-orange-400' };
  }
  if (type.includes('spreadsheet') || type.includes('excel')) {
    return { Icon: FileSpreadsheet, bg: 'bg-green-50 dark:bg-green-950/40', text: 'text-green-600 dark:text-green-400' };
  }
  if (type.includes('word') || type.includes('document')) {
    return { Icon: FileText, bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-500 dark:text-blue-400' };
  }
  return { Icon: FileIcon, bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500 dark:text-slate-400' };
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// A handful of common education-adjacent hosts, used only to give a soft
// "we don't recognize this site" nudge on links — this is a UX hint, not a
// security control. The real mitigation for malicious links is a
// server-side check (e.g. Google Safe Browsing) at submission time.
const KNOWN_SAFE_HOSTS = [
  'docs.google.com', 'drive.google.com', 'forms.gle', 'sites.google.com',
  'classroom.google.com', 'youtube.com', 'youtu.be', 'quizlet.com',
  'khanacademy.org', 'canva.com', 'edpuzzle.com', 'kahoot.it',
  'wikipedia.org', 'github.com', 'github.io', 'dropbox.com',
  'onedrive.live.com', 'notion.site', 'flipgrid.com',
];

function isKnownHost(hostname: string): boolean {
  return KNOWN_SAFE_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}

// These two read fields that may not exist on CommunityLink/SavedMaterial
// yet — `submittedByName` and `createdAt`. They're read defensively so
// nothing breaks if the fields aren't there; add them to your types (and
// populate `submittedByName` from the poster's auth profile at submit
// time) to show a real name and upload time instead of the fallbacks.
function getUploaderName(material: unknown): string {
  const name = (material as { submittedByName?: string }).submittedByName;
  return name && name.trim() ? name.trim() : 'A classmate';
}

function getUploadedAt(material: unknown): Date | null {
  const raw = (material as { createdAt?: unknown }).createdAt;
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'number') return new Date(raw);
  if (typeof raw === 'string') {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'object' && raw !== null && 'toDate' in raw && typeof (raw as { toDate?: unknown }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate();
  }
  return null;
}

function formatRelativeTime(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export default function MaterialsHub({ currentUserId, defaultGradeLevel, onError, onStudyActivity, onReportMaterial }: Props) {
  return (
    <ToastProvider>
      <MaterialsHubInner
        currentUserId={currentUserId}
        defaultGradeLevel={defaultGradeLevel}
        onError={onError}
        onStudyActivity={onStudyActivity}
        onReportMaterial={onReportMaterial}
      />
    </ToastProvider>
  );
}

function MaterialsHubInner({ currentUserId, defaultGradeLevel, onError, onStudyActivity, onReportMaterial }: Props) {
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

  // The material currently shown in the "preview before you open it" modal
  // (see MaterialPreviewModal). `allowSave` controls whether the heart
  // toggle shows inside the preview — only relevant for someone else's
  // post in Browse, not your own and not something already in Saved.
  const [preview, setPreview] = useState<{ material: CommunityLink | SavedMaterial; allowSave: boolean } | null>(null);

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

  // Shared row markup for both the Browse feed and the Saved list, so the
  // two tabs read as one visual language. `sideAction` and `confirmRow`
  // are the only things that differ between a browsable post (heart or
  // delete) and a saved entry (remove). Clicking the card opens a preview
  // rather than immediately downloading/navigating — see `preview` state
  // below — so a student sees who shared it and what it is before leaving
  // the app or pulling a file onto their device.
  const renderMaterialCard = (
    material: { id: string; title: string; gradeLevel: string; kind: 'file' | 'link'; url: string; fileType?: string; fileSizeBytes?: number; description?: string; subjectTag?: string },
    sideAction: React.ReactNode,
    confirmRow: React.ReactNode | undefined,
    disabled: boolean | undefined,
    onCardClick: () => void,
  ) => {
    const visual = getFileVisual(material);
    return (
      <div
        key={material.id}
        className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden transition-colors hover:border-focus-primary/40"
      >
        <div className="flex items-stretch gap-0.5">
          <button
            type="button"
            onClick={onCardClick}
            disabled={disabled}
            className="flex-1 min-w-0 flex items-start gap-3 text-left p-3 disabled:opacity-60"
          >
            <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden ${visual.bg}`}>
              {material.kind === 'file' && material.fileType?.startsWith('image/') ? (
                <img
                  src={material.url}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <visual.Icon className={`w-4 h-4 ${visual.text}`} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{material.title}</span>
              {material.description && (
                <span className="block text-[11px] leading-snug text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  {material.description}
                </span>
              )}
              <span className="flex items-center flex-wrap gap-1 mt-1.5">
                <span className="inline-flex px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  {material.gradeLevel}
                </span>
                {material.subjectTag && (
                  <span className="inline-flex px-1.5 py-0.5 rounded-md bg-focus-primary/10 text-[10px] font-semibold text-focus-primary">
                    {material.subjectTag}
                  </span>
                )}
                <span className="text-[10px] text-slate-400">
                  {material.kind === 'file' ? formatSize(material.fileSizeBytes) : hostnameOf(material.url)}
                </span>
              </span>
            </span>
          </button>
          {sideAction}
        </div>
        {confirmRow}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          <Link2 className="w-3.5 h-3.5 text-focus-primary" /> Materials
          {activeTab === 'browse' && !loadingRecent && !searching && results.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold normal-case tracking-normal text-slate-500 dark:text-slate-400">
              {results.length}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => (currentUserId ? setShowSubmit(true) : onError('Sign in to share a material.'))}
          title={currentUserId ? 'Share a study material with other students' : 'Sign in to share a material'}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition ${
            currentUserId
              ? 'bg-focus-primary/10 text-focus-primary hover:bg-focus-primary/15'
              : 'text-slate-400'
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
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Search className="w-4 h-4 text-slate-300 dark:text-slate-600" />
            </span>
            <p className="text-xs text-slate-400 max-w-[220px]">
              {searched ? (
                <>No matches for &ldquo;{queryText}&rdquo; — try a different grade or subject, or share one yourself.</>
              ) : (
                'Nothing shared yet — be the first to post a study material.'
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {results.map((material) => {
              const mine = isOwnMaterial(material);
              const confirming = confirmingDeleteId === material.id;
              const busy = deletingId === material.id;

              const sideAction = confirming ? null : mine ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteId(material.id)}
                  title="Delete this post"
                  className="shrink-0 px-3 text-slate-300 hover:text-red-500 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : currentUserId ? (
                <button
                  type="button"
                  onClick={() => void toggleSave(material)}
                  disabled={togglingSaveId === material.id}
                  title={savedIds.has(material.id) ? 'Remove from Shared with me' : 'Save to Shared with me'}
                  className={`shrink-0 px-3 transition disabled:opacity-50 ${
                    savedIds.has(material.id) ? 'text-focus-primary' : 'text-slate-300 hover:text-focus-primary'
                  }`}
                >
                  {togglingSaveId === material.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Heart className="w-3.5 h-3.5" fill={savedIds.has(material.id) ? 'currentColor' : 'none'} />
                  )}
                </button>
              ) : null;

              const confirmRow = confirming ? (
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
              ) : undefined;

              return renderMaterialCard(
                { ...material, kind: material.kind ?? 'link' },
                sideAction,
                confirmRow,
                confirming,
                () => setPreview({ material, allowSave: !!currentUserId && !mine }),
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
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Heart className="w-4 h-4 text-slate-300 dark:text-slate-600" />
            </span>
            <p className="text-xs text-slate-400 max-w-[220px]">
              Nothing saved yet — tap the heart on anything in Browse to keep it here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupBySubject(savedMaterials).map(([subject, group]) => (
              <div key={subject} className="space-y-2">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">{subject}</span>
                {group.map((material) => {
                  const removing = removingSavedId === material.id;
                  // Removes this from the user's own saved list only —
                  // never the original post, which they don't own.
                  const sideAction = (
                    <button
                      type="button"
                      onClick={() => void removeSaved(material)}
                      disabled={removing}
                      title="Remove from Shared with me"
                      className="shrink-0 px-3 text-slate-300 hover:text-red-500 transition disabled:opacity-50"
                    >
                      {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                  );
                  return renderMaterialCard(material, sideAction, undefined, false, () =>
                    setPreview({ material, allowSave: false }),
                  );
                })}
              </div>
            ))}
          </div>
        )
      )}

      {preview && (
        <MaterialPreviewModal
          material={preview.material}
          onClose={() => setPreview(null)}
          onOpen={() => {
            openMaterial(preview.material);
            setPreview(null);
          }}
          showSaveAction={preview.allowSave}
          saved={savedIds.has(preview.material.id)}
          savingBusy={togglingSaveId === preview.material.id}
          onToggleSave={() => void toggleSave(preview.material as CommunityLink)}
          onReport={
            onReportMaterial
              ? () => {
                  void onReportMaterial(preview.material, 'inappropriate_or_broken');
                  showToast('Thanks — we\u2019ll take a look');
                  setPreview(null);
                }
              : undefined
          }
        />
      )}

      {showSubmit && currentUserId && (
        <SubmitMaterialModal
          submitterId={currentUserId}
          defaultGradeLevel={defaultGradeLevel}
          onClose={() => setShowSubmit(false)}
          onDone={() => {
            onStudyActivity();
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

// Shown before a material actually opens. The goal is to give a student
// something to judge trust on — who shared it, when, and (for links)
// where it actually goes — before they download a file or leave the app,
// rather than that information being invisible until after the fact.
function MaterialPreviewModal({
  material,
  onClose,
  onOpen,
  showSaveAction,
  saved,
  savingBusy,
  onToggleSave,
  onReport,
}: {
  material: {
    id: string;
    title: string;
    gradeLevel: string;
    kind: 'file' | 'link';
    url: string;
    fileType?: string;
    fileSizeBytes?: number;
    description?: string;
    subjectTag?: string;
  };
  onClose: () => void;
  onOpen: () => void;
  showSaveAction: boolean;
  saved: boolean;
  savingBusy: boolean;
  onToggleSave: () => void;
  onReport?: () => void;
}) {
  const visual = getFileVisual(material);
  const uploaderName = getUploaderName(material);
  const uploadedAt = getUploadedAt(material);
  const host = material.kind === 'link' ? hostnameOf(material.url) : null;
  const unfamiliarHost = !!host && !isKnownHost(host);

  return (
    <Modal onClose={onClose} title="Preview before you open it">
      <div className="flex items-start gap-3">
        <span className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden ${visual.bg}`}>
          {material.kind === 'file' && material.fileType?.startsWith('image/') ? (
            <img
              src={material.url}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <visual.Icon className={`w-5 h-5 ${visual.text}`} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-snug">{material.title}</p>
          <div className="flex items-center flex-wrap gap-1 mt-1.5">
            <span className="inline-flex px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {material.gradeLevel}
            </span>
            {material.subjectTag && (
              <span className="inline-flex px-1.5 py-0.5 rounded-md bg-focus-primary/10 text-[10px] font-semibold text-focus-primary">
                {material.subjectTag}
              </span>
            )}
          </div>
        </div>
      </div>

      {material.description && (
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{material.description}</p>
      )}

      <div className="flex items-center gap-2.5 py-2.5 border-t border-b border-slate-100 dark:border-slate-800">
        <span className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
          {uploaderName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">{uploaderName}</p>
          <p className="text-[10px] text-slate-400">
            {uploadedAt ? formatRelativeTime(uploadedAt) : 'Shared with the class'}
            {material.kind === 'file' && material.fileSizeBytes ? ` · ${formatSize(material.fileSizeBytes)}` : ''}
          </p>
        </div>
      </div>

      {material.kind === 'link' && (
        <div
          className={`flex items-start gap-2 p-2.5 rounded-xl text-[11px] leading-snug ${
            unfamiliarHost
              ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
              : 'bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400'
          }`}
        >
          <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Opens <span className="font-bold">{host}</span> in a new tab.
            {unfamiliarHost && " We don't recognize this site — only open it if you trust who shared it."}
          </span>
        </div>
      )}

      <div className="flex gap-2">
        {showSaveAction && (
          <button
            type="button"
            onClick={onToggleSave}
            disabled={savingBusy}
            title={saved ? 'Remove from Shared with me' : 'Save to Shared with me'}
            className={`flex items-center justify-center px-4 rounded-2xl transition disabled:opacity-50 ${
              saved ? 'bg-focus-primary/10 text-focus-primary' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}
          >
            {savingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" fill={saved ? 'currentColor' : 'none'} />}
          </button>
        )}
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 py-3 bg-focus-primary text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-1.5"
        >
          {material.kind === 'file' ? <FileText className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
          {material.kind === 'file' ? 'Download' : 'Open link'}
        </button>
      </div>

      {onReport && (
        <button
          type="button"
          onClick={onReport}
          className="w-full text-center text-[10px] text-slate-400 hover:text-red-500 transition pt-1"
        >
          Report a problem with this material
        </button>
      )}
    </Modal>
  );
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
          {file ? (
            <div className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${fileTooBig ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60'}`}>
              {(() => {
                const visual = getFileVisual({ kind: 'file', fileType: file.type });
                return (
                  <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${visual.bg}`}>
                    <visual.Icon className={`w-3.5 h-3.5 ${visual.text}`} />
                  </span>
                );
              })()}
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{file.name}</span>
                <span className={`block text-[10px] ${fileTooBig ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                  {(file.size / (1024 * 1024)).toFixed(1)}MB
                  {fileTooBig && ` — too big, max ${capMb}MB. Try a link instead.`}
                </span>
              </span>
            </div>
          ) : (
            <p className="text-[10px] text-slate-400">Images, video, PDFs, or docs — up to {capMb}MB.</p>
          )}
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