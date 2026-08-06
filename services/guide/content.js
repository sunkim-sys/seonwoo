const { ensureTables } = require('./schema');
const { listCategories } = require('./categories');
const { listArticlesByCategory } = require('./articles');
const { listHotPicks } = require('./hotpicks');

// 원본 skillflo-guide-deploy /api/content 응답 형태와 동일한 구조로 집계
async function getFullContent() {
  await ensureTables();
  const categories = await listCategories();
  const withArticles = await Promise.all(categories.map(async (c) => {
    const articles = await listArticlesByCategory(c.id);
    return {
      id: c.id,
      title: c.title,
      desc: c.description || '',
      image: c.image || '',
      articles: articles.map(a => ({
        id: a.id,
        title: a.title,
        desc: a.description || '',
        image: a.image || '',
        body: a.body || '',
      })),
    };
  }));

  const hotPicksRows = await listHotPicks();
  const hotPicks = hotPicksRows.map(p => ({ cat: p.category_id, art: p.article_id }));

  return { categories: withArticles, hotPicks };
}

module.exports = { getFullContent };
