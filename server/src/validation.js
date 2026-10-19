'use strict';

const { parseImageDataUrl, DEFAULT_LIMITS: IMAGE_LIMITS } = require('./images');

/**
 * Input validation & sanitization helpers.
 *
 * Defense in depth:
 *  1. Every SQL statement is parameterized (see routes/polls.js)  -> SQL injection
 *  2. Text is sanitized here (tags / control characters removed)  -> stored XSS
 *  3. React escapes all rendered text on the client               -> XSS
 */

const LIMITS = {
  QUESTION_MIN: 5,
  QUESTION_MAX: 255,
  OPTION_MAX: 120,
  OPTIONS_MIN: 2,
  OPTIONS_MAX: 10,
  DESCRIPTION_MAX: 500,
};

const CATEGORIES = ['General', 'FPS', 'RPG', 'Strategy', 'Sports', 'Indie', 'Other'];

const MAX_INT = 2147483647; // INT UNSIGNED columns are used, this is a conservative cap

function sanitizeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(/<[^>]*>/g, '') // strip HTML tags
    .replace(/[<>]/g, '') // strip stray angle brackets
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ') // control characters -> space
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns a positive integer or null. Accepts numbers and numeric strings only. */
function parseId(value) {
  const str = typeof value === 'number' ? String(value) : value;
  if (typeof str !== 'string' || !/^[1-9]\d{0,9}$/.test(str)) return null;
  const n = Number(str);
  return n <= MAX_INT ? n : null;
}

function validateNewPoll(body, { pollImageMaxBytes = IMAGE_LIMITS.pollImageMaxBytes } = {}) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: ['Request body must be a JSON object.'] };
  }

  const question = sanitizeText(body.question);
  if (question.length < LIMITS.QUESTION_MIN || question.length > LIMITS.QUESTION_MAX) {
    errors.push(
      `question must be between ${LIMITS.QUESTION_MIN} and ${LIMITS.QUESTION_MAX} characters.`
    );
  }

  // description is optional; category must be one of the known values
  const description = sanitizeMultiline(body.description);
  if (description.length > LIMITS.DESCRIPTION_MAX) {
    errors.push(`description must be at most ${LIMITS.DESCRIPTION_MAX} characters.`);
  }
  const category = body.category === undefined ? 'General' : body.category;
  if (!CATEGORIES.includes(category)) {
    errors.push(`category must be one of: ${CATEGORIES.join(', ')}.`);
  }

  let options = [];
  if (!Array.isArray(body.options)) {
    errors.push('options must be an array of strings.');
  } else if (
    body.options.length < LIMITS.OPTIONS_MIN ||
    body.options.length > LIMITS.OPTIONS_MAX
  ) {
    errors.push(
      `options must contain between ${LIMITS.OPTIONS_MIN} and ${LIMITS.OPTIONS_MAX} items.`
    );
  } else {
    options = body.options.map(sanitizeText);
    if (options.some((o) => o.length < 1 || o.length > LIMITS.OPTION_MAX)) {
      errors.push(`each option must be between 1 and ${LIMITS.OPTION_MAX} characters.`);
    }
    const lowered = options.map((o) => o.toLowerCase());
    if (new Set(lowered).size !== lowered.length) {
      errors.push('options must be unique.');
    }
  }

  // Optional photo. It is only ever accepted as part of THIS request: if the
  // question or options are invalid the whole request is rejected and nothing
  // (not even the image) is stored. There is no standalone upload endpoint.
  let image = null;
  const hasImageField = body.image !== undefined && body.image !== null;
  if (hasImageField) {
    const parsed = parseImageDataUrl(body.image, pollImageMaxBytes);
    if (!parsed.ok) errors.push(parsed.error);
    else image = { mime: parsed.mime, buffer: parsed.buffer };
    if (errors.length && !errors.some((e) => e.startsWith('An image'))) {
      const pollInvalid = errors.some((e) => /^(question|description|category|options|each option)/.test(e));
      if (pollInvalid) {
        errors.push('An image cannot be posted on its own: it must come with a valid question and at least 2 options.');
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], value: { question, description, category, options, image } };
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------
const COMMENT_MAX = 500;

/** Like sanitizeText but keeps line breaks (max one blank line in a row). */
function sanitizeMultiline(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function validateComment(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: ['Request body must be a JSON object.'] };
  }
  const errors = [];
  const text = sanitizeMultiline(body.body);
  if (text.length < 1 || text.length > COMMENT_MAX) {
    errors.push(`body must be between 1 and ${COMMENT_MAX} characters.`);
  }
  let parentId = null;
  if (body.parentId !== undefined && body.parentId !== null) {
    parentId = parseId(body.parentId);
    if (!parentId) errors.push('parentId must be a positive integer.');
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], value: { body: text, parentId } };
}

// ---------------------------------------------------------------------------
// Avatars: exactly one of { image: dataURL } or { url: https://... }
// ---------------------------------------------------------------------------
function validateAvatarUrl(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value.length < 8 || value.length > 500 || /\s/.test(value)) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) {
    return null;
  }
  return url.toString();
}

function validateAvatar(body, { avatarMaxBytes = IMAGE_LIMITS.avatarMaxBytes } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: ['Request body must be a JSON object.'] };
  }
  const hasImage = body.image !== undefined && body.image !== null;
  const hasUrl = body.url !== undefined && body.url !== null;
  if (hasImage === hasUrl) {
    return { ok: false, errors: ['Send exactly one of "image" (base64 data URL) or "url" (https link).'] };
  }
  if (hasImage) {
    const parsed = parseImageDataUrl(body.image, avatarMaxBytes);
    if (!parsed.ok) return { ok: false, errors: [parsed.error] };
    return { ok: true, errors: [], value: { image: { mime: parsed.mime, buffer: parsed.buffer } } };
  }
  const url = validateAvatarUrl(body.url);
  if (!url) return { ok: false, errors: ['url must be a valid https:// link (max 500 characters).'] };
  return { ok: true, errors: [], value: { url } };
}

/** ?page=N for the follower lists. Returns an integer 1..200. */
function parsePage(value) {
  if (value === undefined) return 1;
  const n = typeof value === 'string' && /^[1-9]\d{0,2}$/.test(value) ? Number(value) : null;
  return n && n <= 200 ? n : null;
}

// ---------------------------------------------------------------------------
// Authentication payloads
// ---------------------------------------------------------------------------
const AUTH_LIMITS = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 30,
  EMAIL_MAX: 255,
  PASSWORD_MIN: 8,
  PASSWORD_MAX_BYTES: 72, // bcrypt silently ignores anything past 72 bytes
};

const USERNAME_RE = /^[A-Za-z0-9_]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isPlainObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body);
}

function validateRegister(body) {
  if (!isPlainObject(body)) {
    return { ok: false, errors: ['Request body must be a JSON object.'] };
  }
  const errors = [];

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  if (
    username.length < AUTH_LIMITS.USERNAME_MIN ||
    username.length > AUTH_LIMITS.USERNAME_MAX ||
    !USERNAME_RE.test(username)
  ) {
    errors.push(
      `username must be ${AUTH_LIMITS.USERNAME_MIN}-${AUTH_LIMITS.USERNAME_MAX} characters: letters, numbers and underscores only.`
    );
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > AUTH_LIMITS.EMAIL_MAX || !EMAIL_RE.test(email)) {
    errors.push('email must be a valid email address.');
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (
    password.length < AUTH_LIMITS.PASSWORD_MIN ||
    Buffer.byteLength(password, 'utf8') > AUTH_LIMITS.PASSWORD_MAX_BYTES
  ) {
    errors.push(
      `password must be at least ${AUTH_LIMITS.PASSWORD_MIN} characters (max ${AUTH_LIMITS.PASSWORD_MAX_BYTES} bytes).`
    );
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], value: { username, email, password } };
}

/** `identifier` is either a username or an email address. */
function validateLogin(body) {
  if (!isPlainObject(body)) {
    return { ok: false, errors: ['Request body must be a JSON object.'] };
  }
  const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!identifier || identifier.length > AUTH_LIMITS.EMAIL_MAX || !password || password.length > 256) {
    return { ok: false, errors: ['identifier and password are required.'] };
  }
  return { ok: true, errors: [], value: { identifier, password } };
}

module.exports = {
  LIMITS,
  CATEGORIES,
  AUTH_LIMITS,
  sanitizeText,
  parseId,
  validateNewPoll,
  validateComment,
  validateAvatar,
  validateAvatarUrl,
  sanitizeMultiline,
  parsePage,
  COMMENT_MAX,
  validateRegister,
  validateLogin,
};
