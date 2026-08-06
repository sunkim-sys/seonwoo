const db = require('../db');
const { ensureTables, SETTLEMENT_TYPES } = require('./schema');

async function listContracts() {
  await ensureTables();
  const { rows } = await db.query(`
    SELECT c.*, p.name AS provider_name
    FROM settle_contracts c
    JOIN settle_providers p ON p.id = c.provider_id
    ORDER BY c.created_at DESC
  `);
  return rows;
}

async function getContract(id) {
  await ensureTables();
  const { rows } = await db.query('SELECT * FROM settle_contracts WHERE id = $1', [id]);
  return rows[0] || null;
}

function validateType(settlementType) {
  if (!Object.prototype.hasOwnProperty.call(SETTLEMENT_TYPES, settlementType)) {
    throw new Error(`알 수 없는 정산 타입입니다: ${settlementType}`);
  }
}

async function createContract(body) {
  await ensureTables();
  const providerId = Number(body.provider_id);
  if (!providerId) throw new Error('CP사를 선택해주세요.');
  const courseId = String(body.course_id || '').trim();
  if (!courseId) throw new Error('코스 ID는 필수입니다.');
  validateType(body.settlement_type);

  const { rows } = await db.query(
    `INSERT INTO settle_contracts
       (provider_id, course_id, course_name, product_type, settlement_type, rate, fixed_amount_per_student, completion_tiers)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      providerId, courseId, body.course_name || null,
      body.product_type === 'subscription' ? 'subscription' : 'single',
      body.settlement_type,
      body.rate !== undefined && body.rate !== '' ? Number(body.rate) : null,
      body.fixed_amount_per_student !== undefined && body.fixed_amount_per_student !== '' ? Number(body.fixed_amount_per_student) : null,
      JSON.stringify(body.completion_tiers || []),
    ]
  );
  return rows[0];
}

async function updateContract(id, body) {
  await ensureTables();
  const existing = await getContract(id);
  if (!existing) return null;
  if (body.settlement_type) validateType(body.settlement_type);

  const { rows } = await db.query(
    `UPDATE settle_contracts SET
       provider_id = $1, course_id = $2, course_name = $3, product_type = $4,
       settlement_type = $5, rate = $6, fixed_amount_per_student = $7, completion_tiers = $8,
       updated_at = now()
     WHERE id = $9 RETURNING *`,
    [
      body.provider_id !== undefined ? Number(body.provider_id) : existing.provider_id,
      body.course_id !== undefined ? String(body.course_id).trim() : existing.course_id,
      body.course_name !== undefined ? body.course_name : existing.course_name,
      body.product_type !== undefined ? (body.product_type === 'subscription' ? 'subscription' : 'single') : existing.product_type,
      body.settlement_type || existing.settlement_type,
      body.rate !== undefined ? (body.rate === '' ? null : Number(body.rate)) : existing.rate,
      body.fixed_amount_per_student !== undefined ? (body.fixed_amount_per_student === '' ? null : Number(body.fixed_amount_per_student)) : existing.fixed_amount_per_student,
      body.completion_tiers !== undefined ? JSON.stringify(body.completion_tiers) : JSON.stringify(existing.completion_tiers),
      id,
    ]
  );
  return rows[0] || null;
}

async function deleteContract(id) {
  await ensureTables();
  await db.query('DELETE FROM settle_contracts WHERE id = $1', [id]);
}

module.exports = { listContracts, getContract, createContract, updateContract, deleteContract };
