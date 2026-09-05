import React, { useEffect, useRef, useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeSwitcher() {
  const { themeId, setThemeId, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click, same behavior as the grade-level/settings
  // controls elsewhere on this screen.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const active = themes.find((t) => t.id === themeId) ?? themes[0];

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Choose theme"
        aria-expanded={open}
        title="Choose theme"
        className="w-full flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4"
      >
        <span className="flex items-center gap-2.5 text-sm font-bold text-slate-700 dark:text-slate-200">
          <Palette className="w-4.5 h-4.5 text-focus-primary" />
          Theme
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400">{active.name}</span>
          <span
            className="w-4.5 h-4.5 rounded-full border border-black/10 shrink-0"
            style={{ backgroundColor: active.swatch[1] }}
          />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute z-20 left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-2 shadow-xl grid grid-cols-2 gap-1.5"
        >
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={t.id === themeId}
              onClick={() => {
                setThemeId(t.id);
                setOpen(false);
              }}
              className="flex items-center gap-2 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
            >
              <span className="flex -space-x-1 shrink-0">
                {t.swatch.map((c, i) => (
                  <span
                    key={i}
                    className="w-3.5 h-3.5 rounded-full border border-white dark:border-slate-900"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </span>
              <span className="flex-1 text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
                {t.name}
              </span>
              {t.id === themeId && <Check className="w-3.5 h-3.5 text-focus-primary shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}