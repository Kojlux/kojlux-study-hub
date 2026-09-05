import React, { useState } from 'react';
import { Link2, Search, ExternalLink, PlusCircle, Loader2 } from 'lucide-react';
import { CommunityLink } from '../types';
import { searchCommunityLinks, submitCommunityLink } from '../lib/communityLinks';
import { useToast } from './Toast';
import Modal from './Modal';

interface Props {
  submitterId: string; // signed-in uid, or 'guest'
  onError: (msg: string) => void;
}

export default function CommunityLinkHub({ submitterId, onError }: Props) {
  const { showToast } = useToast();
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<CommunityLink[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);

  const runSearch = async () => {
    if (!queryText.trim()) return;
    setSearching(true);
    try {
      const found = await searchCommunityLinks(queryText);
      setResults(found);
      setSearched(true);
    } catch (err) {
      console.error('Community link search failed', err);
      onError("Couldn't search community links right now.");
    } finally {
      setSearching(false);
    }
  };

  // Tapping a result hands the URL straight to the browser/OS — a PDF
  // triggers its native download/viewer, a video link opens the site that
  // hosts it, and so on. Nothing is fetched or proxied through our own
  // servers or database here: the URL string is the entire payload we ever
  // stored (see lib/communityLinks.ts), so file bytes only ever move
  // directly between the student's browser and whoever originally hosts
  // the link.
  const openLink = (link: CommunityLink) => {
    window.open(link.url, '_blank', 'noopener,noreferrer');
  };

  const hostnameOf = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          <Link2 className="w-3.5 h-3.5 text-focus-primary" /> Community links
        </span>
        <button
          type="button"
          onClick={() => setShowSubmit(true)}
          title="Share an educational link with other students"
          className="flex items-center gap-1 text-[11px] font-bold text-focus-primary"
        >
          <PlusCircle className="w-3.5 h-3.5" /> Add link
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          placeholder="Search a subject, e.g. Algebra 1"
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

      {searched &&
        !searching &&
        (results.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-3">
            No links yet for &ldquo;{queryText}&rdquo; — be the first to add one.
          </p>
        ) : (
          <div className="space-y-2">
            {results.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => openLink(link)}
                className="w-full text-left flex items-center justify-between gap-2 p-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl hover:border-focus-primary transition"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{link.title}</span>
                  <span className="block text-[10px] text-slate-400 truncate">
                    {link.subjectTag} · {hostnameOf(link.url)}
                  </span>
                </span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        ))}

      {showSubmit && (
        <SubmitLinkModal
          submitterId={submitterId}
          onClose={() => setShowSubmit(false)}
          onDone={() => {
            setShowSubmit(false);
            showToast('Link shared');
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

function SubmitLinkModal({
  submitterId,
  onClose,
  onDone,
  onError,
}: {
  submitterId: string;
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [subjectTag, setSubjectTag] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit = title.trim().length > 0 && url.trim().length > 0 && subjectTag.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await submitCommunityLink({ title, url, subjectTag, submittedBy: submitterId });
      onDone();
    } catch (err) {
      console.error('Failed to submit community link', err);
      onError(err instanceof Error ? err.message : "Couldn't share that link — check the URL and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Share an educational link">
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Khan Academy — Linear Equations"
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">URL</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Subject/topic tag</label>
        <input
          value={subjectTag}
          onChange={(e) => setSubjectTag(e.target.value)}
          placeholder="e.g. Algebra 1"
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-focus-primary"
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
          {busy ? 'Sharing…' : 'Share link'}
        </button>
      </div>
    </Modal>
  );
}
