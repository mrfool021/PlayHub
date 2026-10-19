import axios from 'axios';

// ---------------------------------------------------------------------------
// The ONE shared axios instance. Components never write a host name: they call
// the functions in api/index.js, which use this instance.
// Set VITE_API_URL in the root .env to point the client at another server.
// ---------------------------------------------------------------------------
export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ---------------------------------------------------------------------------
// Token storage. localStorage keeps the user logged in across page reloads.
// Every access is wrapped in try/catch because storage can be unavailable
// (private windows, blocked site data).
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'playhub_token';
export const AUTH_EXPIRED_EVENT = 'playhub:auth-expired';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable - the session simply won't survive a reload */
  }
}

// Attach the login token to every request
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Turn every failure into a plain Error with a readable message (+ HTTP status)
api.interceptors.response.use(
  (response) => response,
  (err) => {
    if (axios.isCancel(err)) {
      const aborted = new Error('Request cancelled.');
      aborted.name = 'AbortError'; // components ignore these (component unmounted / newer request)
      return Promise.reject(aborted);
    }

    const status = err.response?.status;
    const data = err.response?.data;

    // A 401 while holding a token means it expired or was revoked: drop it and
    // tell the app so the UI can switch back to the logged-out state.
    // (A failed login has no token yet, so it does not trigger this.)
    if (status === 401 && getToken()) {
      setToken(null);
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }

    let message;
    if (!err.response) {
      message = 'Cannot reach the server. Please check your connection and try again.';
    } else {
      const details = Array.isArray(data?.details) ? ` ${data.details.join(' ')}` : '';
      message = `${data?.error || `Request failed (${status}).`}${details}`;
    }
    const error = new Error(message);
    error.status = status;
    return Promise.reject(error);
  }
);

export default api;
