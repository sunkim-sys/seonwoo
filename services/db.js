const { Pool, types } = require('pg');

// DATE columns: keep as raw 'YYYY-MM-DD' strings instead of pg's default
// Date-object parsing, which shifts the value by a day once serialized to
// ISO (JS Date is constructed in local time, then toISOString() converts to UTC).
types.setTypeParser(1082, val => val);

let pool = null;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL 환경변수가 설정되어 있지 않습니다.');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

module.exports = { query };
