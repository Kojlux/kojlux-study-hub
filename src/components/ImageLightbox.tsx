import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, ZoomIn, ZoomOut } from 'lucide-react';

// Fullscreen viewer for a card's source image. Zoom works via buttons, mouse
// wheel/trackpad, or a two-finger pinch (handled natively by the browser via
// touch-action); once zoomed in, dragging pans around the image. "Back" (or
// Escape) closes it without touching whatever card is underneath.
export default function ImageLightbox({
  src,
  onClose,
  sourceUrl,
  sourceLabel,
}: {
  src: string;
  onClose: () => void;
  sourceUrl?: string;
  sourceLabel?: string;
}) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const clampScale = (s: number) => Math.min(4, Math.max(1, +s.toFixed(2)));

  const zoomIn = () => setScale((s) => clampScale(s + 0.5));
  const zoomOut = () =>
    setScale((s) => {
      const next = clampScale(s - 0.5);
      if (next === 1) setPos({ x: 0, y: 0 });
      return next;
    });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => {
      const next = clampScale(s - e.deltaY * 0.0015);
      if (next === 1) setPos({ x: 0, y: 0 });
      return next;
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (scale === 1) return;
    setIsDragging(true);
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    setPos({
      x: dragState.current.origX + (e.clientX - dragState.current.startX),
      y: dragState.current.origY + (e.clientY - dragState.current.startY),
    });
  };
  const endDrag = () => {
    dragState.current = null;
    setIsDragging(false);
  };

  const resetOnDoubleClick = () => {
    if (scale === 1) {
      setScale(2);
    } else {
      setScale(1);
      setPos({ x: 0, y: 0 });
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-950/95 flex flex-col" onWheel={handleWheel}>
      <div className="flex items-center justify-between p-4 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-white/80 hover:text-white text-xs font-bold py-2 pr-3 -m-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-[11px] font-bold text-white/80 hover:bg-white/20 hover:text-white"
              title={sourceLabel ? `Open source: ${sourceLabel}` : 'Open image source'}
            >
              <ExternalLink className="w-3.5 h-3.5" /> Source
            </a>
          )}
          <button
            onClick={zoomOut}
            disabled={scale <= 1}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white disabled:opacity-30"
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] text-white/60 font-bold w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button
            onClick={zoomIn}
            disabled={scale >= 4}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white disabled:opacity-30"
            aria-label="Zoom in"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div
        className="flex-1 overflow-hidden flex items-center justify-center touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onDoubleClick={resetOnDoubleClick}
      >
        <img
          src={src}
          draggable={false}
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          }}
          className="max-w-full max-h-full object-contain"
        />
      </div>
      <p className="text-center text-[10px] text-white/40 font-semibold pb-4 shrink-0">
        Scroll or use the buttons to zoom {scale > 1 ? '· drag to pan' : ''}
      </p>
    </div>
  );
}
