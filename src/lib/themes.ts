export interface Theme {
  id: string;
  name: string;
  // Which base neutral palette this theme rides on — controls whether the
  // existing `dark:` Tailwind variants throughout the app are active.
  // Themes don't need to reinvent every surface color, just the accent.
  mode: 'light' | 'dark';
  // Three preview dots shown in the theme picker: [background, primary, sage/accent]
  swatch: [string, string, string];
}

export const THEMES: Theme[] = [
  { id: 'light', name: 'Light', mode: 'light', swatch: ['#F8FAFC', '#4F46E5', '#6EE7B7'] },
  { id: 'dark', name: 'Dark', mode: 'dark', swatch: ['#0F172A', '#6366F1', '#6EE7B7'] },
  { id: 'sunset', name: 'Sunset', mode: 'light', swatch: ['#FFF7ED', '#EA580C', '#FDBA74'] },
  { id: 'ocean', name: 'Ocean', mode: 'light', swatch: ['#F0F9FF', '#0284C7', '#67E8F9'] },
  { id: 'forest', name: 'Forest', mode: 'dark', swatch: ['#0F1B14', '#22C55E', '#86EFAC'] },
  { id: 'rose', name: 'Rose Quartz', mode: 'light', swatch: ['#FFF1F2', '#E11D48', '#FDA4AF'] },
  { id: 'midnight', name: 'Midnight', mode: 'dark', swatch: ['#020617', '#8B5CF6', '#C4B5FD'] },
];

export const DEFAULT_THEME_ID = 'light';
