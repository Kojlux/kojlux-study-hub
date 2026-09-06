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
  { id: 'aurora', name: 'Aurora', mode: 'dark', swatch: ['#0B1120', '#14B8A6', '#A78BFA'] },
  { id: 'cherry', name: 'Cherry Blossom', mode: 'light', swatch: ['#FFF5F7', '#DB2777', '#F9A8D4'] },
  { id: 'honeycomb', name: 'Honeycomb', mode: 'light', swatch: ['#FEFCE8', '#CA8A04', '#BEF264'] },
  { id: 'cyber', name: 'Cyber Neon', mode: 'dark', swatch: ['#06070D', '#22D3EE', '#F472B6'] },
  { id: 'graphite', name: 'Graphite', mode: 'dark', swatch: ['#0B0F14', '#64748B', '#5EEAD4'] },
];

export const DEFAULT_THEME_ID = 'light';