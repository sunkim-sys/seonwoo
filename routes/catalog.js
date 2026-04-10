const { getCatalogData } = require('../services/sheetService');

async function handleCatalogRoutes(req, res, { sendJson }) {
  // GET /api/catalog
  if (req.method === 'GET' && req.url.startsWith('/api/catalog')) {
    try {
      const data = await getCatalogData();
      sendJson(res, 200, data);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

module.exports = { handleCatalogRoutes };
