import { useRef, useState } from 'react';
import { removeAvatar, setAvatarImage, setAvatarUrl } from '../api/index.js';
import { formatBytes, prepareAvatarImage } from '../imageUtils.js';
import Avatar from './Avatar.jsx';
import Icon from './Icons.jsx';

/** Change avatar: upload a picture (auto-cropped square) or paste an https image link. */
export default function AvatarEditor({ user, onChanged, onClose }) {
  const [mode, setMode] = useState('upload'); // 'upload' | 'url'
  const [preview, setPreview] = useState(null); // { dataUrl, bytes }
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const hasAvatar = Boolean(user.avatarUrl);

  async function pick(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      setPreview(await prepareAvatarImage(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      const { user: updated } = await action();
      onChanged(updated);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const canSave = mode === 'upload' ? Boolean(preview) : /^https:\/\/\S+$/i.test(url.trim());
  const save = () => run(() => (mode === 'upload' ? setAvatarImage(preview.dataUrl) : setAvatarUrl(url.trim())));

  return (
    <div className="card animate-fade-up space-y-4 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Change avatar</h2>
        <button type="button" className="icon-btn h-9 w-9" onClick={onClose} aria-label="Close avatar editor">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>

      <div role="tablist" aria-label="Avatar source" className="inline-flex rounded-xl border border-line bg-raised/60 p-1">
        {[
          ['upload', 'upload', 'Upload'],
          ['url', 'link', 'Image link'],
        ].map(([key, icon, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 text-sm font-semibold ${
              mode === key ? 'bg-surface text-ink shadow-card' : 'text-muted'
            }`}
          >
            <Icon name={icon} className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <Avatar
          user={{ username: user.username, avatarUrl: mode === 'upload' ? preview?.dataUrl || user.avatarUrl : /^https:\/\/\S+$/i.test(url.trim()) ? url.trim() : user.avatarUrl }}
          size="xl"
          ring
        />
        <div className="w-full flex-1">
          {mode === 'upload' ? (
            <>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={pick} className="sr-only" aria-label="Choose an avatar image" tabIndex={-1} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn-outline w-full">
                <Icon name="camera" className="h-4 w-4" /> {preview ? 'Choose a different picture' : 'Choose a picture'}
              </button>
              <p className="mt-2 text-xs text-muted">
                {preview ? `Ready: 256×256, ${formatBytes(preview.bytes)}` : 'Any photo works: it is cropped to a square and compressed automatically.'}
              </p>
            </>
          ) : (
            <>
              <label htmlFor="avatar-url" className="label">
                Image URL
              </label>
              <input
                id="avatar-url"
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/me.png"
                maxLength={500}
                className="input"
              />
              <p className="mt-2 text-xs text-muted">Must start with https://</p>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="notice-error">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {hasAvatar ? (
          <button type="button" disabled={busy} onClick={() => run(removeAvatar)} className="btn-danger">
            <Icon name="trash" className="h-4 w-4" /> Remove avatar
          </button>
        ) : (
          <span />
        )}
        <button type="button" disabled={busy || !canSave} onClick={save} className="btn-primary sm:min-w-[9rem]">
          {busy ? 'Saving…' : 'Save avatar'}
        </button>
      </div>
    </div>
  );
}
