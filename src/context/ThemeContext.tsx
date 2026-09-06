import React, { createContext, useContext, useCallback, useEffect, useState, ReactNode } from 'react';
import { THEMES, DEFAULT_THEME_ID, Theme } from '../lib/themes';

const STORAGE_KEY = 'focus-theme';
// Set the moment a student actually picks a theme themselves from
// ThemeSwitcher. Until that happens, nothing has been "chosen" yet, so the
// app is free to just follow the OS's light/dark setting instead of
// pinning everyone to DEFAULT_THEME_ID regardless of their device.
const EXPLICIT_KEY = 'focus-theme-explicit';

// The theme applied automatically when the OS is in dark mode and the
// student hasn't picked one themselves. Deliberately NOT one of the
// bold/saturated themes (Cyber Neon, Aurora, Midnight...) — an
// auto-applied theme should be as quiet and low-arousal as "Light" is for
// day mode, not a loud aesthetic pick nobody asked for. Graphite's
// desaturated, neutral palette keeps contrast gentle without the extra
// glare a bright neon accent adds against a near-black background —
// exactly what most people enable dark mode to get away from in a dim
// room. Expressive themes stay one tap away in the picker; they just
// don't get sprung on someone automatically.
const SYSTEM_DARK_THEME_ID = 'graphite';

function prefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

function isExplicit(): boolean {
  return typeof window !== 'undefined' && window.localStorage.getItem(EXPLICIT_KEY) === 'true';
}

function initialThemeId(): string {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  if (isExplicit()) {
    return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME_ID;
  }
  return prefersDark() ? SYSTEM_DARK_THEME_ID : DEFAULT_THEME_ID;
}

interface ThemeContextValue {
  themeId: string;
  setThemeId: (id: string) => void;
  themes: Theme[];
  activeTheme: Theme;
  isDarkMode: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Wrap the app once with this (see App.tsx) so every consumer — the
// ThemeSwitcher picker, App.tsx's own dark-mode-dependent rendering, any
// future screen that needs to know light vs dark — reads and writes the
// exact same state. Two independent hook instances each reading
// localStorage on their own was what let App.tsx's old dark-mode logic and
// the new theme picker drift out of sync and fight over the `dark` class.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>(initialThemeId);

  const activeTheme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];

  useEffect(() => {
    document.documentElement.dataset.theme = activeTheme.id;
    document.documentElement.classList.toggle('dark', activeTheme.mode === 'dark');
    window.localStorage.setItem(STORAGE_KEY, activeTheme.id);
  }, [activeTheme]);

  // A student picking a theme from the switcher is a deliberate choice —
  // from that point on the OS's light/dark setting no longer overrides it,
  // even if they later toggle their phone's appearance setting.
  const setThemeId = useCallback((id: string) => {
    window.localStorage.setItem(EXPLICIT_KEY, 'true');
    setThemeIdState(id);
  }, []);

  // Until a student has made that explicit choice, keep following the OS
  // setting live — e.g. someone whose phone flips to dark mode at sunset
  // sees the app follow along without doing anything themselves.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (isExplicit()) return;
      setThemeIdState(e.matches ? SYSTEM_DARK_THEME_ID : DEFAULT_THEME_ID);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return (
    <ThemeContext.Provider
      value={{ themeId, setThemeId, themes: THEMES, activeTheme, isDarkMode: activeTheme.mode === 'dark' }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>. Wrap the app root with it (see App.tsx).');
  }
  return ctx;
}