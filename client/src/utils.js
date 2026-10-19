const rtf = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }) : null;

const UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

/** "5 minutes ago" / "yesterday" - falls back to a date if Intl is unavailable */
export function timeAgo(value) {
  const date = new Date(value);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  if (Number.isNaN(seconds)) return '';
  if (Math.abs(seconds) < 45) return 'just now';
  if (!rtf) return date.toLocaleDateString();
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds / 60), 'minute');
}

export const formatDate = (value) => new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
export const formatDateTime = (value) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
