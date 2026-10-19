'use strict';

const crypto = require('crypto');
const { validateNewPoll, parseId } = require('../validation');
const { publicUserFromRow } = require('../lib/users');

// ---------------------------------------------------------------------------
// SQL - every statement is a constant string. User input only ever travels in
// the parameter array (prepared statements with `?`), never inside the SQL text.
// ---------------------------------------------------------------------------
const SQL_LIST_ACTIVE = `
  SELECT p.id, p.question, p.description, p.category, p.is_active, p.created_at, p.created_by,
         u.username AS creator, u.avatar_url AS creator_avatar_url, ua.etag AS creator_avatar_ver,
         (pi.poll_id IS NOT NULL) AS has_image,
         (SELECT COUNT(*) FROM comments c WHERE c.poll_id = p.id) AS comment_count,
         o.id AS option_id, o.label, COUNT(v.id) AS votes
  FROM polls p
  JOIN options o ON o.poll_id = p.id
  LEFT JOIN votes v ON v.option_id = o.id
  LEFT JOIN users u ON u.id = p.created_by
  LEFT JOIN user_avatars ua ON ua.user_id = u.id
  LEFT JOIN poll_images pi ON pi.poll_id = p.id
  WHERE p.is_active = 1
  GROUP BY p.id, p.question, p.description, p.category, p.is_active, p.created_at, p.created_by,
           u.username, u.avatar_url, ua.etag, pi.poll_id, o.id, o.label
  ORDER BY p.created_at DESC, p.id DESC, o.id ASC
`;

// Feed of polls created by accounts the logged-in user follows
const SQL_LIST_FOLLOWING = `
  SELECT p.id, p.question, p.description, p.category, p.is_active, p.created_at, p.created_by,
         u.username AS creator, u.avatar_url AS creator_avatar_url, ua.etag AS creator_avatar_ver,
         (pi.poll_id IS NOT NULL) AS has_image,
         (SELECT COUNT(*) FROM comments c WHERE c.poll_id = p.id) AS comment_count,
         o.id AS option_id, o.label, COUNT(v.id) AS votes
  FROM polls p
  JOIN options o ON o.poll_id = p.id
  LEFT JOIN votes v ON v.option_id = o.id
  LEFT JOIN users u ON u.id = p.created_by
  LEFT JOIN user_avatars ua ON ua.user_id = u.id
  LEFT JOIN poll_images pi ON pi.poll_id = p.id
  WHERE p.is_active = 1
    AND p.created_by IN (SELECT f.following_id FROM follows f WHERE f.follower_id = ?)
  GROUP BY p.id, p.question, p.description, p.category, p.is_active, p.created_at, p.created_by,
           u.username, u.avatar_url, ua.etag, pi.poll_id, o.id, o.label
  ORDER BY p.created_at DESC, p.id DESC, o.id ASC
`;

const SQL_BY_ID = `
  SELECT p.id, p.question, p.description, p.category, p.is_active, p.created_at, p.created_by,
         u.username AS creator, u.avatar_url AS creator_avatar_url, ua.etag AS creator_avatar_ver,
         (pi.poll_id IS NOT NULL) AS has_image,
         (SELECT COUNT(*) FROM comments c WHERE c.poll_id = p.id) AS comment_count,
         o.id AS option_id, o.label, COUNT(v.id) AS votes
  FROM polls p
  JOIN options o ON o.poll_id = p.id
  LEFT JOIN votes v ON v.option_id = o.id
  LEFT JOIN users u ON u.id = p.created_by
  LEFT JOIN user_avatars ua ON ua.user_id = u.id
  LEFT JOIN poll_images pi ON pi.poll_id = p.id
  WHERE p.id = ?
  GROUP BY p.id, p.question, p.description, p.category, p.is_active, p.created_at, p.created_by,
           u.username, u.avatar_url, ua.etag, pi.poll_id, o.id, o.label
  ORDER BY p.created_at DESC, p.id DESC, o.id ASC
`;

const SQL_ACTIVE_CHECK = 'SELECT id FROM polls WHERE id = ? AND is_active = 1';
const SQL_OWNER_CHECK = 'SELECT id, created_by FROM polls WHERE id = ?';
const SQL_INSERT_POLL =
  'INSERT INTO polls (question, description, category, created_by) VALUES (?, ?, ?, ?)';
const SQL_INSERT_OPTION = 'INSERT INTO options (poll_id, label) VALUES (?, ?)';
const SQL_INSERT_IMAGE = 'INSERT INTO poll_images (poll_id, mime, data) VALUES (?, ?, ?)';
const SQL_GET_IMAGE =
  'SELECT pi.mime, pi.data FROM poll_images pi JOIN polls p ON p.id = pi.poll_id WHERE pi.poll_id = ? AND p.is_active = 1';
const SQL_INSERT_VOTE = 'INSERT INTO votes (poll_id, option_id, voter_hash) VALUES (?, ?, ?)';
// Ownership is part of the WHERE clause, so check-and-delete is one atomic statement.
// options, votes, comments and the image are removed by ON DELETE CASCADE.
const SQL_DELETE_POLL = 'DELETE FROM polls WHERE id = ? AND created_by = ?';

/** Turns flat JOIN rows into [{ id, question, options: [{ id, label, votes }] }] */
function rowsToPolls(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (!byId.has(row.id)) {
      byId.set(row.id, {
        id: row.id,
        question: row.question,
        description: row.description || '',
        category: row.category,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        creator: row.creator
          ? publicUserFromRow({
              id: row.created_by,
              username: row.creator,
              avatar_url: row.creator_avatar_url,
              avatar_ver: row.creator_avatar_ver,
            })
          : null,
        imageUrl: row.has_image ? `/api/polls/${row.id}/image` : null,
        commentCount: Number(row.comment_count || 0),
        totalVotes: 0,
        options: [],
      });
    }
    const poll = byId.get(row.id);
    const votes = Number(row.votes);
    poll.options.push({ id: row.option_id, label: row.label, votes });
    poll.totalVotes += votes;
  }
  return [...byId.values()];
}

/**
 * Builds the named route handlers for /api/polls.
 * The pool is injected so tests can pass a mock and run without MySQL.
 */
function createPollsController(pool, { enforceOneVote, voterSalt, pollImageMaxBytes }) {
  async function fetchPollById(id) {
    const [rows] = await pool.execute(SQL_BY_ID, [id]);
    return rowsToPolls(rows)[0] || null;
  }

  // One vote per ACCOUNT per poll. The hash comes from the user id (not the IP),
  // so switching networks cannot grant a second vote. It reuses the
  // UNIQUE (poll_id, voter_hash) index. NULL hashes never collide.
  function voterHash(userId, pollId) {
    if (!enforceOneVote) return null;
    return crypto.createHash('sha256').update(`${voterSalt}|${pollId}|user:${userId}`).digest('hex');
  }

  // GET /api/polls[?scope=following] -> 200 with every active poll
  async function listPolls(req, res, next) {
    try {
      if (req.query.scope === 'following') {
        if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
        const [rows] = await pool.execute(SQL_LIST_FOLLOWING, [req.user.id]);
        return res.status(200).json(rowsToPolls(rows));
      }
      const [rows] = await pool.execute(SQL_LIST_ACTIVE);
      return res.status(200).json(rowsToPolls(rows));
    } catch (err) {
      return next(err);
    }
  }

  // GET /api/polls/:id -> 200 with one poll, 404 if it does not exist
  async function getPollById(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid poll id.' });

      const poll = await fetchPollById(id);
      if (!poll) return res.status(404).json({ error: 'Poll not found.' });
      return res.status(200).json(poll);
    } catch (err) {
      return next(err);
    }
  }

  // GET /api/polls/:id/image -> the attached photo
  async function getPollImage(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid poll id.' });
      const [rows] = await pool.execute(SQL_GET_IMAGE, [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Image not found.' });
      res.set({
        'Content-Type': rows[0].mime,
        'Cache-Control': 'public, max-age=31536000, immutable', // poll images never change
        'Content-Security-Policy': "default-src 'none'; sandbox",
      });
      return res.status(200).end(rows[0].data);
    } catch (err) {
      return next(err);
    }
  }

  // POST /api/polls -> 201 with the created poll, 400 when validation fails
  async function createPoll(req, res, next) {
    let conn;
    try {
      const result = validateNewPoll(req.body, { pollImageMaxBytes });
      if (!result.ok) {
        return res.status(400).json({ error: 'Validation failed.', details: result.errors });
      }
      const { question, description, category, options, image } = result.value;

      // The poll, its options and its photo are stored in ONE transaction
      conn = await pool.getConnection();
      await conn.beginTransaction();
      const [inserted] = await conn.execute(SQL_INSERT_POLL, [
        question,
        description,
        category,
        req.user.id,
      ]);
      const pollId = inserted.insertId;
      for (const label of options) {
        await conn.execute(SQL_INSERT_OPTION, [pollId, label]);
      }
      if (image) {
        await conn.execute(SQL_INSERT_IMAGE, [pollId, image.mime, image.buffer]);
      }
      await conn.commit();

      const poll = await fetchPollById(pollId);
      return res.status(201).location(`/api/polls/${pollId}`).json(poll);
    } catch (err) {
      if (conn) {
        try {
          await conn.rollback();
        } catch (_) {
          /* connection already broken - nothing more to do */
        }
      }
      return next(err);
    } finally {
      if (conn) conn.release();
    }
  }

  // DELETE /api/polls/:id -> 200 when deleted, 404 if missing, 403 if it is not yours
  async function deletePoll(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid poll id.' });

      const [found] = await pool.execute(SQL_OWNER_CHECK, [id]);
      if (found.length === 0) return res.status(404).json({ error: 'Poll not found.' });
      if (found[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'You can only delete your own polls.' });
      }

      const [result] = await pool.execute(SQL_DELETE_POLL, [id, req.user.id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Poll not found.' });
      return res.status(200).json({ message: 'Poll deleted.', id });
    } catch (err) {
      return next(err);
    }
  }

  // POST /api/polls/:id/vote - body: { optionId }
  async function votePoll(req, res, next) {
    try {
      const pollId = parseId(req.params.id);
      const optionId = parseId(req.body && req.body.optionId);
      if (!pollId) return res.status(400).json({ error: 'Invalid poll id.' });
      if (!optionId) return res.status(400).json({ error: 'optionId must be a positive integer.' });

      const [active] = await pool.execute(SQL_ACTIVE_CHECK, [pollId]);
      if (active.length === 0) {
        return res.status(404).json({ error: 'Poll not found or no longer active.' });
      }

      try {
        await pool.execute(SQL_INSERT_VOTE, [pollId, optionId, voterHash(req.user.id, pollId)]);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'You have already voted in this poll.' });
        }
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
          return res.status(400).json({ error: 'That option does not belong to this poll.' });
        }
        throw err;
      }

      const poll = await fetchPollById(pollId);
      return res.status(201).json(poll);
    } catch (err) {
      return next(err);
    }
  }

  return { listPolls, getPollById, getPollImage, createPoll, deletePoll, votePoll };
}

module.exports = { createPollsController, rowsToPolls };
