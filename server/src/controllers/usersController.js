'use strict';

const crypto = require('crypto');
const { parseId, validateAvatar, parsePage } = require('../validation');
const { avatarUrlFor, publicUserFromRow } = require('../lib/users');

const FOLLOW_PAGE_SIZE = 30; // the SQL below fetches 31 rows (PAGE_SIZE + 1) to detect "has more"

// ---------------------------------------------------------------------------
// SQL (constant strings; request values are always bound with `?`)
// ---------------------------------------------------------------------------
const SQL_PROFILE = `
  SELECT u.id, u.username, u.created_at, u.avatar_url, ua.etag AS avatar_ver,
         (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id) AS followers_count,
         (SELECT COUNT(*) FROM follows f WHERE f.follower_id  = u.id) AS following_count,
         EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = u.id) AS is_following
  FROM users u
  LEFT JOIN user_avatars ua ON ua.user_id = u.id
  WHERE u.id = ?
`;
const SQL_USER_POLLS = `
  SELECT p.id, p.question, p.created_at, (pi.poll_id IS NOT NULL) AS has_image
  FROM polls p
  LEFT JOIN poll_images pi ON pi.poll_id = p.id
  WHERE p.created_by = ? AND p.is_active = 1
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT 50
`;
const SQL_USER_EXISTS = 'SELECT id, username FROM users WHERE id = ?';
const SQL_GET_AVATAR = 'SELECT mime, data FROM user_avatars WHERE user_id = ?';
// REPLACE keeps working on every MySQL/MariaDB version (it deletes + re-inserts the single row)
const SQL_UPSERT_AVATAR = 'REPLACE INTO user_avatars (user_id, mime, data, etag) VALUES (?, ?, ?, ?)';
const SQL_DELETE_AVATAR = 'DELETE FROM user_avatars WHERE user_id = ?';
const SQL_SET_AVATAR_URL = 'UPDATE users SET avatar_url = ? WHERE id = ?';
const SQL_AVATAR_STATE = `
  SELECT u.id, u.username, u.avatar_url, ua.etag AS avatar_ver
  FROM users u
  LEFT JOIN user_avatars ua ON ua.user_id = u.id
  WHERE u.id = ?
`;

const SQL_FOLLOW = 'INSERT IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)';
const SQL_UNFOLLOW = 'DELETE FROM follows WHERE follower_id = ? AND following_id = ?';
const SQL_FOLLOWER_COUNT = 'SELECT COUNT(*) AS n FROM follows WHERE following_id = ?';

// Follow lists. Both the page size (31 = 30 + 1) and the direction are fixed in the
// SQL text; the page offset is a bound parameter (sent as a string, which mysql2
// prepared statements require for LIMIT/OFFSET placeholders).
const SQL_FOLLOWERS_PAGE = `
  SELECT u.id, u.username, u.avatar_url, ua.etag AS avatar_ver,
         EXISTS(SELECT 1 FROM follows x WHERE x.follower_id = ? AND x.following_id = u.id) AS is_following
  FROM follows f
  JOIN users u ON u.id = f.follower_id
  LEFT JOIN user_avatars ua ON ua.user_id = u.id
  WHERE f.following_id = ?
  ORDER BY f.created_at DESC, u.id DESC
  LIMIT 31 OFFSET ?
`;
const SQL_FOLLOWING_PAGE = `
  SELECT u.id, u.username, u.avatar_url, ua.etag AS avatar_ver,
         EXISTS(SELECT 1 FROM follows x WHERE x.follower_id = ? AND x.following_id = u.id) AS is_following
  FROM follows f
  JOIN users u ON u.id = f.following_id
  LEFT JOIN user_avatars ua ON ua.user_id = u.id
  WHERE f.follower_id = ?
  ORDER BY f.created_at DESC, u.id DESC
  LIMIT 31 OFFSET ?
`;

function createUsersController(pool, { avatarMaxBytes }) {
  async function avatarState(userId) {
    const [rows] = await pool.execute(SQL_AVATAR_STATE, [userId]);
    return publicUserFromRow(rows[0]);
  }

  // PUT /api/users/me/avatar - body: { image: "data:image/...;base64,..." } OR { url: "https://..." }
  async function setAvatar(req, res) {
    const result = validateAvatar(req.body, { avatarMaxBytes });
    if (!result.ok) {
      return res.status(400).json({ error: 'Validation failed.', details: result.errors });
    }
    const { image, url } = result.value;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (image) {
        const etag = crypto.randomBytes(8).toString('hex');
        await conn.execute(SQL_UPSERT_AVATAR, [req.user.id, image.mime, image.buffer, etag]);
        await conn.execute(SQL_SET_AVATAR_URL, [null, req.user.id]);
      } else {
        await conn.execute(SQL_DELETE_AVATAR, [req.user.id]);
        await conn.execute(SQL_SET_AVATAR_URL, [url, req.user.id]);
      }
      await conn.commit();
    } catch (err) {
      try {
        await conn.rollback();
      } catch (_) {
        /* connection already broken */
      }
      throw err;
    } finally {
      conn.release();
    }
    return res.status(200).json({ user: await avatarState(req.user.id) });
  }

  // DELETE /api/users/me/avatar - back to the initial-letter placeholder
  async function removeAvatar(req, res) {
    await pool.execute(SQL_DELETE_AVATAR, [req.user.id]);
    await pool.execute(SQL_SET_AVATAR_URL, [null, req.user.id]);
    return res.status(200).json({ user: await avatarState(req.user.id) });
  }

  // GET /api/users/:id/avatar - uploaded avatar bytes
  async function getAvatar(req, res) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id.' });
    const [rows] = await pool.execute(SQL_GET_AVATAR, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'No avatar.' });
    res.set({
      'Content-Type': rows[0].mime,
      // The URL carries ?v=<etag>, so a new upload gets a new URL: safe to cache hard
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    return res.status(200).end(rows[0].data);
  }

  // GET /api/users/:id - public profile
  async function getProfile(req, res) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id.' });

    const [users] = await pool.execute(SQL_PROFILE, [req.user.id, id]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found.' });
    const u = users[0];

    const [polls] = await pool.execute(SQL_USER_POLLS, [id]);
    return res.status(200).json({
      ...publicUserFromRow(u),
      createdAt: u.created_at,
      followersCount: Number(u.followers_count),
      followingCount: Number(u.following_count),
      isFollowing: Boolean(Number(u.is_following)),
      polls: polls.map((p) => ({
        id: p.id,
        question: p.question,
        createdAt: p.created_at,
        imageUrl: p.has_image ? `/api/polls/${p.id}/image` : null,
      })),
    });
  }

  // POST /api/users/:id/follow (idempotent)
  async function followUser(req, res) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id.' });
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot follow yourself.' });

    const [exists] = await pool.execute(SQL_USER_EXISTS, [id]);
    if (exists.length === 0) return res.status(404).json({ error: 'User not found.' });

    await pool.execute(SQL_FOLLOW, [req.user.id, id]);
    const [[count]] = await pool.execute(SQL_FOLLOWER_COUNT, [id]);
    return res.status(201).json({ following: true, followersCount: Number(count.n) });
  }

  // DELETE /api/users/:id/follow (idempotent)
  async function unfollowUser(req, res) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id.' });

    await pool.execute(SQL_UNFOLLOW, [req.user.id, id]);
    const [[count]] = await pool.execute(SQL_FOLLOWER_COUNT, [id]);
    return res.status(200).json({ following: false, followersCount: Number(count.n) });
  }

  // Shared by listFollowers / listFollowing: GET /api/users/:id/<direction>?page=1
  async function listFollowPage(req, res, sql) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id.' });
    const page = parsePage(req.query.page);
    if (!page) return res.status(400).json({ error: 'Invalid page.' });

    const [exists] = await pool.execute(SQL_USER_EXISTS, [id]);
    if (exists.length === 0) return res.status(404).json({ error: 'User not found.' });

    const offset = String((page - 1) * FOLLOW_PAGE_SIZE);
    const [rows] = await pool.execute(sql, [req.user.id, id, offset]);
    const hasMore = rows.length > FOLLOW_PAGE_SIZE;
    return res.status(200).json({
      user: { id: exists[0].id, username: exists[0].username },
      page,
      hasMore,
      users: (hasMore ? rows.slice(0, FOLLOW_PAGE_SIZE) : rows).map((r) => ({
        ...publicUserFromRow(r),
        isFollowing: Boolean(Number(r.is_following)),
      })),
    });
  }

  async function listFollowers(req, res) {
    return listFollowPage(req, res, SQL_FOLLOWERS_PAGE);
  }

  async function listFollowing(req, res) {
    return listFollowPage(req, res, SQL_FOLLOWING_PAGE);
  }

  return {
    setAvatar,
    removeAvatar,
    getAvatar,
    getProfile,
    followUser,
    unfollowUser,
    listFollowers,
    listFollowing,
  };
}

module.exports = { createUsersController, avatarUrlFor, FOLLOW_PAGE_SIZE };
