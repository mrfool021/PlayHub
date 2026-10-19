'use strict';

const mysql = require('mysql2/promise');
const { required } = require('./env');

/**
 * Shared MySQL connection pool (mysql2/promise).
 * Credentials come from the environment (.env) - nothing is hard-coded.
 */
function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: required('DB_NAME'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    charset: 'utf8mb4',
  });
}

module.exports = { createPool };
