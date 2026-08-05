const db = require('./db');

const TABLE = 'company_list';

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id SERIAL PRIMARY KEY,
      member_group_name TEXT NOT NULL,
      member_group_ext_id TEXT,
      csm TEXT,
      ae TEXT,
      plan TEXT,
      enroll_type TEXT,
      status TEXT DEFAULT 'ongoing',
      completion_criteria TEXT,
      first_enroll_date DATE,
      lecture_start_date DATE,
      lecture_end_date DATE,
      edu_manager_name TEXT,
      edu_manager_email TEXT,
      edu_manager_phone TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

const FIELDS = [
  'member_group_name', 'member_group_ext_id',
  'csm', 'ae', 'plan', 'enroll_type',
  'status', 'completion_criteria',
  'first_enroll_date', 'lecture_start_date', 'lecture_end_date',
  'edu_manager_name', 'edu_manager_email', 'edu_manager_phone',
];

async function listCompanies({ search, csm, ae, status } = {}) {
  await ensureTable();
  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`member_group_name ILIKE $${params.length}`);
  }
  if (csm) { params.push(csm); conditions.push(`csm = $${params.length}`); }
  if (ae) { params.push(ae); conditions.push(`ae = $${params.length}`); }
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT * FROM ${TABLE} ${where} ORDER BY member_group_name ASC`,
    params
  );
  return rows;
}

async function getCompany(id) {
  await ensureTable();
  const { rows } = await db.query(`SELECT * FROM ${TABLE} WHERE id = $1`, [id]);
  return rows[0] || null;
}

function pickFields(body) {
  const data = {};
  for (const f of FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, f)) {
      data[f] = body[f] === '' ? null : body[f];
    }
  }
  return data;
}

async function createCompany(body) {
  await ensureTable();
  const data = pickFields(body);
  if (!data.member_group_name) throw new Error('멤버그룹명은 필수입니다.');

  const cols = Object.keys(data);
  const values = Object.values(data);
  const placeholders = cols.map((_, i) => `$${i + 1}`);

  const { rows } = await db.query(
    `INSERT INTO ${TABLE} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    values
  );
  return rows[0];
}

async function updateCompany(id, body) {
  await ensureTable();
  const data = pickFields(body);
  const cols = Object.keys(data);
  if (!cols.length) return getCompany(id);

  const values = Object.values(data);
  const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');

  const { rows } = await db.query(
    `UPDATE ${TABLE} SET ${setClause}, updated_at = now() WHERE id = $${cols.length + 1} RETURNING *`,
    [...values, id]
  );
  return rows[0] || null;
}

async function deleteCompany(id) {
  await ensureTable();
  await db.query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
}

async function getCsmStats() {
  await ensureTable();
  const { rows } = await db.query(`
    SELECT
      COALESCE(NULLIF(TRIM(csm), ''), '미배정') AS csm,
      COUNT(*) FILTER (WHERE status = 'ongoing') AS ongoing,
      COUNT(*) FILTER (WHERE status = 'closed') AS closed,
      COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'ongoing' AND status IS DISTINCT FROM 'closed') AS other,
      COUNT(*) AS total
    FROM ${TABLE}
    GROUP BY 1
    ORDER BY total DESC, csm ASC
  `);
  return rows.map(r => ({
    csm: r.csm,
    ongoing: Number(r.ongoing),
    closed: Number(r.closed),
    other: Number(r.other),
    total: Number(r.total),
  }));
}

module.exports = {
  ensureTable,
  listCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany,
  getCsmStats,
  FIELDS,
};
