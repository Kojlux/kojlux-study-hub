import React, { useState } from 'react';
import { Share2, Loader2 } from 'lucide-react';
import { RecallCard } from '../types';
import { publishSharedCard } from '../lib/sharedCards';
import { buildCardShareUrl } from '../lib/deepLink';
import { useToast } from './Toast';

// Publishes the card's public snapshot (lib/sharedCards.ts), then hands the
// resulting /card/:id URL to the Web Share API on devices that support it
// (native share sheet — Messages, WhatsApp, Mail, etc.) or falls back to
// copying it to the clipboard everywhere else.
export default function ShareCardButton({ card }: { card: RecallCard }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      await publishSharedCard(card);
      const url = buildCardShareUrl(card.id);
      if (navigator.share) {
        await navigator.share({ title: card.sourceTitle, text: card.prompt, url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast('Link copied');
      }
    } catch (err) {
      // AbortError just means the student closed the native share sheet
      // without picking anything — not a real failure.
      if ((err as Error)?.name !== 'AbortError') {
        console.error('Failed to share card', err);
        showToast("Couldn't create share link");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      disabled={busy}
      title="Share this flashcard via a link"
      className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-focus-primary transition disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />} Share
    </button>
  );
}
