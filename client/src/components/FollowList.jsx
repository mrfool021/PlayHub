import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { getFollowList } from '../api/index.js';
import { links } from '../router.js';
import Avatar from './Avatar.jsx';
import FollowButton from './FollowButton.jsx';
import Icon from './Icons.jsx';

/** /user/:id/followers and /user/:id/following */
export default function FollowList({ userId, tab }) {
  const { user: me } = useAuth();
  const [owner, setOwner] = useState(null);
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (signal) => {
      setLoading(true);
      setError('');
      setUsers([]);
      try {
        const data = await getFollowList(userId, tab, 1, signal);
        setOwner(data.user);
        setUsers(data.users);
        setPage(1);
        setHasMore(data.hasMore);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [userId, tab]
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await getFollowList(userId, tab, page + 1);
      setUsers((prev) => [...prev, ...data.users]);
      setPage(page + 1);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl">
      <a href={links.user(userId)} className="btn-ghost -ml-3 mb-2 w-fit">
        <Icon name="arrowLeft" className="h-4 w-4" /> {owner ? owner.username : 'Profile'}
      </a>

      <div role="tablist" aria-label="Social" className="mb-5 inline-flex rounded-xl border border-line bg-surface/70 p-1">
        {['followers', 'following'].map((t) => (
          <a
            key={t}
            role="tab"
            aria-selected={tab === t}
            href={links[t](userId)}
            className={`inline-flex min-h-[40px] items-center rounded-lg px-4 text-sm font-semibold capitalize ${
              tab === t ? 'bg-gradient-to-r from-brand to-accent text-brand-ink shadow-glow' : 'text-muted hover:text-ink'
            }`}
          >
            {t}
          </a>
        ))}
      </div>

      {loading && (
        <div className="space-y-2" role="status" aria-label="Loading list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      )}
      {!loading && error && (
        <p role="alert" className="notice-error">
          {error}
        </p>
      )}
      {!loading && !error && users.length === 0 && (
        <p className="card p-8 text-center text-sm text-muted">
          {tab === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
        </p>
      )}

      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className="card flex items-center justify-between gap-3 p-3">
            <a href={links.user(u.id)} className="flex min-w-0 items-center gap-3">
              <Avatar user={u.id === me.id ? { ...u, avatarUrl: me.avatarUrl } : u} size="md" />
              <span className="truncate font-bold">{u.username}</span>
            </a>
            {u.id !== me.id && <FollowButton userId={u.id} following={u.isFollowing} size="sm" />}
          </li>
        ))}
      </ul>

      {hasMore && (
        <button type="button" onClick={loadMore} disabled={loadingMore} className="btn-outline mt-4 w-full">
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </section>
  );
}
