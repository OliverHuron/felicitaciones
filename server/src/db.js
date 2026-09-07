'use strict';

const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool(config.db);

pool.on('error', (err) => {
  console.error('[db] error inesperado en cliente idle:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
