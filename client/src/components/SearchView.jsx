import { useEffect, useState } from 'react';
import { searchAll } from '../api/index.js';
import { links } from '../router.js';
import { formatDate, timeAgo } from '../utils.js';
import AuthImage from './AuthImage.jsx';
import Avatar from './Avatar.jsx';

export default function SearchView({ query }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (query.trim().length < 2) {
      setLoading(false);
      setError('Type at least 2 characters to search.');
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    searchAll(query, controller.signal)
      .then(setResults)
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  return (
    <section>
      <h1 className="font-display text-3xl font-extrabold">Search results</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Matches for <strong className="text-ink">&ldquo;{query}&rdquo;</strong>
      </p>

      {loading && (
        <div className="space-y-2" role="status" aria-label="Searching">
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

      {!loading && !error && results && (
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="section-title mb-3">Players ({results.users.length})</h2>
            {results.users.length === 0 ? (
              <p className="text-sm text-muted">No players match.</p>
            ) : (
              <ul className="space-y-2">
                {results.users.map((u) => (
                  <li key={u.id}>
                    <a href={links.user(u.id)} className="card card-hover flex items-center gap-3 p-3">
                      <Avatar user={u} size="md" />
                      <span className="min-w-0 flex-1 truncate font-bold">{u.username}</span>
                      <span className="hidden text-xs text-muted sm:inline">Joined {formatDate(u.createdAt)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="section-title mb-3">Polls ({results.polls.length})</h2>
            {results.polls.length === 0 ? (
              <p className="text-sm text-muted">No polls match.</p>
            ) : (
              <ul className="space-y-2">
                {results.polls.map((p) => (
                  <li key={p.id}>
                    <a href={links.poll(p.id)} className="card card-hover flex items-center gap-3 p-3">
                      {p.imageUrl && (
                        <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-raised">
                          <AuthImage src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 break-words font-semibold">{p.question}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                          {p.creator && <Avatar user={p.creator} size="xs" />}
                          {p.creator ? `${p.creator.username} · ` : ''}
                          {timeAgo(p.createdAt)}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
