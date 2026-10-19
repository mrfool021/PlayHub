'use strict';

// Run with: npm run diagnose-db (from server/). Loads the same .env as the app.
require('./config/env');
const mysql = require('mysql2/promise');

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME;

  const missing = ['DB_USER', 'DB_NAME', 'JWT_SECRET', 'VOTER_SALT'].filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`Missing required setting(s): ${missing.join(', ')}. Check the project-root .env file.`);
    process.exitCode = 1;
    return;
  }
  if (process.env.JWT_SECRET.length < 32) {
    console.error('JWT_SECRET must be at least 32 characters long.');
    process.exitCode = 1;
    return;
  }

  let connection;
  try {
    connection = await mysql.createConnection({ host, port, user, password, connectTimeout: 10000 });
    console.log(`MySQL server connection: OK (${host}:${port}, user ${user})`);
    const [dbRows] = await connection.query('SHOW DATABASES LIKE ?', [database]);
    if (!dbRows.length) {
      console.error(`Database '${database}' does not exist. From the project root, import schema.sql using MySQL Workbench or the mysql command.`);
      process.exitCode = 1;
      return;
    }
    await connection.changeUser({ database });
    console.log(`Database '${database}': OK`);
    const requiredTables = ['users', 'user_avatars', 'polls', 'options', 'votes', 'poll_images', 'comments', 'follows'];
    const [rows] = await connection.query('SHOW TABLES');
    const existing = new Set(rows.map((r) => Object.values(r)[0]));
    const missingTables = requiredTables.filter((t) => !existing.has(t));
    if (missingTables.length) {
      console.error(`Missing table(s): ${missingTables.join(', ')}. Re-import the project's schema.sql.`);
      process.exitCode = 1;
      return;
    }
    console.log('Required PlayHub tables: OK');
    await connection.query('SELECT id, username, email, password_hash FROM users LIMIT 0');
    console.log('Login/register table columns: OK');
    console.log('\nDatabase checks passed. If login still returns HTTP 500, inspect the terminal running npm start for the line beginning "Unhandled error:".');
  } catch (err) {
    console.error(`Database check failed: ${err.code || err.name}: ${err.message}`);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') console.error('Fix DB_USER / DB_PASSWORD in the project-root .env file.');
    else if (err.code === 'ECONNREFUSED') console.error('Start the MySQL Server service, then retry.');
    else if (err.code === 'ER_BAD_DB_ERROR') console.error(`Create/import the '${database}' database from schema.sql.`);
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

main();
