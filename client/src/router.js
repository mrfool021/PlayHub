import { useEffect, useState } from 'react';

// Tiny hash router (#/poll/3). No dependency needed, gives deep links, a working
// browser/phone back button, and needs no special Nginx rules.

export const links = {
  home: () => '#/',
  create: () => '#/new',
  poll: (id) => `#/poll/${id}`,
  user: (id) => `#/user/${id}`,
  followers: (id) => `#/user/${id}/followers`,
  following: (id) => `#/user/${id}/following`,
  search: (q) => `#/search?q=${encodeURIComponent(q)}`,
};

export const navigate = (href) => {
  window.location.hash = href.replace(/^#/, '');
};

const toId = (s) => (/^[1-9]\d{0,9}$/.test(s || '') ? Number(s) : null);

export function parseRoute(hash) {
  const [pathname, qs = ''] = hash.replace(/^#\/?/, '').split('?');
  const seg = pathname.split('/').filter(Boolean);
  const params = new URLSearchParams(qs);

  if (seg[0] === 'new') return { name: 'create' };
  if (seg[0] === 'poll' && toId(seg[1])) return { name: 'poll', id: toId(seg[1]) };
  if (seg[0] === 'search') return { name: 'search', q: (params.get('q') || '').slice(0, 50) };
  if (seg[0] === 'user' && toId(seg[1])) {
    const id = toId(seg[1]);
    if (seg[2] === 'followers' || seg[2] === 'following') return { name: 'follows', id, tab: seg[2] };
    return { name: 'profile', id };
  }
  return { name: 'list' };
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
