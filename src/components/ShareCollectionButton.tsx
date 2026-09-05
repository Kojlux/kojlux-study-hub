import React, { useState } from 'react';
import { Loader2, Share2 } from 'lucide-react';
import { Collection, RecallCard } from '../types';
import { publishSharedCollection } from '../lib/sharedCards';
import { buildCollectionShareUrl } from '../lib/deepLink';
import { useToast } from './Toast';

export default function ShareCollectionButton({ collection, cards }: { collection: Collection; cards: RecallCard[] }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const share = async () => {
    setBusy(true);
    try {
      await publishSharedCollection(collection, cards);
      const url = buildCollectionShareUrl(collection.id);
      if (navigator.share) await navigator.share({ title: collection.name, text: `Flashcard collection: ${collection.name}`, url });
      else { await navigator.clipboard.writeText(url); showToast('Collection link copied'); }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') { console.error('Failed to share collection', err); showToast("Couldn't create collection link"); }
    } finally { setBusy(false); }
  };
  return <button type="button" onClick={share} disabled={busy} title="Share this flashcard collection via a link" aria-label={`Share ${collection.name}`} className="shrink-0 text-slate-300 hover:text-focus-primary disabled:opacity-50">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}</button>;
}