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
        'focus-primary': '#4F46E5',
        'focus-primary-dark': '#4338CA',
        'focus-sage': '#6EE7B7',
        'focus-sage-dark': '#059669',
        'focus-bg': '#F8FAFC',
      },
    },
  },
  plugins: [],
};
