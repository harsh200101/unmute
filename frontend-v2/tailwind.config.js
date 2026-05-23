/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Class-based dark mode: toggled by adding/removing `dark` on <html>.
  // See @/Users/hgajbhiye/Cphort/unmute/frontend-v2/src/theme/ThemeProvider.jsx.
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Inter is loaded in index.css; system stack is the fallback.
        sans: [
          'Inter', 'ui-sans-serif', 'system-ui', '-apple-system',
          'Segoe UI', 'Roboto', 'sans-serif',
        ],
      },
      colors: {
        // Brand: warm indigo. Calming + professional for a mental-health
        // platform. We use this as the primary CTA / link / focus colour.
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
      },
      borderRadius: {
        // Slightly chunkier than Tailwind defaults — modern SaaS feel.
        xl:  '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        // Softer, more diffused than Tailwind defaults.
        soft:    '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        elev:    '0 4px 12px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
        floaty:  '0 12px 32px -8px rgba(15, 23, 42, 0.18), 0 4px 8px rgba(15, 23, 42, 0.06)',
        ring:    '0 0 0 4px rgba(99, 102, 241, 0.18)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        'pulse-soft': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
