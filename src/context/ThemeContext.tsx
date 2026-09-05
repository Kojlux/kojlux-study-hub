import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { THEMES, DEFAULT_THEME_ID, Theme } from '../lib/themes';

const STORAGE_KEY = 'focus-theme';

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
  const [themeId, setThemeId] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_THEME_ID;
    return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME_ID;
  });

  const activeTheme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];

  useEffect(() => {
    document.documentElement.dataset.theme = activeTheme.id;
    document.documentElement.classList.toggle('dark', activeTheme.mode === 'dark');
    window.localStorage.setItem(STORAGE_KEY, activeTheme.id);
  }, [activeTheme]);

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
