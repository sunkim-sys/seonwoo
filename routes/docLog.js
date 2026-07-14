const { appendLog, queryLogs, summarize } = require('../services/docLogService');

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

async function handleDocLogRoutes(req, res, { sendJson }) {
  // POST /api/doc-log — 채널톡 문서 페이지에서 보내는 조회 비콘 수신
  if (req.method === 'POST' && req.url.startsWith('/api/doc-log')) {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      appendLog({
        receivedAt: new Date().toISOString(),
        url: String(body.url || '').slice(0, 500),
        articleId: String(body.articleId || '').slice(0, 200),
        title: String(body.title || '').slice(0, 200),
        referrer: String(body.referrer || '').slice(0, 500),
        userAgent: (req.headers['user-agent'] || '').slice(0, 300),
        ip: getClientIp(req),
      });
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  // GET /api/doc-log/summary — 문서(매뉴얼)별 조회수 집계
  if (req.method === 'GET' && req.url.startsWith('/api/doc-log/summary')) {
    try {
      sendJson(res, 200, { articles: summarize() });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // GET /api/doc-log — 원본 로그 목록 (?articleId=&limit=)
  if (req.method === 'GET' && req.url.startsWith('/api/doc-log')) {
    try {
      const u = new URL(req.url, 'http://placeholder');
      const logs = queryLogs({
        articleId: u.searchParams.get('articleId') || undefined,
        limit: Number(u.searchParams.get('limit')) || 500,
      });
      sendJson(res, 200, { logs });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

module.exports = { handleDocLogRoutes };
