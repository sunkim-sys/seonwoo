const { processBuffer, buildCleanedXlsx } = require('../services/cleansingService');

async function handleCleansingRoutes(req, res, { parseMultipart, sendJson }) {
  // POST /api/cleansing/upload
  if (req.method === 'POST' && req.url === '/api/cleansing/upload') {
    try {
      const parts = await parseMultipart(req);
      const filePart = parts.find(p => p.name === 'file' && p.filename);
      if (!filePart) return sendJson(res, 400, { error: '파일이 없습니다.' });
      const result = processBuffer(filePart.data);
      global._cleansingData = result;
      sendJson(res, 200, {
        success: true,
        recognized: result.recognized,
        summary: result.summary,
        issues: result.issues,
        duplicates: result.duplicates,
        preview: result.preview,
      });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  // POST /api/cleansing/apply  (apply manual edits before download)
  if (req.method === 'POST' && req.url === '/api/cleansing/apply') {
    let body = '';
    req.on('data', c => body += c.toString('utf-8'));
    req.on('end', () => {
      try {
        const parsed = global._cleansingData;
        if (!parsed) return sendJson(res, 400, { error: '먼저 파일을 업로드해주세요.' });
        const { edits } = JSON.parse(body || '{}');
        const headerIndex = parsed.headerIndex;
        const fieldMap = { 이메일: 'email', 휴대폰: 'phone', 이름: 'name', 부서: 'dept' };
        let applied = 0;
        if (Array.isArray(edits)) {
          for (const e of edits) {
            const rowIdx = e.rowNumber - 2;
            if (rowIdx < 0 || rowIdx >= parsed.rows.length) continue;
            const field = fieldMap[e.field] || e.field;
            const colIdx = headerIndex[field];
            if (colIdx === undefined) continue;
            parsed.rows[rowIdx][colIdx] = e.value;
            applied++;
          }
        }
        sendJson(res, 200, { success: true, applied });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
    });
    return;
  }

  // GET /api/cleansing/download
  if (req.method === 'GET' && req.url === '/api/cleansing/download') {
    try {
      const parsed = global._cleansingData;
      if (!parsed) return sendJson(res, 400, { error: '먼저 파일을 업로드해주세요.' });
      const buffer = buildCleanedXlsx(parsed.rawHeaders, parsed.rows, parsed.summary);
      const filename = encodeURIComponent('수강생_클렌징_결과.xlsx');
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

module.exports = { handleCleansingRoutes };
