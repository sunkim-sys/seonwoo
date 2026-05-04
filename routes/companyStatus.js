const XLSX = require('xlsx');

async function handleCompanyStatusRoutes(req, res, { parseMultipart, sendJson }) {
  // POST /api/company-status/analyze
  if (req.method === 'POST' && req.url === '/api/company-status/analyze') {
    try {
      const parts = await parseMultipart(req);
      const filePart = parts.find(p => p.filename);
      if (!filePart) return sendJson(res, 400, { error: '파일을 업로드해주세요.' });

      const wb = XLSX.read(filePart.data, { type: 'buffer' });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (rows.length < 2) return sendJson(res, 400, { error: '데이터가 없습니다.' });

      const headers = rows[0].map(h => String(h));

      // Find 기업명 column (first column, or search by header name)
      let companyColIdx = headers.findIndex(h => h.includes('기업') || h.includes('회사'));
      if (companyColIdx < 0) companyColIdx = 0;

      const companyMap = new Map();
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const company = String(row[companyColIdx] || '').trim();
        if (!company) continue;
        if (!companyMap.has(company)) companyMap.set(company, []);
        companyMap.get(company).push(row);
      }

      const companies = [...companyMap.entries()]
        .map(([name, members]) => ({ name, count: members.length, members }))
        .sort((a, b) => b.count - a.count);

      sendJson(res, 200, {
        total: companies.reduce((s, c) => s + c.count, 0),
        companyCount: companies.length,
        headers,
        companies,
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // POST /api/company-status/export
  if (req.method === 'POST' && req.url === '/api/company-status/export') {
    try {
      const parts = await parseMultipart(req);
      const filePart = parts.find(p => p.filename);
      if (!filePart) return sendJson(res, 400, { error: '파일을 업로드해주세요.' });

      const wb = XLSX.read(filePart.data, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) return sendJson(res, 400, { error: '데이터가 없습니다.' });

      const headers = rows[0].map(h => String(h));
      let companyColIdx = headers.findIndex(h => h.includes('기업') || h.includes('회사'));
      if (companyColIdx < 0) companyColIdx = 0;

      const companyMap = new Map();
      for (let i = 1; i < rows.length; i++) {
        const company = String(rows[i][companyColIdx] || '').trim();
        if (!company) continue;
        if (!companyMap.has(company)) companyMap.set(company, []);
        companyMap.get(company).push(rows[i]);
      }

      const sorted = [...companyMap.entries()].sort((a, b) => b[1].length - a[1].length);

      // Sheet 1: summary
      const summaryRows = [['순위', '기업명', '구성원 수']];
      sorted.forEach(([name, members], idx) => summaryRows.push([idx + 1, name, members.length]));
      summaryRows.push(['', '합계', sorted.reduce((s, [, m]) => s + m.length, 0)]);

      // Sheet 2: full member list sorted by company
      const detailRows = [headers];
      for (const [, members] of sorted) {
        for (const row of members) detailRows.push(row);
      }

      const outWb = XLSX.utils.book_new();

      const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
      summaryWs['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(outWb, summaryWs, '기업별 현황');

      const detailWs = XLSX.utils.aoa_to_sheet(detailRows);
      if (headers.length > 0) {
        detailWs['!cols'] = headers.map((h, i) => {
          const maxLen = detailRows.reduce((m, r) => Math.max(m, String(r[i] || '').length), 0);
          return { wch: Math.min(Math.max(maxLen, h.length) + 2, 40) };
        });
      }
      XLSX.utils.book_append_sheet(outWb, detailWs, '전체 명단');

      const buffer = XLSX.write(outWb, { type: 'buffer', bookType: 'xlsx' });
      const filename = encodeURIComponent('기업별_학습현황.xlsx');
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

module.exports = { handleCompanyStatusRoutes };
