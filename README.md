# PlayHub - Gaming Poll & Voting App

A full-stack web app where gamers create polls, vote, comment and follow each other.
Final project for **Integrative Programming and Technologies**.

The **main resource is the poll**: each one has a question (text), a description (textarea),
a category (select), an optional photo (file) and 2-10 answer options.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18 (Vite 5), Tailwind CSS, **Axios** |
| Backend | Node.js 20+, Express 4 (`cors`, `express.json`, custom request logger, `helmet`, rate limiting) |
| Database | MySQL 8 via the **`mysql2/promise`** connection pool |
| Auth | JWT (bcrypt-hashed passwords) |
| Tests | Jest + Supertest (the database is mocked, so no MySQL is needed to run them) |

## Project structure

```
PlayHub/
├── client/                    React frontend (Vite)
│   └── src/
│       ├── api/axios.js       the shared axios instance (baseURL, token + error interceptors)
│       ├── api/index.js       every API call (getPolls, createPoll, deletePoll, ...)
│       ├── hooks/useFetch.js  custom hook: load data with useEffect, loading + error state
│       ├── hooks/useForm.js   custom hook: single state object + one handleChange + validation
│       └── components/        CreatePoll (the form), PollList, PollCard, PollView, ...
├── server/                    Express backend
│   └── src/
│       ├── server.js          starts the server (port 3000 or PORT from .env)
│       ├── app.js             middleware order + route mounting
│       ├── config/            env loading (dotenv) and the mysql2 pool
│       ├── middleware/        logger.js (request logger), auth.js (JWT)
│       ├── routes/            URL -> handler wiring
│       ├── controllers/       named handler functions + every SQL statement
│       └── tests/             Jest tests
├── schema.sql                 CREATE DATABASE, CREATE TABLEs and sample INSERTs
├── .env.example               template for the real .env (never committed)
└── README.md
```

## Setup

Requirements: **Node.js 20+** and **MySQL 8**.

1. **Install dependencies**
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```
2. **Create the database** (creates `playhub`, the tables and sample polls; safe to run again)
   ```bash
   mysql -u root -p < schema.sql
   ```
3. **Configure the environment** - one `.env` in the project root, used by both server and client
   ```bash
   cp .env.example .env
   ```
   Open `.env` and replace every `change_me...` value: your MySQL user and password in
   `DB_USER` / `DB_PASSWORD`, plus random secrets for `JWT_SECRET` and `VOTER_SALT`
   (`openssl rand -hex 32`). The `.env` file is ignored by git.
4. **Start the API** (http://localhost:3000)
   ```bash
   cd server && npm start        # or: npm run dev  (restarts on file changes)
   ```
5. **Start the client** (http://localhost:5173), in a second terminal
   ```bash
   cd client && npm run dev
   ```
6. Open http://localhost:5173, **register an account** and create your first poll.
   The sample polls from `schema.sql` have no owner, so nobody can delete them; your own polls can be deleted.

Other commands: `cd server && npm test` (Jest), `cd client && npm run build` (production build into `client/dist`).

## REST API

Base URL: `http://localhost:3000`. Bodies and responses are JSON. 🔒 = needs `Authorization: Bearer <token>`
(get a token from `/api/auth/register` or `/api/auth/login`).

### Polls (the main resource)

| Method | Endpoint | Auth | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/api/polls` | public | **200** list of polls with vote counts | - |
| GET | `/api/polls/:id` | public | **200** one poll | **404** not found, 400 bad id |
| POST | `/api/polls` | 🔒 | **201** the created poll | **400** validation failed, 401 |
| DELETE | `/api/polls/:id` | 🔒 | **200** `{ "message": "Poll deleted.", "id": 5 }` | **404** not found, 403 not your poll, 401 |
| POST | `/api/polls/:id/vote` | 🔒 | 201 updated poll | 400, 404, 409 already voted |

`POST /api/polls` body:
```json
{ "question": "Best FPS campaign?", "description": "Single-player only", "category": "FPS",
  "options": ["Halo", "DOOM"], "image": "data:image/jpeg;base64,... (optional)" }
```
Categories: `General, FPS, RPG, Strategy, Sports, Indie, Other`. 2-10 unique options; question 5-255 characters.

### Other endpoints (bonus features)

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account, returns `{ token, user }` |
| POST | `/api/auth/login` | Log in with username or email, returns `{ token, user }` |
| GET | `/api/auth/me` 🔒 | The current user |
| GET / POST | `/api/polls/:id/comments` 🔒 | List (paginated, with replies) / add a comment |
| DELETE | `/api/polls/:id/comments/:commentId` 🔒 | Delete your own comment |
| GET | `/api/search?q=` 🔒 | Search polls and users |
| GET | `/api/users/:id` 🔒 | Public profile with their polls |
| POST / DELETE | `/api/users/:id/follow` 🔒 | Follow / unfollow |
| GET | `/api/users/:id/followers`, `/following` 🔒 | Follow lists (`?page=`) |
| PUT / DELETE | `/api/users/me/avatar` 🔒 | Set (upload or https URL) / remove your avatar |
| GET | `/health` | Liveness probe |

### Try it with curl

```bash
# register (returns a token)
curl -s -X POST localhost:3000/api/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"player1","email":"player1@example.com","password":"a-long-password"}'

TOKEN=...   # paste the token from the response

curl -s localhost:3000/api/polls                                   # 200
curl -s localhost:3000/api/polls/1                                 # 200 (404 for an unknown id)
curl -s -X POST localhost:3000/api/polls -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"question":"Best co-op game?","category":"General","options":["It Takes Two","Deep Rock Galactic"]}'   # 201
curl -s -X POST localhost:3000/api/polls -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"question":"x"}'                                            # 400 with the list of problems
curl -s -X DELETE localhost:3000/api/polls/6 -H "Authorization: Bearer $TOKEN"   # 200 (404 if it does not exist)
```

## How the code meets the requirements

**Frontend**
- **Controlled form, one state object, one `handleChange`** - `client/src/hooks/useForm.js` keeps every field
  (question, description, category, options, image) in a single `values` object; the same `handleChange` serves all inputs.
- **4 input types** - text, textarea, select and file (plus the repeatable option text inputs) (`components/CreatePoll.jsx`).
- **Client-side validation** with a message under each field, cleared as the user types; the form **resets** after a successful submit.
- **`useEffect` loading, loading and error states** - the custom hook `useFetch` loads the polls (and a single poll) and exposes `loading`, `error`, `refetch`.
- **Immutable state updates** - `[poll, ...prev]` after create, `prev.filter(...)` after delete, `{ ...prev, field }` / `.map` in the form.
- **Delete action** on every poll you own (card and detail page), with confirmation and error display.
- **Custom hooks** - `useFetch` and `useForm`.
- **Axios** - one shared instance in `client/src/api/axios.js` (`baseURL` from `VITE_API_URL`, default `http://localhost:3000/api`).
  Components never contain a host name.

**Backend**
- Port 3000 (or `PORT` in `.env`). `app.js` registers `helmet`, **`cors()`**, **`express.json()`** and the custom
  **request logger** (`middleware/logger.js`, prints `time METHOD path status duration`) **before** any route.
- Named handler functions (`listPolls`, `getPollById`, `createPoll`, `deletePoll`, ...) in `controllers/`;
  every handler sends exactly one response and forwards unexpected errors with `next(err)` to one central error handler
  (JSON 404 for unknown routes, 400 for bad JSON, 500 without leaking internals).
- Server-side validation (`validation.js`): types, lengths, allowed categories, unique options, sanitised text, image checks.

**Database**
- `mysql2/promise` pool in `server/src/config/db.js`; credentials come from `.env`.
- **Every SQL statement is a constant string with `?` placeholders** - user input is only ever passed in the parameter array.
- `schema.sql` has `CREATE DATABASE`, `CREATE TABLE` (`polls` has `INT AUTO_INCREMENT PRIMARY KEY` and 7 columns) and sample `INSERT`s.

## Bonus features

JWT authentication with bcrypt, one vote per account, image uploads (compressed in the browser, type-checked on the server),
user avatars, threaded comments, follow system with a "Following" feed, search, dark/light theme, rate limiting,
security headers (helmet), Jest test suite with a mocked database, responsive layout.

## Screenshots required before submission

The project archive does not currently include screenshots. Before submitting, create a `screenshots/` folder and add at least these three real screenshots from your running app:

1. `01-home-and-poll-list.png` — the poll feed showing saved records.
2. `02-create-poll-validation.png` — the create-poll form showing its fields and a validation message.
3. `03-poll-details-and-voting.png` — a poll detail page showing its options and results.

Then add a short caption for each screenshot here or in your presentation. Do not use mockups; capture the actual running application.

## AI assistance disclosure

Claude was used to generate an initial version of this project. ChatGPT was used to review the project against the course rubric and improve its documentation. Before the demo, I will review the code walkthrough, run the application myself, and make sure I can explain the parts shown by the instructor.

## Security notes

- The real `.env` is never committed (`.gitignore`); only `.env.example` with placeholders is.
- Passwords are stored as bcrypt hashes; JWTs are signed with `JWT_SECRET` (the server refuses to start with a short one).
- No default credentials are seeded: the sample polls have no owner and the demo needs no account.

## Troubleshooting login/register HTTP 500 errors

From the `server` folder, run:

```bash
npm run diagnose-db
```

This checks the same `.env` configuration used by the API, MySQL connectivity, the `playhub` database, and the tables required by authentication and core app features. It does not change or delete any data. Fix the specific issue it reports, then restart the API with `npm start`.

If the database check passes but a request still returns HTTP 500, look at the terminal running `npm start` for `Unhandled error:`; the database/SQL error printed there identifies the remaining server-side issue. Never share `.env`, passwords, JWT secrets, or voter salts.
