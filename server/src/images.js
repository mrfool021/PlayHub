'use strict';

/**
 * Base64 image handling (no multipart parser / no extra npm packages needed).
 *
 * Clients send images inside the JSON body as a data URL:
 *   "data:image/jpeg;base64,/9j/4AAQ..."
 *
 * Security rules:
 *  - only PNG, JPEG, WebP and GIF. SVG is deliberately NOT allowed (it can carry scripts).
 *  - the declared MIME type must match the real file signature ("magic bytes"),
 *    so a renamed .html / .exe can never be stored as an image.
 *  - a hard decoded-size cap per image kind.
 */

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const HEADER_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/; // linear scan, no backtracking risk

const DEFAULT_LIMITS = {
  pollImageMaxBytes: 1.5 * 1024 * 1024, // decoded bytes
  avatarMaxBytes: 256 * 1024,
};

function matchesSignature(mime, buf) {
  if (buf.length < 12) return false;
  switch (mime) {
    case 'image/png':
      return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/gif': {
      const sig = buf.subarray(0, 6).toString('latin1');
      return sig === 'GIF87a' || sig === 'GIF89a';
    }
    case 'image/webp':
      return buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
    default:
      return false;
  }
}

/**
 * @returns {{ ok: true, mime: string, buffer: Buffer } | { ok: false, error: string }}
 */
function parseImageDataUrl(value, maxBytes) {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, error: 'image must be a base64 data URL string.' };
  }
  // Cheap early reject, before any decoding work (base64 is ~4/3 of the raw size)
  if (value.length > Math.ceil((maxBytes * 4) / 3) + 128) {
    return { ok: false, error: `image is too large (max ${Math.round(maxBytes / 1024)} KB).` };
  }

  const comma = value.indexOf(',');
  if (comma < 0 || comma > 40) {
    return { ok: false, error: 'image must be a data URL like "data:image/png;base64,...".' };
  }
  const header = HEADER_RE.exec(value.slice(0, comma));
  if (!header) {
    return { ok: false, error: `image type must be one of: ${ALLOWED_MIME.join(', ')}.` };
  }
  const b64 = value.slice(comma + 1);
  if (!BASE64_RE.test(b64) || b64.length % 4 !== 0) {
    return { ok: false, error: 'image is not valid base64.' };
  }

  const buffer = Buffer.from(b64, 'base64');
  if (buffer.length > maxBytes) {
    return { ok: false, error: `image is too large (max ${Math.round(maxBytes / 1024)} KB).` };
  }
  if (!matchesSignature(header[1], buffer)) {
    return { ok: false, error: 'image content does not match its declared type.' };
  }
  return { ok: true, mime: header[1], buffer };
}

module.exports = { ALLOWED_MIME, DEFAULT_LIMITS, parseImageDataUrl };
