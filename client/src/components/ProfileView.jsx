import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { getUser } from '../api/index.js';
import { links } from '../router.js';
import { formatDate, plural } from '../utils.js';
import AuthImage from './AuthImage.jsx';
import Avatar from './Avatar.jsx';
import AvatarEditor from './AvatarEditor.jsx';
import FollowButton from './FollowButton.jsx';
import Icon from './Icons.jsx';

const BackLink = () => (
  <a href={links.home()} className="btn-ghost -ml-3 mb-2 w-fit">
    <Icon name="arrowLeft" className="h-4 w-4" /> Back to polls
  </a>
);

function Stat({ href, value, label }) {
  const inner = (
    <>
      <span className="block font-display text-2xl font-extrabold">{value}</span>
      <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
    </>
  );
  const cls = 'min-w-0 flex-1 rounded-xl px-2 py-2 text-center transition';
  return href ? (
    <a href={href} className={`${cls} hover:bg-raised`}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export default function ProfileView({ userId }) {
  const { user: me, updateUser } = useAuth();
  const isSelf = userId === me.id;
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setProfile(null);
    setEditing(false);
    getUser(userId, controller.signal)
      .then(setProfile)
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [userId]);

  if (loading) {
    return (
      <section>
        <BackLink />
        <div className="card space-y-4 p-6" role="status" aria-label="Loading profile">
          <div className="skeleton h-28 w-28 rounded-full" />
          <div className="skeleton h-8 w-1/2" />
        </div>
      </section>
    );
  }
  if (error || !profile) {
    return (
      <section>
        <BackLink />
        <p role="alert" className="notice-error">
          {error || 'Profile not found.'}
        </p>
      </section>
    );
  }

  const shownUser = isSelf ? { ...profile, avatarUrl: me.avatarUrl } : profile;

  return (
    <section className="space-y-6">
      <BackLink />

      <div className="card overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-brand/70 via-brand/30 to-accent/60 sm:h-32" />
        <div className="px-4 pb-5 sm:px-8 sm:pb-6">
          <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <Avatar user={shownUser} size="xl" ring className="bg-surface" />
            </div>
            <div className="flex flex-wrap gap-2">
              {isSelf ? (
                <button type="button" className="btn-outline" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
                  <Icon name="camera" className="h-4 w-4" /> Edit avatar
                </button>
              ) : (
                <FollowButton
                  userId={profile.id}
                  following={profile.isFollowing}
                  onChange={(r) => setProfile((p) => ({ ...p, isFollowing: r.following, followersCount: r.followersCount }))}
                />
              )}
            </div>
          </div>

          <h1 className="mt-4 break-words font-display text-3xl font-extrabold">
            {profile.username}
            {isSelf && <span className="ml-2 align-middle text-sm font-medium text-muted">(you)</span>}
          </h1>
          <p className="text-sm text-muted">Joined {formatDate(profile.createdAt)}</p>

          <div className="mt-5 flex divide-x divide-line rounded-xl border border-line bg-raised/40">
            <Stat value={profile.polls.length} label="Polls" />
            <Stat href={links.followers(profile.id)} value={profile.followersCount} label="Followers" />
            <Stat href={links.following(profile.id)} value={profile.followingCount} label="Following" />
          </div>
        </div>
      </div>

      {isSelf && editing && (
        <AvatarEditor
          user={me}
          onChanged={(updated) => updateUser({ avatarUrl: updated.avatarUrl })}
          onClose={() => setEditing(false)}
        />
      )}

      <div>
        <h2 className="section-title mb-3">Polls created ({profile.polls.length})</h2>
        {profile.polls.length === 0 ? (
          <p className="text-sm text-muted">No polls yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {profile.polls.map((p) => (
              <li key={p.id}>
                <a href={links.poll(p.id)} className="card card-hover flex items-center gap-3 p-3">
                  {p.imageUrl && (
                    <span className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-raised">
                      <AuthImage src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="line-clamp-2 break-words font-semibold">{p.question}</span>
                    <span className="text-xs text-muted">{formatDate(p.createdAt)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
