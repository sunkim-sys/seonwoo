const db = require('../db');
const { ensureTables } = require('./schema');

async function listRevenues() {
  await ensureTables();
  const { rows } = await db.query(`
    SELECT r.*,
      COALESCE(
        (SELECT jsonb_agg(pr.product_name) FROM settle_revenue_product_map m
          JOIN settle_products pr ON pr.product_id = m.product_id
          WHERE m.revenue_id = r.revenue_id),
        '[]'
      ) AS mapped_product_names,
      COALESCE(
        (SELECT jsonb_agg(m.product_id) FROM settle_revenue_product_map m WHERE m.revenue_id = r.revenue_id),
        '[]'
      ) AS mapped_product_ids
    FROM settle_revenues r
    ORDER BY r.contract_start_date DESC
  `);
  return rows;
}

async function getRevenue(revenueId) {
  await ensureTables();
  const { rows } = await db.query('SELECT * FROM settle_revenues WHERE revenue_id = $1', [revenueId]);
  return rows[0] || null;
}

async function createRevenue(body) {
  await ensureTables();
  const revenueId = String(body.revenue_id || '').trim();
  if (!revenueId) throw new Error('매출 ID는 필수입니다.');
  if (!body.revenue_name) throw new Error('매출명은 필수입니다.');
  if (!body.contract_start_date || !body.contract_end_date) throw new Error('계약 시작일/종료일은 필수입니다.');

  const { rows } = await db.query(
    `INSERT INTO settle_revenues (revenue_id, revenue_name, contract_amount, contract_start_date, contract_end_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [revenueId, body.revenue_name, Number(body.contract_amount || 0), body.contract_start_date, body.contract_end_date]
  );
  return rows[0];
}

async function updateRevenue(revenueId, body) {
  await ensureTables();
  const existing = await getRevenue(revenueId);
  if (!existing) return null;

  const { rows } = await db.query(
    `UPDATE settle_revenues SET
       revenue_name = $1, contract_amount = $2, contract_start_date = $3, contract_end_date = $4, updated_at = now()
     WHERE revenue_id = $5 RETURNING *`,
    [
      body.revenue_name !== undefined ? body.revenue_name : existing.revenue_name,
      body.contract_amount !== undefined ? Number(body.contract_amount) : existing.contract_amount,
      body.contract_start_date !== undefined ? body.contract_start_date : existing.contract_start_date,
      body.contract_end_date !== undefined ? body.contract_end_date : existing.contract_end_date,
      revenueId,
    ]
  );
  return rows[0] || null;
}

async function deleteRevenue(revenueId) {
  await ensureTables();
  await db.query('DELETE FROM settle_revenues WHERE revenue_id = $1', [revenueId]);
}

async function addMapping(revenueId, productId) {
  await ensureTables();
  const product = await db.query('SELECT product_type FROM settle_products WHERE product_id = $1', [productId]);
  if (!product.rows[0]) throw new Error('상품을 찾을 수 없습니다.');
  if (product.rows[0].product_type !== 'subscription') {
    throw new Error('구독 상품에만 매출을 매핑할 수 있습니다.');
  }
  await db.query(
    `INSERT INTO settle_revenue_product_map (revenue_id, product_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [revenueId, productId]
  );
}

async function removeMapping(revenueId, productId) {
  await ensureTables();
  await db.query('DELETE FROM settle_revenue_product_map WHERE revenue_id = $1 AND product_id = $2', [revenueId, productId]);
}

module.exports = {
  listRevenues, getRevenue, createRevenue, updateRevenue, deleteRevenue,
  addMapping, removeMapping,
};
