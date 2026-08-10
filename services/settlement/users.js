const crypto = require('crypto');
const db = require('../db');
const { ensureTables } = require('./schema');

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

async function listUsers() {
  await ensureTables();
  const { rows } = await db.query(
    'SELECT id, name, role, login_id, email, status, last_login_at, created_at FROM settle_users ORDER BY created_at DESC'
  );
  return rows;
}

async function getUser(id) {
  await ensureTables();
  const { rows } = await db.query(
    'SELECT id, name, role, login_id, email, status, last_login_at, created_at FROM settle_users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function createUser(body) {
  await ensureTables();
  const name = String(body.name || '').trim();
  const loginId = String(body.login_id || '').trim();
  if (!name) throw new Error('이름은 필수입니다.');
  if (!loginId) throw new Error('아이디는 필수입니다.');
  if (!body.password || body.password.length < 4) throw new Error('비밀번호는 4자 이상이어야 합니다.');

  const { rows } = await db.query(
    `INSERT INTO settle_users (name, role, login_id, email, password_hash, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING id, name, role, login_id, email, status, last_login_at, created_at`,
    [name, body.role === 'admin' ? 'admin' : 'accountant', loginId, body.email || null, hashPassword(body.password)]
  );
  return rows[0];
}

async function updateUser(id, body) {
  await ensureTables();
  const existing = await getUser(id);
  if (!existing) return null;

  const fields = { name: existing.name, role: existing.role, email: existing.email, status: existing.status };
  if (body.name !== undefined) fields.name = body.name;
  if (body.role !== undefined) fields.role = body.role === 'admin' ? 'admin' : 'accountant';
  if (body.email !== undefined) fields.email = body.email;
  if (body.status !== undefined) fields.status = body.status === 'inactive' ? 'inactive' : 'active';

  if (body.password) {
    const { rows } = await db.query(
      `UPDATE settle_users SET name=$1, role=$2, email=$3, status=$4, password_hash=$5 WHERE id=$6
       RETURNING id, name, role, login_id, email, status, last_login_at, created_at`,
      [fields.name, fields.role, fields.email, fields.status, hashPassword(body.password), id]
    );
    return rows[0] || null;
  }

  const { rows } = await db.query(
    `UPDATE settle_users SET name=$1, role=$2, email=$3, status=$4 WHERE id=$5
     RETURNING id, name, role, login_id, email, status, last_login_at, created_at`,
    [fields.name, fields.role, fields.email, fields.status, id]
  );
  return rows[0] || null;
}

async function deactivateUser(id) {
  await ensureTables();
  await db.query(`UPDATE settle_users SET status = 'inactive' WHERE id = $1`, [id]);
}

async function verifyLogin(loginId, password) {
  await ensureTables();
  const { rows } = await db.query(
    `SELECT id, name, role, login_id, password_hash, status FROM settle_users WHERE login_id = $1`,
    [String(loginId || '').trim()]
  );
  const user = rows[0];
  if (!user || user.status !== 'active' || !user.password_hash) return null;

  const [salt, storedHash] = user.password_hash.split(':');
  if (!salt || !storedHash) return null;
  const derived = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  const a = Buffer.from(derived, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  await db.query(`UPDATE settle_users SET last_login_at = now() WHERE id = $1`, [user.id]);
  return { id: user.id, name: user.name, role: user.role, login_id: user.login_id };
}

module.exports = { listUsers, getUser, createUser, updateUser, deactivateUser, verifyLogin };
