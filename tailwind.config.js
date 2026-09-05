/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Focus palette: a calmer, lower-saturation set than the previous
        // high-contrast gradient/feed styling — deep indigo for primary
        // actions, sage green reserved for "mastered / correct" states,
        // and a soft neutral background so long study sessions don't fatigue.
        //
        // These now point at CSS variables (see src/styles/themes.css)
        // rather than fixed hex values, so the theme picker can repaint
        // them at runtime by swapping the `data-theme` attribute on <html>
        // — the light/dark hex values above still exist, just moved into
        // the `light`/`dark` variable blocks alongside 5 more themes.
        'focus-primary': 'var(--color-focus-primary)',
        'focus-primary-dark': 'var(--color-focus-primary-dark)',
        'focus-sage': 'var(--color-focus-sage)',
        'focus-sage-dark': 'var(--color-focus-sage-dark)',
        'focus-bg': 'var(--color-focus-bg)',
      },
    },
  },
  plugins: [],
};