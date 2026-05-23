import { createContext, useContext, useEffect, useState, useCallback } from 'react';

// Theme system.
//   - User can pick 'light' | 'dark' | 'system' (default).
//   - 'system' tracks `prefers-color-scheme` and updates live.
//   - Whatever the choice, the *effective* theme is applied as a class
//     on <html> so Tailwind's `dark:` variants kick in.
//   - Choice persists in localStorage under `unmute_theme`.

const STORAGE_KEY = 'unmute_theme';
const ThemeCtx = createContext(null);

function systemPref() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyClass(effective) {
  const root = document.documentElement;
  if (effective === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  // Match the browser chrome (URL bar) to our theme — feels native on mobile.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effective === 'dark' ? '#0b1120' : '#fafbff');
}

export function ThemeProvider({ children }) {
  // 'choice' is what the user picked (light | dark | system).
  // 'effective' is the resolved theme that's actually applied.
  const [choice, setChoice] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'system'; }
    catch { return 'system'; }
  });
  const [effective, setEffective] = useState(() => {
    const c = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || 'system';
    return c === 'system' ? systemPref() : c;
  });

  // Apply on mount + whenever choice changes
  useEffect(() => {
    const next = choice === 'system' ? systemPref() : choice;
    setEffective(next);
    applyClass(next);
    try { localStorage.setItem(STORAGE_KEY, choice); } catch { /* no-op */ }
  }, [choice]);

  // Listen to system pref changes when choice === 'system'
  useEffect(() => {
    if (choice !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = mq.matches ? 'dark' : 'light';
      setEffective(next);
      applyClass(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice]);

  // Simple toggle — cycles light → dark → system → light…
  const cycle = useCallback(() => {
    setChoice((c) => (c === 'light' ? 'dark' : c === 'dark' ? 'system' : 'light'));
  }, []);

  return (
    <ThemeCtx.Provider value={{ choice, effective, setChoice, cycle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}

// Pre-React inline boot script — set the dark class BEFORE React paints so
// there's no light-mode flash on dark-mode loads. Inject this into index.html
// <head> via a <script> tag. (Optional but nice; not wired by default.)
export const PRE_PAINT_SCRIPT = `
(function() {
  try {
    var c = localStorage.getItem('${STORAGE_KEY}') || 'system';
    var dark = c === 'dark' || (c === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;
