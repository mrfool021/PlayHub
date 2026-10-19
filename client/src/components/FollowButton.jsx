import { useEffect, useState } from 'react';
import { followUser, unfollowUser } from '../api/index.js';
import Icon from './Icons.jsx';

/** Follow / Following toggle. onChange({ following, followersCount }) lets parents update counts. */
export default function FollowButton({ userId, following: initial, onChange, size = 'md' }) {
  const [following, setFollowing] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setFollowing(Boolean(initial)), [initial]);

  async function toggle() {
    setBusy(true);
    setError('');
    try {
      const result = following ? await unfollowUser(userId) : await followUser(userId);
      setFollowing(result.following);
      onChange?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
        className={`${following ? 'btn-outline' : 'btn-primary'} ${size === 'sm' ? 'btn-sm' : ''}`}
      >
        <Icon name={following ? 'check' : 'plus'} className="h-4 w-4" />
        {following ? 'Following' : 'Follow'}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
