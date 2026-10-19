import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AUTH_EXPIRED_EVENT,
  getMe,
  getToken,
  loginUser,
  registerUser,
  setToken,
  clearImageCache,
} from './api/index.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // true while we check a stored token on first load, so the UI doesn't flash
  // the logged-out state for a user who is actually logged in
  const [checking, setChecking] = useState(() => Boolean(getToken()));

  // On first load: if a token is stored, ask the API who it belongs to
  useEffect(() => {
    if (!getToken()) return undefined;
    const controller = new AbortController();
    getMe(controller.signal)
      .then((data) => setUser(data.user))
      .catch((err) => {
        // An invalid token is already cleared by the axios interceptor (401). For network
        // errors we keep the token and just show the logged-out UI.
        if (err.name !== 'AbortError') setUser(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, []);

  // the axios interceptor fires this when any request comes back 401 while logged in
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (credentials) => {
    const data = await loginUser(credentials);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (credentials) => {
    const data = await registerUser(credentials);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    clearImageCache(); // protected images belong to the session
  }, []);

  // Merge changed fields (e.g. a new avatarUrl) into the logged-in user
  const updateUser = useCallback((patch) => setUser((u) => (u ? { ...u, ...patch } : u)), []);

  const value = useMemo(
    () => ({ user, checking, login, register, logout, updateUser }),
    [user, checking, login, register, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
