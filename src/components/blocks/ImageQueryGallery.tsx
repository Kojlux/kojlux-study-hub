import React, { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';

interface ImgResult {
  url: string;
  title: string;
}

// Zero-key default: Wikimedia Commons' public search API (CORS-enabled via
// origin=*, no API key required) — a reasonable fit for an educational app
// since results are almost always public-domain or openly licensed. If you
// later add an Unsplash/Pexels key, swap the body of this one function;
// everything downstream (caching, rendering) stays the same.
async function fetchEducationalImages(query: string): Promise<ImgResult[]> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=3&gsrsearch=${encodeURIComponent(
    query
  )}&prop=imageinfo&iiprop=url&iiurlwidth=400`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return [];
  return Object.values<any>(pages)
    .map((p) => ({
      url: p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url,
      title: (p.title as string)?.replace(/^File:/, '').replace(/\.(jpg|jpeg|png|svg|gif)$/i, ''),
    }))
    .filter((r): r is ImgResult => !!r.url);
}

// Both pages: pulls in relevant images for the AI's `image_queries`. Each
// query is fetched independently and rendered as its own labeled strip, so
// a slow/failed lookup for one term never blocks the others.
export default function ImageQueryGallery({ queries }: { queries?: string[] }) {
  const [results, setResults] = useState<Record<string, ImgResult[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!queries || queries.length === 0) {
      setResults({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    const capped = queries.slice(0, 4);
    Promise.all(capped.map(async (q) => [q, await fetchEducationalImages(q).catch(() => [])] as const)).then(
      (pairs) => {
        if (cancelled) return;
        setResults(Object.fromEntries(pairs));
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [queries]);

  if (!queries || queries.length === 0) return null;
  const capped = queries.slice(0, 4);
  const anyResults = Object.values(results).some((r) => r.length > 0);

  if (!loading && !anyResults) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-3">
      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
        <ImageIcon className="w-3.5 h-3.5" /> Visuals
      </p>
      {loading && <p className="text-xs text-slate-400">Loading images…</p>}
      <div className="space-y-3">
        {capped.map((q) => {
          const imgs = results[q];
          if (!imgs || imgs.length === 0) return null;
          return (
            <div key={q} className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-400">{q}</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {imgs.map((img, i) => (
                  <img
                    key={i}
                    src={img.url}
                    alt={img.title}
                    title={img.title}
                    loading="lazy"
                    className="h-24 w-32 object-cover rounded-xl border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
