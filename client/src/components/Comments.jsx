import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { deleteComment, getComments, postComment } from '../api/index.js';
import { links } from '../router.js';
import { formatDateTime, plural, timeAgo } from '../utils.js';
import Avatar from './Avatar.jsx';
import Icon from './Icons.jsx';

const MAX = 500;

function CommentBody({ comment, onReply, onDelete, canReply }) {
  const { user } = useAuth();
  const mine = comment.user.id === user.id;
  return (
    <div className="flex gap-3">
      <a href={links.user(comment.user.id)} className="shrink-0" aria-label={`${comment.user.username}'s profile`}>
        <Avatar user={comment.user} size="sm" />
      </a>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <a href={links.user(comment.user.id)} className="max-w-full truncate text-sm font-bold hover:text-brand">
            {comment.user.username}
          </a>
          <time dateTime={new Date(comment.createdAt).toISOString()} title={formatDateTime(comment.createdAt)} className="text-xs text-muted">
            {timeAgo(comment.createdAt)}
          </time>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{comment.body}</p>
        <div className="mt-1 flex gap-1 text-xs">
          {canReply && (
            <button type="button" onClick={() => onReply(comment)} className="btn-ghost btn-sm -ml-2">
              <Icon name="reply" className="h-3.5 w-3.5" /> Reply
            </button>
          )}
          {mine && (
            <button type="button" onClick={() => onDelete(comment)} className="btn-ghost btn-sm text-danger hover:text-danger">
              <Icon name="trash" className="h-3.5 w-3.5" /> Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Composer({ pollId, replyTo, onCancelReply, onPosted }) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError('');
    try {
      const created = await postComment(pollId, { body, parentId: replyTo?.id });
      setText('');
      onPosted(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex gap-3">
      <Avatar user={user} size="sm" className="mt-1" />
      <div className="min-w-0 flex-1 space-y-2">
        {replyTo && (
          <p className="flex items-center justify-between gap-2 rounded-lg bg-raised px-3 py-1.5 text-xs text-muted">
            <span className="truncate">Replying to <strong className="text-ink">{replyTo.user.username}</strong></span>
            <button type="button" onClick={onCancelReply} className="font-semibold text-brand">
              Cancel
            </button>
          </p>
        )}
        <label htmlFor={`comment-${pollId}`} className="sr-only">
          Write a comment
        </label>
        <textarea
          id={`comment-${pollId}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX}
          rows={2}
          placeholder={replyTo ? 'Write a reply…' : 'Share your take…'}
          className="input resize-y"
        />
        {error && (
          <p role="alert" className="notice-error">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">{text.length}/{MAX}</span>
          <button type="submit" disabled={busy || !text.trim()} className="btn-primary btn-sm">
            {busy ? 'Posting…' : replyTo ? 'Reply' : 'Comment'}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function Comments({ pollId }) {
  const [items, setItems] = useState([]); // top-level comments (newest first), each with .replies
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState(null);

  const load = useCallback(
    async (signal) => {
      setLoading(true);
      setError('');
      try {
        const data = await getComments(pollId, { signal });
        setItems(data.comments);
        setTotal(data.total);
        setCursor(data.nextCursor);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        if (!signal || !signal.aborted) setLoading(false);
      }
    },
    [pollId]
  );

  useEffect(() => {
    const controller = new AbortController();
    setReplyTo(null);
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await getComments(pollId, { before: cursor });
      setItems((prev) => [...prev, ...data.comments.filter((c) => !prev.some((p) => p.id === c.id))]);
      setTotal(data.total);
      setCursor(data.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  function handlePosted(comment) {
    setTotal((t) => t + 1);
    setReplyTo(null);
    if (comment.parentId) {
      setItems((prev) => prev.map((c) => (c.id === comment.parentId ? { ...c, replies: [...c.replies, comment] } : c)));
    } else {
      setItems((prev) => [comment, ...prev]);
    }
  }

  async function handleDelete(comment) {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await deleteComment(pollId, comment.id);
      // Deleting a top-level comment also removes its replies on the server
      const removed = comment.parentId ? 1 : 1 + (items.find((c) => c.id === comment.id)?.replies.length || 0);
      setTotal((t) => Math.max(0, t - removed));
      setItems((prev) =>
        comment.parentId
          ? prev.map((c) => (c.id === comment.parentId ? { ...c, replies: c.replies.filter((r) => r.id !== comment.id) } : c))
          : prev.filter((c) => c.id !== comment.id)
      );
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="comments-title">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="comments-title" className="section-title flex items-center gap-2">
          <Icon name="message" className="h-4 w-4 text-accent" /> {plural(total, 'comment')}
        </h2>
        <button type="button" className="icon-btn h-9 w-9" onClick={() => load()} aria-label="Refresh comments" title="Refresh">
          <Icon name="refresh" className="h-4 w-4" />
        </button>
      </div>

      <Composer pollId={pollId} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onPosted={handlePosted} />

      <div className="mt-6 space-y-5">
        {loading && (
          <div className="space-y-4" role="status" aria-label="Loading comments">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="skeleton h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3 w-1/3" />
                  <div className="skeleton h-4 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <p role="alert" className="notice-error">
            {error}
          </p>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="py-4 text-center text-sm text-muted">No comments yet &mdash; start the conversation.</p>
        )}

        {items.map((c) => (
          <div key={c.id} className="animate-fade-up">
            <CommentBody comment={c} canReply onReply={setReplyTo} onDelete={handleDelete} />
            {c.replies.length > 0 && (
              <div className="ml-4 mt-3 space-y-4 border-l-2 border-line pl-3 sm:ml-6 sm:pl-4">
                {c.replies.map((r) => (
                  <CommentBody key={r.id} comment={r} canReply onReply={() => setReplyTo({ ...r, id: r.id })} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>
        ))}

        {cursor && (
          <button type="button" onClick={loadMore} disabled={loadingMore} className="btn-outline w-full">
            {loadingMore ? 'Loading…' : 'Load older comments'}
          </button>
        )}
      </div>
    </section>
  );
}
