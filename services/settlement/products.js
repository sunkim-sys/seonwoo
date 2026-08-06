const db = require('../db');
const { ensureTables } = require('./schema');

async function listProducts() {
  await ensureTables();
  const { rows } = await db.query(`
    SELECT pr.*,
      COALESCE(
        (SELECT jsonb_agg(m.revenue_id) FROM settle_revenue_product_map m WHERE m.product_id = pr.product_id),
        '[]'
      ) AS mapped_revenue_ids
    FROM settle_products pr
    ORDER BY pr.start_date DESC
  `);
  return rows;
}

async function getProduct(productId) {
  await ensureTables();
  const { rows } = await db.query('SELECT * FROM settle_products WHERE product_id = $1', [productId]);
  return rows[0] || null;
}

async function createProduct(body) {
  await ensureTables();
  const productId = String(body.product_id || '').trim();
  if (!productId) throw new Error('상품 ID는 필수입니다.');
  const productName = String(body.product_name || '').trim();
  if (!productName) throw new Error('상품명은 필수입니다.');
  if (!body.start_date || !body.end_date) throw new Error('시작일/종료일은 필수입니다.');

  const { rows } = await db.query(
    `INSERT INTO settle_products (product_id, product_name, product_type, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [productId, productName, body.product_type === 'subscription' ? 'subscription' : 'single', body.start_date, body.end_date]
  );
  return rows[0];
}

async function updateProduct(productId, body) {
  await ensureTables();
  const existing = await getProduct(productId);
  if (!existing) return null;

  const { rows } = await db.query(
    `UPDATE settle_products SET
       product_name = $1, product_type = $2, start_date = $3, end_date = $4,
       settlement_excluded = $5, updated_at = now()
     WHERE product_id = $6 RETURNING *`,
    [
      body.product_name !== undefined ? body.product_name : existing.product_name,
      body.product_type !== undefined ? (body.product_type === 'subscription' ? 'subscription' : 'single') : existing.product_type,
      body.start_date !== undefined ? body.start_date : existing.start_date,
      body.end_date !== undefined ? body.end_date : existing.end_date,
      body.settlement_excluded !== undefined ? !!body.settlement_excluded : existing.settlement_excluded,
      productId,
    ]
  );
  return rows[0] || null;
}

async function setSettlementExcluded(productIds, excluded) {
  await ensureTables();
  await db.query(
    `UPDATE settle_products SET settlement_excluded = $1, updated_at = now() WHERE product_id = ANY($2::text[])`,
    [!!excluded, productIds]
  );
}

async function deleteProduct(productId) {
  await ensureTables();
  await db.query('DELETE FROM settle_products WHERE product_id = $1', [productId]);
}

async function deleteAllProducts() {
  await ensureTables();
  await db.query('DELETE FROM settle_products');
}

module.exports = {
  listProducts, getProduct, createProduct, updateProduct,
  setSettlementExcluded, deleteProduct, deleteAllProducts,
};
