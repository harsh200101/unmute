/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Class-based dark mode: toggled by adding/removing `dark` on <html>.
  // See @/Users/hgajbhiye/Cphort/unmute/frontend-v2/src/theme/ThemeProvider.jsx.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ---------------------------------------------------------------
        // Brand palette (literal indigo). Still used for explicit accents
        // (logo gradient, charts, etc). For everything that needs to
        // re-skin with dark mode, prefer the *semantic* tokens below.
        // ---------------------------------------------------------------
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

        // ---------------------------------------------------------------
        // Semantic design tokens.
        // Each value reads from a CSS variable defined in index.css under
        // :root (light) / html.dark (dark). This is the shadcn-style
        // contract — `bg-card`, `text-foreground`, `border-border`,
        // `bg-primary text-primary-foreground`, `ring-ring`, `bg-sidebar`,
        // etc. all resolve through these vars and re-skin for free when
        // ThemeProvider toggles the `.dark` class.
        // ---------------------------------------------------------------
        border:       'var(--border)',
        input:        'var(--input)',
        ring:         'var(--ring)',
        background:   'var(--background)',
        foreground:   'var(--foreground)',
        primary: {
          DEFAULT:    'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT:    'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT:    'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT:    'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT:    'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT:    'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT:    'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        sidebar: {
          DEFAULT:    'var(--sidebar)',
          foreground: 'var(--sidebar-foreground)',
          primary:    'var(--sidebar-primary)',
          'primary-foreground':       'var(--sidebar-primary-foreground)',
          accent:                     'var(--sidebar-accent)',
          'accent-foreground':        'var(--sidebar-accent-foreground)',
          border:                     'var(--sidebar-border)',
          ring:                       'var(--sidebar-ring)',
        },
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
        },
      },
      fontFamily: {
        // `sans` keeps Inter as the global default (loaded in index.css).
        // `serif` / `mono` come from the design-token sheet for the rare
        // occasions a page needs them (e.g. code blocks, editorial copy).
        sans:  ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['Merriweather', 'ui-serif', 'Georgia', 'serif'],
        mono:  ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
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
