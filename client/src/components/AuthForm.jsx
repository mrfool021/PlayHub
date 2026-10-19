import { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';

/**
 * One form for both flows.
 *   mode="login"  -> identifier (username or email) + password
 *   mode="signup" -> username + email + password + confirm
 */
export default function AuthForm({ mode, onSuccess, onSwitchMode }) {
  const { login, register } = useAuth();
  const isSignup = mode === 'signup';

  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function validate() {
    if (!isSignup) return '';
    if (!/^[A-Za-z0-9_]{3,30}$/.test(username.trim())) {
      return 'Username must be 3-30 characters: letters, numbers and underscores only.';
    }
    if (password.length < 8) return 'Password must be at least 8 characters long.';
    if (password !== confirm) return 'Passwords do not match.';
    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (isSignup) await register({ username: username.trim(), email: email.trim(), password });
      else await login({ identifier: identifier.trim(), password });
      onSuccess();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-md">
      <h2 className="mb-5 font-display text-3xl font-extrabold">
        {isSignup ? 'Create your account' : 'Player login'}
      </h2>

      <form onSubmit={handleSubmit} className="card space-y-5 p-5 sm:p-6">
        {isSignup ? (
          <>
            <div>
              <label htmlFor="username" className="label">
                Username
              </label>
              <input id="username" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" value={username} maxLength={30} onChange={(e) => setUsername(e.target.value)} className="input" required />
            </div>
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input id="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} maxLength={255} onChange={(e) => setEmail(e.target.value)} className="input" required />
            </div>
          </>
        ) : (
          <div>
            <label htmlFor="identifier" className="label">
              Username or email
            </label>
            <input id="identifier" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" value={identifier} maxLength={255} onChange={(e) => setIdentifier(e.target.value)} className="input" required />
          </div>
        )}

        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input id="password" type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} className="input" required />
          {isSignup && <p className="mt-1 text-xs text-muted">At least 8 characters.</p>}
        </div>

        {isSignup && (
          <div>
            <label htmlFor="confirm" className="label">
              Confirm password
            </label>
            <input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" required />
          </div>
        )}

        {error && (
          <p role="alert" className="notice-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? 'Please wait…' : isSignup ? 'Sign up' : 'Log in'}
        </button>

        <p className="text-center text-sm text-muted">
          {isSignup ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" onClick={onSwitchMode} className="font-semibold text-brand hover:underline">
            {isSignup ? 'Log in' : 'Create an account'}
          </button>
        </p>
      </form>
    </section>
  );
}
