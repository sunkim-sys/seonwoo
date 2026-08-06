const db = require('../services/db');
const { ensureTables } = require('../services/guide/schema');
const categories = require('../services/guide/categories');
const articles = require('../services/guide/articles');
const hotpicks = require('../services/guide/hotpicks');
const { getFullContent } = require('../services/guide/content');
const { saveUploadedImage } = require('../services/guide/upload');

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('잘못된 JSON 형식입니다.')); }
    });
    req.on('error', reject);
  });
}

async function handleGuideRoutes(req, res, { parseMultipart, sendJson }) {
  const url = req.url.split('?')[0];
  const method = req.method;

  try {
    // ---- 공개 콘텐츠 API (가이드센터 공개 페이지가 사용) ----
    if (method === 'GET' && url === '/api/guide/content') {
      return sendJson(res, 200, await getFullContent());
    }

    if (method === 'POST' && url === '/api/guide/track') {
      const body = await readJsonBody(req);
      await ensureTables();
      await db.query(
        'INSERT INTO guide_view_tracks (category_id, article_id, session_id) VALUES ($1, $2, $3)',
        [body.categoryId || null, body.articleId || null, body.sessionId || null]
      );
      return sendJson(res, 200, { ok: true });
    }

    // ---- 카테고리 ----
    if (method === 'GET' && url === '/api/guide/categories') {
      return sendJson(res, 200, await categories.listCategories());
    }
    if (method === 'POST' && url === '/api/guide/categories') {
      return sendJson(res, 201, await categories.createCategory(await readJsonBody(req)));
    }
    let m = url.match(/^\/api\/guide\/categories\/([^/]+)$/);
    if (m && method === 'GET') {
      const row = await categories.getCategory(m[1]);
      return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: '찾을 수 없습니다.' });
    }
    if (m && method === 'PUT') {
      const row = await categories.updateCategory(m[1], await readJsonBody(req));
      return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: '찾을 수 없습니다.' });
    }
    if (m && method === 'DELETE') {
      await categories.deleteCategory(m[1]);
      return sendJson(res, 200, { ok: true });
    }
    m = url.match(/^\/api\/guide\/categories\/([^/]+)\/move$/);
    if (m && method === 'POST') {
      const body = await readJsonBody(req);
      await categories.moveCategory(m[1], body.direction);
      return sendJson(res, 200, { ok: true });
    }

    // ---- 아티클 ----
    m = url.match(/^\/api\/guide\/categories\/([^/]+)\/articles$/);
    if (m && method === 'GET') {
      return sendJson(res, 200, await articles.listArticlesByCategory(m[1]));
    }
    if (m && method === 'POST') {
      return sendJson(res, 201, await articles.createArticle(m[1], await readJsonBody(req)));
    }
    m = url.match(/^\/api\/guide\/articles\/([^/]+)$/);
    if (m && method === 'GET') {
      const row = await articles.getArticle(m[1]);
      return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: '찾을 수 없습니다.' });
    }
    if (m && method === 'PUT') {
      const row = await articles.updateArticle(m[1], await readJsonBody(req));
      return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: '찾을 수 없습니다.' });
    }
    if (m && method === 'DELETE') {
      await articles.deleteArticle(m[1]);
      return sendJson(res, 200, { ok: true });
    }
    m = url.match(/^\/api\/guide\/articles\/([^/]+)\/move$/);
    if (m && method === 'POST') {
      const body = await readJsonBody(req);
      await articles.moveArticle(m[1], body.direction);
      return sendJson(res, 200, { ok: true });
    }

    // ---- HOT 픽 ----
    if (method === 'GET' && url === '/api/guide/hotpicks') {
      return sendJson(res, 200, await hotpicks.listHotPicks());
    }
    if (method === 'PUT' && url === '/api/guide/hotpicks') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, await hotpicks.setHotPicks(Array.isArray(body.picks) ? body.picks : []));
    }

    // ---- 이미지 업로드 ----
    if (method === 'POST' && url === '/api/guide/upload') {
      const parts = await parseMultipart(req);
      const file = parts.find(p => p.name === 'file' && p.filename);
      if (!file) return sendJson(res, 400, { error: '이미지 파일을 첨부해주세요.' });
      const path = saveUploadedImage({ filename: file.filename, data: file.data });
      return sendJson(res, 200, { path });
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

module.exports = { handleGuideRoutes };
