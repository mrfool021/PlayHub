'use strict';

const bcrypt = require('bcryptjs');
const { validateRegister, validateLogin } = require('../validation');
const { signToken } = require('../middleware/auth');
const { avatarUrlFor } = require('../lib/users');

// All statements are constant strings; user input only travels as parameters.
const SQL_INSERT_USER = 'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)';
const SQL_FIND_FOR_LOGIN = `
  SELECT u.id, u.username, u.email, u.password_hash, u.avatar_url, ua.etag AS avatar_ver
  FROM users u
  LEFT JOIN user_avatars ua ON ua.user_id = u.id
  WHERE u.email = ? OR u.username = ? LIMIT 1`;
const SQL_FIND_BY_ID = `
  SELECT u.id, u.username, u.email, u.created_at, u.avatar_url, ua.etag AS avatar_ver
  FROM users u
  LEFT JOIN user_avatars ua ON ua.user_id = u.id
  WHERE u.id = ?`;

const publicUser = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  avatarUrl: avatarUrlFor(row.id, row.avatar_url, row.avatar_ver),
});

function createAuthController(pool, { jwtSecret, jwtExpiresIn, bcryptCost = 12 }) {
  const tokenOptions = { jwtSecret, jwtExpiresIn };

  // Comparing against a real bcrypt hash when the user does not exist keeps the
  // response time similar, so attackers cannot probe which accounts exist.
  const dummyHash = bcrypt.hashSync('not-a-real-password', bcryptCost);

  // POST /api/auth/register - body: { username, email, password }
  async function register(req, res) {
    const result = validateRegister(req.body);
    if (!result.ok) {
      return res.status(400).json({ error: 'Validation failed.', details: result.errors });
    }
    const { username, email, password } = result.value;
    const passwordHash = await bcrypt.hash(password, bcryptCost);

    let insertId;
    try {
      const [inserted] = await pool.execute(SQL_INSERT_USER, [username, email, passwordHash]);
      insertId = inserted.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'That username or email is already in use.' });
      }
      throw err;
    }

    const user = { id: insertId, username, email, avatarUrl: null };
    return res.status(201).json({ token: signToken(user, tokenOptions), user });
  }

  // POST /api/auth/login - body: { identifier, password }
  async function login(req, res) {
    const result = validateLogin(req.body);
    if (!result.ok) {
      return res.status(400).json({ error: 'Validation failed.', details: result.errors });
    }
    const { identifier, password } = result.value;

    const [rows] = await pool.execute(SQL_FIND_FOR_LOGIN, [identifier.toLowerCase(), identifier]);
    const row = rows[0];

    // Always run one bcrypt comparison, whether or not the user exists
    const matches = await bcrypt.compare(password, row ? row.password_hash : dummyHash);
    if (!row || !matches) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }
    return res.status(200).json({ token: signToken(row, tokenOptions), user: publicUser(row) });
  }

  // GET /api/auth/me - the logged-in user (the client uses it to validate a stored token)
  async function me(req, res) {
    const [rows] = await pool.execute(SQL_FIND_BY_ID, [req.user.id]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid or expired token.' });
    return res.status(200).json({ user: { ...publicUser(rows[0]), createdAt: rows[0].created_at } });
  }

  return { register, login, me };
}

module.exports = { createAuthController };
