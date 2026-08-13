const url = require('url');
const { importFile, getAvailableMonths, getDashboard } = require('../services/csReportService');

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function handleCsReportRoutes(req, res, { parseMultipart, sendJson }) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  try {
    // POST /api/cs-report/upload  (multipart: files[], password)
    if (req.method === 'POST' && pathname === '/api/cs-report/upload') {
      const parts = await parseMultipart(req);
      const fileParts = parts.filter(p => p.filename);
      const passwordPart = parts.find(p => p.name === 'password');
      const password = passwordPart ? passwordPart.data.toString('utf-8').trim() : '';

      if (!fileParts.length) {
        return sendJson(res, 400, { error: '채널톡 Excel 파일을 선택해주세요.' });
      }

      const results = [];
      for (const part of fileParts) {
        const result = await importFile(part.data, part.filename, password || undefined);
        results.push(result);
      }
      const months = [...new Set(results.flatMap(r => r.months))].sort();
      return sendJson(res, 200, { files: results, months });
    }

    // GET /api/cs-report/months
    if (req.method === 'GET' && pathname === '/api/cs-report/months') {
      const months = await getAvailableMonths();
      return sendJson(res, 200, { months });
    }

    // GET /api/cs-report/dashboard?month=YYYY-MM
    if (req.method === 'GET' && pathname === '/api/cs-report/dashboard') {
      const month = parsed.query.month || thisMonth();
      const dashboard = await getDashboard(month);
      return sendJson(res, 200, dashboard);
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[CsReport] error:', err);
    sendJson(res, 500, { error: err.message });
  }
}

module.exports = { handleCsReportRoutes };
