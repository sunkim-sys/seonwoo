const { SHEET_CONFIGS, parseMainSheet, generateSheet, generatePreview } = require('../services/ipgwaService');

async function handleIpgwaRoutes(req, res, { parseMultipart, sendJson }) {
  // POST /api/ipgwa/upload
  if (req.method === 'POST' && req.url === '/api/ipgwa/upload') {
    const parts = await parseMultipart(req);
    const filePart = parts.find(p => p.filename);

    if (!filePart) {
      return sendJson(res, 400, { error: '파일을 선택해주세요.' });
    }

    try {
      const rows = parseMainSheet(filePart.data);

      // Parse extra fields from form
      const extras = {};
      parts.filter(p => !p.filename).forEach(p => {
        extras[p.name] = p.data.toString('utf-8').trim();
      });

      // Store parsed data and extras in memory
      global._ipgwaData = rows;
      global._ipgwaExtras = extras;

      const sheets = SHEET_CONFIGS.map(c => ({
        id: c.id,
        name: c.name,
        rowCount: rows.length,
      }));

      sendJson(res, 200, { success: true, rowCount: rows.length, sheets });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  // GET /api/ipgwa/preview/:sheetId
  const previewMatch = req.url.match(/^\/api\/ipgwa\/preview\/(.+)$/);
  if (req.method === 'GET' && previewMatch) {
    const sheetId = previewMatch[1];
    const rows = global._ipgwaData;

    if (!rows) {
      return sendJson(res, 400, { error: '먼저 파일을 업로드해주세요.' });
    }

    const config = SHEET_CONFIGS.find(c => c.id === sheetId);
    if (!config) {
      return sendJson(res, 404, { error: '시트를 찾을 수 없습니다.' });
    }

    try {
      const extras = global._ipgwaExtras || {};
      const preview = generatePreview(rows, config, extras);
      sendJson(res, 200, { name: config.name, ...preview });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // GET /api/ipgwa/download/:sheetId
  const downloadMatch = req.url.match(/^\/api\/ipgwa\/download\/(.+)$/);
  if (req.method === 'GET' && downloadMatch) {
    const sheetId = downloadMatch[1];
    const rows = global._ipgwaData;

    if (!rows) {
      return sendJson(res, 400, { error: '먼저 파일을 업로드해주세요.' });
    }

    const config = SHEET_CONFIGS.find(c => c.id === sheetId);
    if (!config) {
      return sendJson(res, 404, { error: '시트를 찾을 수 없습니다.' });
    }

    try {
      const extras = global._ipgwaExtras || {};
      const buffer = generateSheet(rows, config, extras);
      const filename = encodeURIComponent(config.name + '.xlsx');

      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'Content-Length': buffer.length,
      });
      res.end(buffer);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

module.exports = { handleIpgwaRoutes };
