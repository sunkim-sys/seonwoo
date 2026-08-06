const db = require('../db');
const { ensureTables } = require('./schema');

async function listProviders() {
  await ensureTables();
  const { rows } = await db.query(`
    SELECT p.*, COALESCE(jsonb_array_length(p.course_ids), 0) AS course_count
    FROM settle_providers p
    ORDER BY p.name ASC
  `);
  return rows;
}

async function getProvider(id) {
  await ensureTables();
  const { rows } = await db.query('SELECT * FROM settle_providers WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createProvider(body) {
  await ensureTables();
  const name = String(body.name || '').trim();
  if (!name) throw new Error('이름은 필수입니다.');
  const type = body.type === 'company' ? 'company' : 'individual';
  const courseIds = parseCourseIds(body.course_ids);

  const { rows } = await db.query(
    `INSERT INTO settle_providers (name, type, contact_email, contact_phone, course_ids)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, type, body.contact_email || null, body.contact_phone || null, JSON.stringify(courseIds)]
  );
  return rows[0];
}

async function updateProvider(id, body) {
  await ensureTables();
  const existing = await getProvider(id);
  if (!existing) return null;

  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  const type = body.type === 'company' || body.type === 'individual' ? body.type : existing.type;
  const courseIds = body.course_ids !== undefined ? parseCourseIds(body.course_ids) : existing.course_ids;

  const { rows } = await db.query(
    `UPDATE settle_providers
     SET name = $1, type = $2, contact_email = $3, contact_phone = $4, course_ids = $5, updated_at = now()
     WHERE id = $6 RETURNING *`,
    [
      name, type,
      body.contact_email !== undefined ? body.contact_email : existing.contact_email,
      body.contact_phone !== undefined ? body.contact_phone : existing.contact_phone,
      JSON.stringify(courseIds),
      id,
    ]
  );
  return rows[0] || null;
}

async function deleteProvider(id) {
  await ensureTables();
  await db.query('DELETE FROM settle_providers WHERE id = $1', [id]);
}

// "COURSE001, COURSE002" 형태의 문자열 또는 이미 배열인 값을 정규화
function parseCourseIds(value) {
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map(s => s.trim()).filter(Boolean);
}

module.exports = { listProviders, getProvider, createProvider, updateProvider, deleteProvider };
