const db = require('../db');
const { ensureTables } = require('./schema');

async function listHotPicks() {
  await ensureTables();
  const { rows } = await db.query('SELECT * FROM guide_hot_picks ORDER BY position ASC');
  return rows;
}

// body: [{ category_id, article_id }, ...] — 전체 교체 (체크리스트 UI와 매칭)
async function setHotPicks(picks) {
  await ensureTables();
  await db.query('DELETE FROM guide_hot_picks');
  let position = 0;
  for (const pick of picks) {
    if (!pick.category_id || !pick.article_id) continue;
    await db.query(
      'INSERT INTO guide_hot_picks (category_id, article_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [pick.category_id, pick.article_id, position++]
    );
  }
  return listHotPicks();
}

module.exports = { listHotPicks, setHotPicks };
