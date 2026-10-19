-- ============================================================================
-- PlayHub - database schema + sample data (MySQL 8.x)
--
-- Run it once from the project root:
--     mysql -u root -p < schema.sql
--
-- It is safe to run again: the database and tables use IF NOT EXISTS and the
-- sample rows use INSERT IGNORE with fixed ids, so nothing is duplicated and
-- no data is dropped.
--
-- Main resource: `polls` (question, description, category, status, creator,
-- timestamp) with its `options`; `votes`, `comments` and `follows` hang off it.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS playhub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE playhub;

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- users: registered accounts (JWT authentication).
--   password_hash stores a bcrypt hash - plain passwords are never stored.
--   username / email are UNIQUE (case-insensitive under the default collation).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username       VARCHAR(30)  NOT NULL,
  email          VARCHAR(255) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  avatar_url     VARCHAR(500) NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- polls: the main resource (one row per question)
--   id           INT AUTO_INCREMENT primary key
--   question     the poll question                     (text input)
--   description  optional extra context                (textarea)
--   category     one of General/FPS/RPG/Strategy/...   (select)
--   is_active    1 = open for voting
--   created_by   owner; NULL for the sample rows below. If the user is deleted
--                the poll stays (ON DELETE SET NULL)
--   created_at   creation timestamp
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS polls (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  question     VARCHAR(255) NOT NULL,
  description  VARCHAR(500) NOT NULL DEFAULT '',
  category     VARCHAR(30)  NOT NULL DEFAULT 'General',
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_by   INT UNSIGNED NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_polls_active_created (is_active, created_at),
  KEY idx_polls_created_by (created_by),
  CONSTRAINT fk_polls_user
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- options: the answer choices of a poll
--   UNIQUE (id, poll_id) lets `votes` use a composite foreign key, so a vote can
--   never point at an option that belongs to a different poll.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS options (
  id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  poll_id   INT UNSIGNED NOT NULL,
  label     VARCHAR(120) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_options_id_poll (id, poll_id),
  UNIQUE KEY uq_options_poll_label (poll_id, label),
  CONSTRAINT fk_options_poll
    FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- votes: one row per ballot
--   voter_hash is a salted SHA-256 of (poll id + user id): no raw personal data.
--   UNIQUE (poll_id, voter_hash) = one vote per account per poll. NULL hashes
--   (sample data) never collide because MySQL treats NULLs as distinct.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS votes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  poll_id     INT UNSIGNED    NOT NULL,
  option_id   INT UNSIGNED    NOT NULL,
  voter_hash  CHAR(64)        NULL,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_votes_poll_voter (poll_id, voter_hash),
  KEY idx_votes_option_poll (option_id, poll_id),
  CONSTRAINT fk_votes_poll
    FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE,
  CONSTRAINT fk_votes_option_poll
    FOREIGN KEY (option_id, poll_id) REFERENCES options (id, poll_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Images live in their own tables so ordinary queries never drag blobs around.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_avatars (
  user_id     INT UNSIGNED NOT NULL,
  mime        VARCHAR(20)  NOT NULL,
  data        MEDIUMBLOB   NOT NULL,
  etag        CHAR(16)     NOT NULL,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_avatars_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_user_avatars_mime
    CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS poll_images (
  poll_id     INT UNSIGNED NOT NULL,
  mime        VARCHAR(20)  NOT NULL,
  data        MEDIUMBLOB   NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (poll_id),
  CONSTRAINT fk_poll_images_poll
    FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE,
  CONSTRAINT chk_poll_images_mime
    CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- comments: threads one level deep (parent_id points at a root comment)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  poll_id     INT UNSIGNED    NOT NULL,
  user_id     INT UNSIGNED    NOT NULL,
  parent_id   BIGINT UNSIGNED NULL,
  body        VARCHAR(500)    NOT NULL,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_comments_id_poll (id, poll_id),
  KEY idx_comments_poll_parent (poll_id, parent_id, id),
  KEY idx_comments_parent (parent_id),
  KEY idx_comments_user (user_id),
  CONSTRAINT fk_comments_poll
    FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_parent
    FOREIGN KEY (parent_id, poll_id) REFERENCES comments (id, poll_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- follows: who follows whom
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS follows (
  follower_id   INT UNSIGNED NOT NULL,
  following_id  INT UNSIGNED NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, following_id),
  KEY idx_follows_following (following_id, created_at),
  CONSTRAINT fk_follows_follower
    FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_follows_following
    FOREIGN KEY (following_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- Sample data (no accounts and no passwords are seeded: register one in the app)
-- ============================================================================
INSERT IGNORE INTO polls (id, question, description, category) VALUES
  (1, 'Which FPS franchise has the best campaign?', 'Single-player story only - multiplayer does not count.', 'FPS'),
  (2, 'Best open-world RPG of the last decade?', 'Think exploration, quests and world design.', 'RPG'),
  (3, 'Which genre do you play most on weekends?', 'Pick the one you actually spend the most hours on.', 'General'),
  (4, 'Controller or keyboard and mouse?', 'Settle it once and for all.', 'General'),
  (5, 'Which strategy game deserves a new sequel?', 'Cast your vote for the classic you miss most.', 'Strategy');

INSERT IGNORE INTO options (id, poll_id, label) VALUES
  (1, 1, 'Halo'),
  (2, 1, 'Call of Duty'),
  (3, 1, 'Half-Life'),
  (4, 1, 'DOOM'),
  (5, 2, 'The Witcher 3'),
  (6, 2, 'Elden Ring'),
  (7, 2, 'Skyrim'),
  (8, 2, 'Baldur''s Gate 3'),
  (9, 3, 'Shooter'),
  (10, 3, 'RPG'),
  (11, 3, 'Strategy'),
  (12, 3, 'Sports'),
  (13, 3, 'Indie / puzzle'),
  (14, 4, 'Controller'),
  (15, 4, 'Keyboard and mouse'),
  (16, 4, 'Both, depending on the game'),
  (17, 5, 'Age of Empires'),
  (18, 5, 'StarCraft'),
  (19, 5, 'Civilization'),
  (20, 5, 'Total War');

-- Sample ballots (voter_hash NULL = anonymous demo data). Fixed ids keep the script re-runnable.
INSERT IGNORE INTO votes (id, poll_id, option_id) VALUES
  (1,1,1), (2,1,1), (3,1,1), (4,1,1), (5,1,1), (6,1,1), (7,1,1), (8,1,1),
  (9,1,1), (10,1,2), (11,1,2), (12,1,2), (13,1,2), (14,1,2), (15,1,3), (16,1,3),
  (17,1,3), (18,1,3), (19,1,3), (20,1,3), (21,1,3), (22,1,3), (23,1,3), (24,1,3),
  (25,1,3), (26,1,3), (27,1,4), (28,1,4), (29,1,4), (30,1,4), (31,1,4), (32,1,4),
  (33,1,4), (34,2,5), (35,2,5), (36,2,5), (37,2,5), (38,2,5), (39,2,5), (40,2,5),
  (41,2,5), (42,2,5), (43,2,5), (44,2,5), (45,2,6), (46,2,6), (47,2,6), (48,2,6),
  (49,2,6), (50,2,6), (51,2,6), (52,2,6), (53,2,6), (54,2,6), (55,2,6), (56,2,6),
  (57,2,6), (58,2,6), (59,2,7), (60,2,7), (61,2,7), (62,2,7), (63,2,7), (64,2,7),
  (65,2,8), (66,2,8), (67,2,8), (68,2,8), (69,2,8), (70,2,8), (71,2,8), (72,2,8),
  (73,2,8), (74,2,8), (75,2,8), (76,2,8), (77,2,8), (78,3,9), (79,3,9), (80,3,9),
  (81,3,9), (82,3,9), (83,3,9), (84,3,10), (85,3,10), (86,3,10), (87,3,10), (88,3,10),
  (89,3,10), (90,3,10), (91,3,10), (92,3,11), (93,3,11), (94,3,11), (95,3,12), (96,3,12),
  (97,3,12), (98,3,12), (99,3,13), (100,3,13), (101,3,13), (102,3,13), (103,3,13), (104,3,13),
  (105,3,13), (106,4,14), (107,4,14), (108,4,14), (109,4,14), (110,4,14), (111,4,14), (112,4,14),
  (113,4,14), (114,4,14), (115,4,14), (116,4,15), (117,4,15), (118,4,15), (119,4,15), (120,4,15),
  (121,4,15), (122,4,15), (123,4,15), (124,4,15), (125,4,16), (126,4,16), (127,4,16), (128,4,16),
  (129,4,16), (130,4,16), (131,4,16), (132,4,16), (133,4,16), (134,4,16), (135,4,16), (136,4,16),
  (137,5,17), (138,5,17), (139,5,17), (140,5,17), (141,5,17), (142,5,17), (143,5,17), (144,5,18),
  (145,5,18), (146,5,18), (147,5,18), (148,5,18), (149,5,18), (150,5,18), (151,5,18), (152,5,18),
  (153,5,18), (154,5,19), (155,5,19), (156,5,19), (157,5,19), (158,5,19), (159,5,19), (160,5,20),
  (161,5,20), (162,5,20), (163,5,20);
