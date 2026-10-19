import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { links, navigate } from '../router.js';
import Avatar from './Avatar.jsx';
import Icon from './Icons.jsx';
import ThemeToggle from './ThemeToggle.jsx';

export function Logo({ className = '' }) {
  return (
    <a href={links.home()} className={`flex items-center gap-2 font-display text-xl font-extrabold tracking-wide ${className}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-accent text-brand-ink shadow-glow">
        <Icon name="bolt" className="h-5 w-5" />
      </span>
      <span>
        Play<span className="text-gradient">Hub</span>
      </span>
    </a>
  );
}

function SearchForm({ onDone, autoFocus = false, className = '' }) {
  const [text, setText] = useState('');
  function submit(e) {
    e.preventDefault();
    const q = text.trim();
    if (q.length < 2) return;
    navigate(links.search(q));
    onDone?.();
  }
  return (
    <form onSubmit={submit} role="search" className={`relative ${className}`}>
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search polls and players"
        aria-label="Search polls and players"
        minLength={2}
        maxLength={50}
        autoFocus={autoFocus}
        enterKeyHint="search"
        className="input pl-9"
      />
    </form>
  );
}

const navLink = (active) =>
  `rounded-xl px-3 py-2 text-sm font-semibold transition ${
    active ? 'bg-brand/15 text-brand' : 'text-muted hover:bg-raised hover:text-ink'
  }`;

export default function Navbar({ route, onLogout }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);

  // Close the drawer whenever the route changes
  useEffect(() => setOpen(false), [route]);

  // Drawer behaviour: Esc closes, page behind does not scroll, focus moves inside
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.querySelector('a,button,input')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const closeAnd = (fn) => () => {
    setOpen(false);
    fn();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <button type="button" className="icon-btn md:hidden" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
          <Icon name="menu" />
        </button>
        <Logo />

        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
          <a href={links.home()} className={navLink(route.name === 'list')}>
            Polls
          </a>
          <a href={links.create()} className={navLink(route.name === 'create')}>
            New poll
          </a>
        </nav>

        <SearchForm className="mx-2 hidden max-w-xs flex-1 md:block" />
        <div className="flex-1 md:hidden" />

        <ThemeToggle />
        <a href={links.create()} className="btn-primary hidden sm:inline-flex md:hidden lg:inline-flex" aria-label="Create a new poll">
          <Icon name="plus" className="h-4 w-4" /> New poll
        </a>
        <a
          href={links.user(user.id)}
          className="hidden items-center gap-2 rounded-xl p-1 pr-3 transition hover:bg-raised md:flex"
          title="View your profile"
        >
          <Avatar user={user} size="sm" />
          <span className="max-w-[8rem] truncate text-sm font-semibold">{user.username}</span>
        </a>
        <button type="button" onClick={onLogout} className="icon-btn hidden md:inline-flex" aria-label="Log out" title="Log out">
          <Icon name="logout" />
        </button>
        <a href={links.user(user.id)} className="md:hidden" aria-label="Your profile">
          <Avatar user={user} size="sm" ring />
        </a>
      </div>

      {/* ---------------- Mobile / tablet drawer ---------------- */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div
            ref={drawerRef}
            className="safe-bottom absolute inset-y-0 left-0 flex w-[85%] max-w-sm animate-slide-in flex-col gap-5 overflow-y-auto border-r border-line bg-surface p-5"
          >
            <div className="flex items-center justify-between">
              <Logo />
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close menu">
                <Icon name="x" />
              </button>
            </div>

            <a href={links.user(user.id)} className="card flex items-center gap-3 p-3">
              <Avatar user={user} size="lg" ring />
              <span className="min-w-0">
                <span className="block truncate font-display text-lg font-bold">{user.username}</span>
                <span className="text-sm text-muted">View profile</span>
              </span>
            </a>

            <SearchForm onDone={() => setOpen(false)} />

            <nav className="flex flex-col gap-1" aria-label="Mobile">
              {[
                ['home', 'Polls', links.home(), 'list'],
                ['plus', 'New poll', links.create(), 'create'],
                ['user', 'My profile', links.user(user.id), 'profile'],
                ['users', 'Followers', links.followers(user.id), 'follows'],
              ].map(([icon, label, href, name]) => (
                <a key={label} href={href} className={`${navLink(route.name === name)} flex min-h-[48px] items-center gap-3 text-base`}>
                  <Icon name={icon} className="h-5 w-5" /> {label}
                </a>
              ))}
            </nav>

            <div className="mt-auto flex flex-col gap-3">
              <ThemeToggle withLabel />
              <button type="button" className="btn-danger w-full" onClick={closeAnd(onLogout)}>
                <Icon name="logout" className="h-4 w-4" /> Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
