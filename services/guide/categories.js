const db = require('../db');
const { ensureTables, randomId } = require('./schema');

async function listCategories() {
  await ensureTables();
  const { rows } = await db.query('SELECT * FROM guide_categories ORDER BY position ASC, created_at ASC');
  return rows;
}

async function getCategory(id) {
  await ensureTables();
  const { rows } = await db.query('SELECT * FROM guide_categories WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createCategory(body) {
  await ensureTables();
  const title = String(body.title || '').trim();
  if (!title) throw new Error('제목은 필수입니다.');

  const { rows: maxRows } = await db.query('SELECT COALESCE(MAX(position), -1) AS max FROM guide_categories');
  const position = Number(maxRows[0].max) + 1;
  const id = randomId('cat');

  const { rows } = await db.query(
    `INSERT INTO guide_categories (id, title, description, image, position) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, title, body.description || null, body.image || null, position]
  );
  return rows[0];
}

async function updateCategory(id, body) {
  await ensureTables();
  const existing = await getCategory(id);
  if (!existing) return null;

  const { rows } = await db.query(
    `UPDATE guide_categories SET title = $1, description = $2, image = $3, updated_at = now() WHERE id = $4 RETURNING *`,
    [
      body.title !== undefined ? String(body.title).trim() : existing.title,
      body.description !== undefined ? body.description : existing.description,
      body.image !== undefined ? body.image : existing.image,
      id,
    ]
  );
  return rows[0] || null;
}

async function deleteCategory(id) {
  await ensureTables();
  await db.query('DELETE FROM guide_hot_picks WHERE category_id = $1', [id]);
  await db.query('DELETE FROM guide_categories WHERE id = $1', [id]);
}

async function moveCategory(id, direction) {
  await ensureTables();
  const all = await listCategories();
  const idx = all.findIndex(c => c.id === id);
  if (idx === -1) return;
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= all.length) return;

  await db.query('UPDATE guide_categories SET position = $1 WHERE id = $2', [all[swapWith].position, all[idx].id]);
  await db.query('UPDATE guide_categories SET position = $1 WHERE id = $2', [all[idx].position, all[swapWith].id]);
}

module.exports = { listCategories, getCategory, createCategory, updateCategory, deleteCategory, moveCategory };
