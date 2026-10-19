import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Keep this key in sync with public/theme-init.js
const THEME_KEY = 'playhub_theme';
const THEME_COLORS = { dark: '#07070e', light: '#f4f5fb' };

const ThemeContext = createContext(null);

function readStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null; // storage blocked (private mode etc.)
  }
}

const systemTheme = () =>
  window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStoredTheme() || systemTheme());
  const [hasChoice, setHasChoice] = useState(() => readStoredTheme() !== null);

  useEffect(() => applyTheme(theme), [theme]);

  // Until the user picks a theme themselves, follow the OS setting live
  useEffect(() => {
    if (hasChoice || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setThemeState(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [hasChoice]);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === THEME_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
        setThemeState(e.newValue);
        setHasChoice(true);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    setHasChoice(true);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* not persisted, still applied for this session */
    }
  }, []);

  const toggleTheme = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return ctx;
}
