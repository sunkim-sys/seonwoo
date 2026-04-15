const { classifyLectures, CATEGORY_TREE } = require('../services/categorizeService');

async function handleCategorizeRoutes(req, res, { sendJson }) {
  // GET /api/categorize/tree
  if (req.method === 'GET' && req.url === '/api/categorize/tree') {
    return sendJson(res, 200, { tree: CATEGORY_TREE });
  }

  // POST /api/categorize
  if (req.method === 'POST' && req.url === '/api/categorize') {
    let body = '';
    req.on('data', c => body += c.toString('utf-8'));
    req.on('end', async () => {
      try {
        const { lectures } = JSON.parse(body || '{}');
        if (!Array.isArray(lectures) || lectures.length === 0) {
          return sendJson(res, 400, { error: 'lectures 배열이 필요합니다.' });
        }
        if (lectures.length > 50) {
          return sendJson(res, 400, { error: '한 번에 최대 50개까지 분류할 수 있습니다.' });
        }
        const results = await classifyLectures(lectures);
        sendJson(res, 200, { results });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

module.exports = { handleCategorizeRoutes };
