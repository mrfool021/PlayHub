'use strict';

const { parseId, validateComment } = require('../validation');
const { publicUserFromRow } = require('../lib/users');

const PAGE_SIZE = 20; // top-level comments per page (the SQL below fetches PAGE_SIZE + 1 to detect "has more")

// All statements are constant strings; request values are bound with `?`.
const SQL_ROOTS_FIRST = `
  SELECT c.id, c.poll_id, c.parent_id, c.body, c.created_at,
         c.user_id AS uid, u.username AS uname, u.avatar_url AS uavatar_url, ua.etag AS uavatar_ver
  FROM comments c
  JOIN users u ON u.id = c.user_id
  LEFT JOIN user_avatars ua ON ua.user_id = u.id
  WHERE c.poll_id = ? AND c.parent_id IS NULL
  ORDER BY c.id DESC LIMIT 21`;
const SQL_ROOTS_BEFORE = `
  SELECT c.id, c.poll_id, c.parent_id, c.body, c.created_at,
         c.user_id AS uid, u.username AS uname, u.avatar_url AS uavatar_url, ua.etag AS uavatar_ver
  FROM comments c
  JOIN users u ON u.id = c.user_id
  LEFT JOIN user_avatars ua ON ua.user_id = u.id
  WHERE c.poll_id = ? AND c.parent_id IS NULL AND c.id < ?
  ORDER BY c.id DESC LIMIT 21`;
// Replies of one page of roots. The roots on a page are the newest N roots below the cursor,
// so every reply whose parent id lies between the oldest and newest root belongs to that page.
const SQL_REPLIES_BETWEEN = `
  SELECT c.id, c.poll_id, c.parent_id, c.body, c.created_at,
         c.user_id AS uid, u.username AS uname, u.avatar_url AS uavatar_url, ua.etag AS uavatar_ver
  FROM comments c
  JOIN users u ON u.id = c.user_id
  LEFT JOIN user_avatars ua ON ua.user_id = u.id
  WHERE c.poll_id = ? AND c.parent_id BETWEEN ? AND ?
  ORDER BY c.id ASC`;
const SQL_ONE = `
  SELECT c.id, c.poll_id, c.parent_id, c.body, c.created_at,
         c.user_id AS uid, u.username AS uname, u.avatar_url AS uavatar_url, ua.etag AS uavatar_ver
  FROM comments c
  JOIN users u ON u.id = c.user_id
  LEFT JOIN user_avatars ua ON ua.user_id = u.id
  WHERE c.id = ?`;
const SQL_COUNT = 'SELECT COUNT(*) AS total FROM comments WHERE poll_id = ?';
const SQL_POLL_ACTIVE = 'SELECT id FROM polls WHERE id = ? AND is_active = 1';
const SQL_PARENT = 'SELECT id, parent_id FROM comments WHERE id = ? AND poll_id = ?';
const SQL_INSERT = 'INSERT INTO comments (poll_id, user_id, parent_id, body) VALUES (?, ?, ?, ?)';
// Ownership is part of the WHERE clause, so check-and-delete is a single atomic statement
const SQL_DELETE = 'DELETE FROM comments WHERE id = ? AND poll_id = ? AND user_id = ?';

function toComment(row) {
  return {
    id: row.id,
    pollId: row.poll_id,
    parentId: row.parent_id,
    body: row.body,
    createdAt: row.created_at,
    user: publicUserFromRow({
      id: row.uid,
      username: row.uname,
      avatar_url: row.uavatar_url,
      avatar_ver: row.uavatar_ver,
    }),
  };
}

function createCommentsController(pool) {
  // GET /api/polls/:id/comments?before=<commentId>
  async function listComments(req, res) {
    const pollId = parseId(req.params.id);
    if (!pollId) return res.status(400).json({ error: 'Invalid poll id.' });

    let before = null;
    if (req.query.before !== undefined) {
      before = parseId(req.query.before);
      if (!before) return res.status(400).json({ error: 'Invalid cursor.' });
    }

    const [active] = await pool.execute(SQL_POLL_ACTIVE, [pollId]);
    if (active.length === 0) return res.status(404).json({ error: 'Poll not found.' });

    const [[rootRows], [countRows]] = await Promise.all([
      before
        ? pool.execute(SQL_ROOTS_BEFORE, [pollId, before])
        : pool.execute(SQL_ROOTS_FIRST, [pollId]),
      pool.execute(SQL_COUNT, [pollId]),
    ]);

    const hasMore = rootRows.length > PAGE_SIZE;
    const pageRows = hasMore ? rootRows.slice(0, PAGE_SIZE) : rootRows;
    const comments = pageRows.map((r) => ({ ...toComment(r), replies: [] }));

    if (comments.length > 0) {
      const ids = comments.map((c) => c.id);
      const [replyRows] = await pool.execute(SQL_REPLIES_BETWEEN, [
        pollId,
        Math.min(...ids),
        Math.max(...ids),
      ]);
      const byId = new Map(comments.map((c) => [c.id, c]));
      for (const r of replyRows) byId.get(r.parent_id)?.replies.push(toComment(r));
    }

    return res.status(200).json({
      total: Number(countRows[0].total),
      comments,
      nextCursor: hasMore ? comments[comments.length - 1].id : null,
    });
  }

  // POST /api/polls/:id/comments - body: { body, parentId? }
  async function addComment(req, res) {
    const pollId = parseId(req.params.id);
    if (!pollId) return res.status(400).json({ error: 'Invalid poll id.' });

    const result = validateComment(req.body);
    if (!result.ok) {
      return res.status(400).json({ error: 'Validation failed.', details: result.errors });
    }
    let { body, parentId } = result.value;

    const [active] = await pool.execute(SQL_POLL_ACTIVE, [pollId]);
    if (active.length === 0) return res.status(404).json({ error: 'Poll not found.' });

    if (parentId) {
      const [parents] = await pool.execute(SQL_PARENT, [parentId, pollId]);
      if (parents.length === 0) {
        return res.status(404).json({ error: 'The comment you are replying to does not exist.' });
      }
      // Threads are one level deep: replying to a reply attaches to the thread's root
      parentId = parents[0].parent_id || parents[0].id;
    }

    let insertId;
    try {
      const [inserted] = await pool.execute(SQL_INSERT, [pollId, req.user.id, parentId, body]);
      insertId = inserted.insertId;
    } catch (err) {
      if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(404).json({ error: 'Poll or parent comment not found.' });
      }
      throw err;
    }

    const [rows] = await pool.execute(SQL_ONE, [insertId]);
    return res.status(201).json({ ...toComment(rows[0]), replies: [] });
  }

  // DELETE /api/polls/:id/comments/:commentId - only the author can delete
  async function deleteComment(req, res) {
    const pollId = parseId(req.params.id);
    const commentId = parseId(req.params.commentId);
    if (!pollId || !commentId) return res.status(400).json({ error: 'Invalid id.' });

    const [result] = await pool.execute(SQL_DELETE, [commentId, pollId, req.user.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Comment not found, or it is not yours.' });
    }
    return res.status(204).end();
  }

  return { listComments, addComment, deleteComment };
}

module.exports = { createCommentsController, PAGE_SIZE };
