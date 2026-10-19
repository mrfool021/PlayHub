import { useEffect, useState } from 'react';
import AuthImage from './AuthImage.jsx';

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-xl',
  xl: 'h-24 w-24 text-4xl sm:h-28 sm:w-28',
};

// Placeholder colours: picked from the username so each player keeps "their" colour
const GRADIENTS = [
  'from-violet-500 to-fuchsia-500',
  'from-cyan-400 to-blue-500',
  'from-fuchsia-500 to-rose-500',
  'from-emerald-400 to-cyan-500',
  'from-amber-400 to-orange-500',
  'from-indigo-500 to-cyan-400',
];

const gradientFor = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
};

/** user: { username, avatarUrl } */
export default function Avatar({ user, size = 'md', ring = false, className = '' }) {
  const [broken, setBroken] = useState(false);
  const url = user?.avatarUrl || null;
  useEffect(() => setBroken(false), [url]);

  const base = `relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full ${SIZES[size]} ${
    ring ? 'ring-2 ring-brand ring-offset-2 ring-offset-bg' : ''
  } ${className}`;

  if (url && !broken) {
    return (
      <span className={`${base} bg-raised`}>
        <AuthImage
          src={url}
          alt={`${user.username}'s avatar`}
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      </span>
    );
  }
  return (
    <span
      className={`${base} bg-gradient-to-br ${gradientFor(user?.username)} font-display font-bold uppercase text-white`}
      role="img"
      aria-label={`${user?.username || 'Unknown'}'s avatar`}
    >
      {(user?.username || '?').charAt(0)}
    </span>
  );
}
