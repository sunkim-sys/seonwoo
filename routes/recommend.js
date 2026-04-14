const { recommendFromBuffer } = require('../services/recommendService');
const { findLectures } = require('../services/sheetService');
const { extractKeywords } = require('../services/aiService');

async function handleRecommendRoutes(req, res, { parseMultipart, sendJson }) {
  // POST /api/recommend/analyze
  if (req.method === 'POST' && req.url === '/api/recommend/analyze') {
    try {
      const parts = await parseMultipart(req);
      const filePart = parts.find(p => p.filename);
      const namesPart = parts.find(p => p.name === 'names');
      const topNPart = parts.find(p => p.name === 'topN');

      if (!filePart) {
        return sendJson(res, 400, { error: '판매 데이터 파일을 첨부해주세요.' });
      }

      const names = (namesPart ? namesPart.data.toString('utf-8') : '')
        .split('\n').map(n => n.trim()).filter(Boolean);
      const topN = topNPart ? parseInt(topNPart.data.toString('utf-8')) || 5 : 5;

      if (names.length === 0) {
        return sendJson(res, 400, { error: '강의명을 입력해주세요.' });
      }

      // Parse sales data from uploaded file
      const { ranked, summary } = recommendFromBuffer(filePart.data, names);

      // Get top N
      const top = ranked.slice(0, topN);

      // Enrich with course info from Google Sheet
      const topNames = top.map(t => t.name);
      let sheetData = [];
      try {
        sheetData = await findLectures(topNames);
      } catch (e) {
        console.log('[Recommend] Sheet lookup failed:', e.message);
      }

      // Extract keywords for all top lectures via AI (batch)
      let keywordsMap = {};
      try {
        const lecturesForKeywords = top.map((item, i) => ({
          name: item.name,
          intro: (sheetData[i] || {}).intro || '',
          category: item.category || (sheetData[i] || {}).category || '',
        }));
        keywordsMap = await extractKeywords(lecturesForKeywords);
      } catch (e) {
        console.log('[Recommend] Keyword extraction failed:', e.message);
      }

      const results = [];
      for (let i = 0; i < top.length; i++) {
        const item = top[i];
        const sheetInfo = sheetData[i] || {};

        let reason = '';
        if (item.count > 0) {
          reason = `판매 ${item.count}건, 매출 ${item.totalRevenue.toLocaleString()}원`;
          if (item.score >= 0.7) reason += ' (인기 강의)';
          else if (item.score >= 0.4) reason += ' (관심도 높음)';
        } else {
          reason = '판매 데이터 없음';
        }

        const keywords = keywordsMap[item.name] || [];

        results.push({
          rank: i + 1,
          name: item.name,
          category: item.category || (sheetInfo.category || ''),
          price: item.price,
          count: item.count,
          revenue: item.totalRevenue,
          score: Math.round(item.score * 100),
          reason: reason,
          keywords: keywords,
          intro: sheetInfo.intro || '',
          url: sheetInfo.url || '',
        });
      }

      sendJson(res, 200, {
        total: names.length,
        recommended: results.length,
        salesSummary: summary,
        results,
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

module.exports = { handleRecommendRoutes };
