/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Semantic colours: the actual values live in src/index.css (:root / .dark),
      // so components never need `dark:` variants and both themes stay in sync.
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        raised: token('raised'),
        line: token('line'),
        ink: token('ink'),
        muted: token('muted'),
        brand: token('brand'),
        'brand-ink': token('brand-ink'),
        accent: token('accent'),
        danger: token('danger'),
        success: token('success'),
      },
      fontFamily: {
        display: ['"Bahnschrift"', '"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'sans-serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 28px -6px rgb(var(--c-brand) / 0.55)',
        'glow-accent': '0 0 28px -6px rgb(var(--c-accent) / 0.5)',
        card: '0 1px 2px rgb(0 0 0 / 0.06), 0 8px 24px -12px rgb(0 0 0 / 0.25)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'slide-in': { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'none' } },
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
        'slide-in': 'slide-in 0.25s ease-out both',
        'fade-in': 'fade-in 0.2s ease-out both',
      },
    },
  },
  plugins: [],
};
