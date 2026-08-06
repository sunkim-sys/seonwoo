const { generateReport } = require('../services/resultReportService');

async function handleResultReportRoutes(req, res, { parseMultipart, sendJson }) {
  // POST /api/result-report/generate
  if (req.method === 'POST' && req.url === '/api/result-report/generate') {
    const parts = await parseMultipart(req);
    const enrollment = parts.find(p => p.name === 'enrollment' && p.filename);
    const hourly = parts.find(p => p.name === 'hourly' && p.filename);
    const daily = parts.find(p => p.name === 'daily' && p.filename);
    const totalEnrolledPart = parts.find(p => p.name === 'totalEnrolled' && !p.filename);

    if (!enrollment || !hourly || !daily) {
      return sendJson(res, 400, { error: '3개 파일을 모두 업로드해주세요. (개인별 수강 이력 / 시간대별 표 / 날짜별 표)' });
    }
    if (!totalEnrolledPart) {
      return sendJson(res, 400, { error: '총 입과인원을 입력해주세요.' });
    }

    try {
      const report = generateReport({
        enrollmentBuffer: enrollment.data,
        hourlyBuffer: hourly.data,
        dailyBuffer: daily.data,
        totalEnrolled: Number(totalEnrolledPart.data.toString('utf-8').trim()),
      });
      sendJson(res, 200, { success: true, report });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

module.exports = { handleResultReportRoutes };
