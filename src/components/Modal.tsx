import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Every overlay on this page (Save, Edit, Study, Manage collections, New
// flashcard) renders through here instead of as an inline `absolute`
// popover. That matters specifically because of the flip-card review view:
// its card faces use `overflow-hidden` (to hide the back face) sitting
// inside an ancestor with a CSS `transform` (for the 3D flip). A transformed
// ancestor creates a new containing block, so *any* `position: fixed` or
// `position: absolute` element nested inside it — including a
// "fixed inset-0" backdrop — gets sized and clipped relative to that small
// card box instead of the viewport. That's what was cutting off the "Save
// without a collection" dropdown at the bottom.
//
// Portaling straight to `document.body` sidesteps all of that: the overlay
// is no longer a descendant of the transformed/overflow-hidden box at all,
// so it always renders full-screen and never gets clipped, no matter what
// changes inside the flip card later.
interface ModalProps {
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  widthClassName?: string;
}

export default function Modal({ onClose, title, children, widthClassName = 'max-w-sm' }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    // Lock background scroll while a modal is open — otherwise a long
    // "Saved Cards" list can scroll behind the overlay.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[500] bg-slate-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-5"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`bg-white dark:bg-slate-900 w-full ${widthClassName} rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 p-6 space-y-4 max-h-[85vh] overflow-y-auto`}
      >
        {title && (
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              title="Close"
              className="shrink-0 -m-1.5 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
