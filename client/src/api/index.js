// All HTTP calls of the app. Each function returns the parsed JSON body.
import api, { AUTH_EXPIRED_EVENT, getToken, setToken } from './axios.js';

export { AUTH_EXPIRED_EVENT, getToken, setToken };

const data = (promise) => promise.then((response) => response.data);

// ---- polls ----------------------------------------------------------------
export const getPolls = (scope, signal) =>
  data(api.get('/polls', { params: scope === 'following' ? { scope } : undefined, signal }));
export const getPoll = (id, signal) => data(api.get(`/polls/${id}`, { signal }));
export const createPoll = (poll) => data(api.post('/polls', poll));
export const deletePoll = (id) => data(api.delete(`/polls/${id}`));
export const votePoll = (id, optionId) => data(api.post(`/polls/${id}/vote`, { optionId }));

// ---- auth -----------------------------------------------------------------
export const registerUser = (credentials) => data(api.post('/auth/register', credentials));
export const loginUser = (credentials) => data(api.post('/auth/login', credentials));
export const getMe = (signal) => data(api.get('/auth/me', { signal }));

// ---- comments ---------------------------------------------------------------
export const getComments = (pollId, { before, signal } = {}) =>
  data(api.get(`/polls/${pollId}/comments`, { params: before ? { before } : undefined, signal }));
export const postComment = (pollId, { body, parentId }) =>
  data(api.post(`/polls/${pollId}/comments`, { body, parentId }));
export const deleteComment = (pollId, commentId) =>
  data(api.delete(`/polls/${pollId}/comments/${commentId}`));

// ---- social graph -------------------------------------------------------------
export const followUser = (id) => data(api.post(`/users/${id}/follow`));
export const unfollowUser = (id) => data(api.delete(`/users/${id}/follow`));
export const getFollowList = (id, tab, page = 1, signal) =>
  data(api.get(`/users/${id}/${tab}`, { params: { page }, signal }));

// ---- avatars ------------------------------------------------------------------
export const setAvatarImage = (image) => data(api.put('/users/me/avatar', { image }));
export const setAvatarUrl = (url) => data(api.put('/users/me/avatar', { url }));
export const removeAvatar = () => data(api.delete('/users/me/avatar'));

// ---- search / profiles ----------------------------------------------------------
export const searchAll = (q, signal) => data(api.get('/search', { params: { q }, signal }));
export const getUser = (id, signal) => data(api.get(`/users/${id}`, { signal }));

// ---------------------------------------------------------------------------
// Protected images. <img src> cannot send an Authorization header, so photos
// and avatars are fetched through axios (which adds the token) and shown via a
// blob: URL. Results are cached per URL (avatar URLs carry ?v=<etag>, so a new
// upload automatically gets a new cache entry).
// ---------------------------------------------------------------------------
const imageCache = new Map();

export function fetchImageUrl(path) {
  if (imageCache.has(path)) return imageCache.get(path);
  // image paths from the API look like "/api/polls/3/image"; the axios baseURL already ends in /api
  const promise = api
    .get(path.replace(/^\/api/, ''), { responseType: 'blob' })
    .then((response) => URL.createObjectURL(response.data));
  imageCache.set(path, promise);
  promise.catch(() => imageCache.delete(path)); // allow a retry after a failure
  return promise;
}

export function clearImageCache() {
  for (const p of imageCache.values()) p.then((url) => URL.revokeObjectURL(url)).catch(() => {});
  imageCache.clear();
}
