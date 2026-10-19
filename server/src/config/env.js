'use strict';

const path = require('path');
const dotenv = require('dotenv');

// The single .env lives in the project root (next to .env.example). A server/.env
// also works and wins if both exist. Real environment variables always win over files.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

module.exports = { required };
