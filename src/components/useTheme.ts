import { useEffect, useState } from 'react';
import { THEMES, DEFAULT_THEME_ID } from '../lib/themes';

const STORAGE_KEY = 'focus-theme';

// Single source of truth for which theme is active. Setting `data-theme` on
// <html> flips the CSS variables defined in styles/themes.css (accent
// colors), while toggling the `dark` class keeps every existing
// `dark:bg-slate-900`-style Tailwind variant already used across the app in
// sync with whichever base mode (light/dark) the chosen theme rides on.
export function useTheme() {
  const [themeId, setThemeId] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_THEME_ID;
    return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME_ID;
  });

  useEffect(() => {
    const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
    document.documentElement.dataset.theme = theme.id;
    document.documentElement.classList.toggle('dark', theme.mode === 'dark');
    window.localStorage.setItem(STORAGE_KEY, theme.id);
  }, [themeId]);

  return { themeId, setThemeId, themes: THEMES };
}
