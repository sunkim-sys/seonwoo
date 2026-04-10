const { getReportData } = require('../services/reportService');

async function handleReportRoutes(req, res, { sendJson }) {
  if (req.method === 'GET' && req.url.startsWith('/api/report')) {
    try {
      const data = await getReportData();
      sendJson(res, 200, data);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }
  sendJson(res, 404, { error: 'Not found' });
}

module.exports = { handleReportRoutes };
