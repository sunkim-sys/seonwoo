const XLSX = require('xlsx');
const { getReportData } = require('../services/reportService');

async function handleReportRoutes(req, res, { sendJson }) {
  // GET /api/report/export → Excel download
  if (req.method === 'GET' && req.url === '/api/report/export') {
    try {
      const data = await getReportData();
      const wb = XLSX.utils.book_new();

      // Sheet 1: 월별 추이 (from last available month's trend)
      const lastMonth = data.availableMonths[data.availableMonths.length - 1];
      const trend = lastMonth && data.months[lastMonth] ? data.months[lastMonth].monthlyTrend : [];
      if (trend.length > 0) {
        const trendRows = [['월', '전체 콘텐츠', '신규', '종료']];
        trend.forEach(t => trendRows.push([t.month, t.total, t.newCount || 0, t.closedCount || 0]));
        const ws = XLSX.utils.aoa_to_sheet(trendRows);
        ws['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, ws, '월별 추이');
      }

      // Sheet 2: 싱글플랜 TOP10
      const singleRows = [['순위', '카테고리', '서브카테고리', '강의명', '수강인원']];
      (data.summary.singleTop10 || []).forEach(r =>
        singleRows.push([r.rank, r.category, r.subCategory || '', r.name, r.count])
      );
      const ws2 = XLSX.utils.aoa_to_sheet(singleRows);
      ws2['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 20 }, { wch: 50 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws2, '싱글플랜 TOP10');

      // Sheet 3: 올플랜 TOP10
      const allRows = [['순위', '카테고리', '서브카테고리', '강의명', '수강인원']];
      (data.summary.allplanTop10 || []).forEach(r =>
        allRows.push([r.rank, r.category, r.subCategory || '', r.name, r.count])
      );
      const ws3 = XLSX.utils.aoa_to_sheet(allRows);
      ws3['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 20 }, { wch: 50 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws3, '올플랜 TOP10');

      // Sheet 4: 카테고리별 순위
      const catRows = [['순위', '카테고리', '수강인원', '서브카테고리', '서브 수강인원']];
      (data.summary.categoryRank || []).forEach(r =>
        catRows.push([r.rank, r.category, r.count, r.subCategory || '', r.subCount || 0])
      );
      const ws4 = XLSX.utils.aoa_to_sheet(catRows);
      ws4['!cols'] = [{ wch: 6 }, { wch: 20 }, { wch: 12 }, { wch: 24 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws4, '카테고리별 순위');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filename = encodeURIComponent('콘텐츠_현황.xlsx');
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

  // GET /api/report → JSON data
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
