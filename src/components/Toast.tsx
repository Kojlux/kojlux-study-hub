import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Spec calls for a 1-second auto-dismiss — kept as a named constant so it's
// one obvious place to tune if that ever needs to change.
const AUTO_DISMISS_MS = 1000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // One timer per toast id. The old "Done" toast got stuck because it had
  // nothing tracking its own dismiss timer, so a second toast (or the X
  // button) could never reliably clear it. Keying timers by id means
  // dismissing one toast — by hand or automatically — can never interfere
  // with any other toast's timer.
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, message, variant }]);
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  // Belt-and-suspenders: clear every outstanding timer if the page this
  // provider lives on unmounts, so nothing tries to update state that's no
  // longer there.
  useEffect(() => {
    const timersMap = timers.current;
    return () => {
      timersMap.forEach((t) => clearTimeout(t));
      timersMap.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 inset-x-0 z-[600] flex flex-col items-center gap-2 px-5 pointer-events-none">
        {toasts.map((t) => (
          <ToastBubble key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastBubble({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const icon =
    toast.variant === 'success' ? (
      <CheckCircle2 className="w-4 h-4 text-focus-sage shrink-0" />
    ) : toast.variant === 'error' ? (
      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
    ) : (
      <Info className="w-4 h-4 text-focus-primary shrink-0" />
    );
  return (
    <div className="pointer-events-auto w-full max-w-sm flex items-center gap-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl shadow-2xl px-4 py-3">
      {icon}
      <p className="flex-1 text-xs font-bold">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        title="Dismiss"
        className="shrink-0 -m-1 p-1 rounded-full text-white/60 dark:text-slate-500 hover:text-white dark:hover:text-slate-900 hover:bg-white/10 dark:hover:bg-slate-900/10 transition"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
