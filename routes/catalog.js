const { getCatalogData } = require('../services/sheetService');
const { buildStyledWorkbook } = require('../services/styledXlsx');

async function handleCatalogRoutes(req, res, { sendJson }) {
  // POST /api/catalog/export-favorites
  if (req.method === 'POST' && req.url === '/api/catalog/export-favorites') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      try {
        const { ids } = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
        if (!Array.isArray(ids) || !ids.length) {
          return sendJson(res, 400, { error: '즐겨찾기 항목이 없습니다.' });
        }
        const data = await getCatalogData();
        const idSet = new Set(ids);
        const picked = data.lectures.filter(l => idSet.has(`${l.name}::${l.category || ''}`));
        if (!picked.length) return sendJson(res, 404, { error: '조회 가능한 항목이 없습니다.' });

        const headers = ['번호', '강의명', '카테고리', '서브카테고리', '난이도', 'URL', '소개'];
        const rows = picked.map((l, i) => [
          i + 1,
          l.name || '',
          l.category || '',
          l.subCategory || '',
          l.level || '',
          l.url || '',
          l.intro || '',
        ]);
        const today = new Date().toISOString().slice(0, 10);
        const buffer = buildStyledWorkbook({
          sheetName: '즐겨찾기',
          title: '과정 즐겨찾기 리스트',
          subtitle: `생성일 ${today} · 총 ${picked.length}개 과정`,
          headers,
          rows,
          widths: [
            { wch: 6 }, { wch: 42 }, { wch: 14 }, { wch: 18 },
            { wch: 12 }, { wch: 38 }, { wch: 60 },
          ],
          urlCols: [5],
        });

        const filename = encodeURIComponent(`과정_즐겨찾기_${today}.xlsx`);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
          'Content-Length': buffer.length,
        });
        res.end(buffer);
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

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
