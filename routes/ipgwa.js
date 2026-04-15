const { SHEET_CONFIGS, parseMainSheet, generateSheet, generatePreview, validateRows, applyCorrections, generateOriginalSheet, autoCleanse } = require('../services/ipgwaService');
const { buildStyledWorkbook } = require('../services/styledXlsx');

async function handleIpgwaRoutes(req, res, { parseMultipart, sendJson }) {
  // POST /api/ipgwa/upload
  if (req.method === 'POST' && req.url === '/api/ipgwa/upload') {
    const parts = await parseMultipart(req);
    const filePart = parts.find(p => p.filename);

    if (!filePart) {
      return sendJson(res, 400, { error: '파일을 선택해주세요.' });
    }

    try {
      const parsed = parseMainSheet(filePart.data);
      const cleansedCount = autoCleanse(parsed);

      const extras = {};
      parts.filter(p => !p.filename).forEach(p => {
        extras[p.name] = p.data.toString('utf-8').trim();
      });

      global._ipgwaData = parsed;
      global._ipgwaExtras = extras;

      const sheets = SHEET_CONFIGS.map(c => ({
        id: c.id,
        name: c.name,
        rowCount: parsed.rows.length,
      }));

      const issues = validateRows(parsed);

      sendJson(res, 200, {
        success: true,
        rowCount: parsed.rows.length,
        detectedHeaders: parsed.rawHeaders,
        mappedFields: Object.keys(parsed.headerIndex),
        cleansedCount,
        issues,
        sheets,
      });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  // GET /api/ipgwa/sample
  if (req.method === 'GET' && req.url === '/api/ipgwa/sample') {
    try {
      const headers = ['번호', '이름', '휴대폰 번호', '이메일', '직무', '직급', '소속/부서'];
      const rows = [
        [1, '홍길동', '010-1234-5678', 'hong@example.com', '기획', '대리', 'HR팀'],
        [2, '김철수', '010-2345-6789', 'kim@example.com', '개발', '팀장', '개발팀'],
        [3, '이영희', '010-3456-7890', 'lee@example.com', '디자인', '과장', '디자인팀'],
      ];
      const buffer = buildStyledWorkbook({
        sheetName: 'Main',
        headers,
        rows,
        widths: [
          { wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 28 },
          { wch: 14 }, { wch: 12 }, { wch: 18 },
        ],
      });
      const filename = encodeURIComponent('입과_샘플.xlsx');
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

  // POST /api/ipgwa/fix
  if (req.method === 'POST' && req.url === '/api/ipgwa/fix') {
    const parsed = global._ipgwaData;
    if (!parsed) {
      return sendJson(res, 400, { error: '먼저 파일을 업로드해주세요.' });
    }
    let body = '';
    req.on('data', chunk => { body += chunk.toString('utf-8'); });
    req.on('end', () => {
      try {
        const { corrections } = JSON.parse(body || '{}');
        if (!Array.isArray(corrections)) {
          return sendJson(res, 400, { error: 'corrections가 배열이어야 합니다.' });
        }
        const applied = applyCorrections(parsed, corrections);
        const issues = validateRows(parsed);
        sendJson(res, 200, { success: true, applied, issues });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
    });
    return;
  }

  // GET /api/ipgwa/download-original
  if (req.method === 'GET' && req.url === '/api/ipgwa/download-original') {
    const parsed = global._ipgwaData;
    if (!parsed) {
      return sendJson(res, 400, { error: '먼저 파일을 업로드해주세요.' });
    }
    try {
      const buffer = generateOriginalSheet(parsed);
      const filename = encodeURIComponent('입과_원본_수정본.xlsx');
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

  // GET /api/ipgwa/preview/:sheetId
  const previewMatch = req.url.match(/^\/api\/ipgwa\/preview\/(.+)$/);
  if (req.method === 'GET' && previewMatch) {
    const sheetId = previewMatch[1];
    const parsed = global._ipgwaData;

    if (!parsed) {
      return sendJson(res, 400, { error: '먼저 파일을 업로드해주세요.' });
    }

    const config = SHEET_CONFIGS.find(c => c.id === sheetId);
    if (!config) {
      return sendJson(res, 404, { error: '시트를 찾을 수 없습니다.' });
    }

    try {
      const extras = global._ipgwaExtras || {};
      const preview = generatePreview(parsed, config, extras);
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
    const parsed = global._ipgwaData;

    if (!parsed) {
      return sendJson(res, 400, { error: '먼저 파일을 업로드해주세요.' });
    }

    const config = SHEET_CONFIGS.find(c => c.id === sheetId);
    if (!config) {
      return sendJson(res, 404, { error: '시트를 찾을 수 없습니다.' });
    }

    try {
      const extras = global._ipgwaExtras || {};
      const buffer = generateSheet(parsed, config, extras);
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
