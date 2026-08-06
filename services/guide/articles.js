const db = require('../db');
const { ensureTables, randomId } = require('./schema');

async function listArticlesByCategory(categoryId) {
  await ensureTables();
  const { rows } = await db.query(
    'SELECT * FROM guide_articles WHERE category_id = $1 ORDER BY position ASC, created_at ASC',
    [categoryId]
  );
  return rows;
}

async function getArticle(id) {
  await ensureTables();
  const { rows } = await db.query('SELECT * FROM guide_articles WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createArticle(categoryId, body) {
  await ensureTables();
  const title = String(body.title || '').trim();
  if (!title) throw new Error('제목은 필수입니다.');

  const { rows: maxRows } = await db.query('SELECT COALESCE(MAX(position), -1) AS max FROM guide_articles WHERE category_id = $1', [categoryId]);
  const position = Number(maxRows[0].max) + 1;
  const id = randomId('art');

  const { rows } = await db.query(
    `INSERT INTO guide_articles (id, category_id, title, description, image, body, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [id, categoryId, title, body.description || null, body.image || null, body.body || '', position]
  );
  return rows[0];
}

async function updateArticle(id, body) {
  await ensureTables();
  const existing = await getArticle(id);
  if (!existing) return null;

  const { rows } = await db.query(
    `UPDATE guide_articles SET title = $1, description = $2, image = $3, body = $4, updated_at = now() WHERE id = $5 RETURNING *`,
    [
      body.title !== undefined ? String(body.title).trim() : existing.title,
      body.description !== undefined ? body.description : existing.description,
      body.image !== undefined ? body.image : existing.image,
      body.body !== undefined ? body.body : existing.body,
      id,
    ]
  );
  return rows[0] || null;
}

async function deleteArticle(id) {
  await ensureTables();
  await db.query('DELETE FROM guide_hot_picks WHERE article_id = $1', [id]);
  await db.query('DELETE FROM guide_articles WHERE id = $1', [id]);
}

async function moveArticle(id, direction) {
  await ensureTables();
  const existing = await getArticle(id);
  if (!existing) return;
  const siblings = await listArticlesByCategory(existing.category_id);
  const idx = siblings.findIndex(a => a.id === id);
  if (idx === -1) return;
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= siblings.length) return;

  await db.query('UPDATE guide_articles SET position = $1 WHERE id = $2', [siblings[swapWith].position, siblings[idx].id]);
  await db.query('UPDATE guide_articles SET position = $1 WHERE id = $2', [siblings[idx].position, siblings[swapWith].id]);
}

module.exports = { listArticlesByCategory, getArticle, createArticle, updateArticle, deleteArticle, moveArticle };
