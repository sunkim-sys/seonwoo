const { generateReport, generateComments } = require('../services/enrollmentReportService');

async function handleEnrollmentReportRoutes(req, res, { parseMultipart, sendJson }) {
  // POST /api/enrollment-report/generate
  if (req.method === 'POST' && req.url === '/api/enrollment-report/generate') {
    try {
      const parts = await parseMultipart(req);
      const file = parts.find(p => p.name === 'file' && p.filename);
      if (!file) return sendJson(res, 400, { error: '수강 이력 CSV 파일을 업로드해주세요.' });
      const companyLabel = parts.find(p => p.name === 'company' && !p.filename)?.data.toString('utf-8').trim();
      const periodLabel = parts.find(p => p.name === 'period' && !p.filename)?.data.toString('utf-8').trim();

      const report = generateReport({ buffer: file.data, companyLabel, periodLabel });
      sendJson(res, 200, { report });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  // POST /api/enrollment-report/comments  { report }
  if (req.method === 'POST' && req.url === '/api/enrollment-report/comments') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        if (!body.report) return sendJson(res, 400, { error: 'report 데이터가 필요합니다.' });
        const comments = await generateComments(body.report);
        sendJson(res, 200, { comments });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

module.exports = { handleEnrollmentReportRoutes };
