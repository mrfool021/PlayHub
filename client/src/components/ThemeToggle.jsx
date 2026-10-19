import { useTheme } from '../ThemeContext.jsx';
import Icon from './Icons.jsx';

/** Round icon button (navbar) or full-width row (drawer, with a text label). */
export default function ThemeToggle({ withLabel = false }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  if (withLabel) {
    return (
      <button type="button" onClick={toggleTheme} className="btn-outline w-full justify-between" aria-label={label}>
        <span>{isDark ? 'Dark mode' : 'Light mode'}</span>
        <Icon name={isDark ? 'moon' : 'sun'} className="h-5 w-5 text-accent" />
      </button>
    );
  }
  return (
    <button type="button" onClick={toggleTheme} className="icon-btn" aria-label={label} title={label}>
      <Icon name={isDark ? 'sun' : 'moon'} className="h-5 w-5" />
    </button>
  );
}
