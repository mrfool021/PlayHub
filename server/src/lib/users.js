'use strict';

/**
 * Helpers so every endpoint renders users the same way (id, username, avatarUrl).
 *
 * Avatar rules:
 *   uploaded avatar  -> "/api/users/:id/avatar?v=<etag>" (served by the users controller, cache-busted)
 *   external URL     -> the https:// URL itself
 *   neither          -> null (the UI draws a coloured initial instead)
 */

function avatarUrlFor(id, externalUrl, etag) {
  if (etag) return `/api/users/${id}/avatar?v=${encodeURIComponent(etag)}`;
  return externalUrl || null;
}

/** Row aliases: <prefix>id, <prefix>username, <prefix>avatar_url, <prefix>avatar_ver */
function publicUserFromRow(row, prefix = '') {
  const id = row[`${prefix}id`];
  return {
    id,
    username: row[`${prefix}username`],
    avatarUrl: avatarUrlFor(id, row[`${prefix}avatar_url`], row[`${prefix}avatar_ver`]),
  };
}

module.exports = { avatarUrlFor, publicUserFromRow };
