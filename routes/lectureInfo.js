const XLSX = require('xlsx');
const { summarizeLecture } = require('../services/aiService');
const { findLectures } = require('../services/sheetService');

function parseTSV(text) {
  // Parse entire text respecting quoted fields (which may contain newlines)
  const rows = [];
  let current = '';
  let inQuotes = false;
  let row = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === '\t' && !inQuotes) {
      row.push(current.trim());
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++; // skip \r\n
      row.push(current.trim());
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
      current = '';
    } else {
      current += ch;
    }
  }
  // Last row
  row.push(current.trim());
  if (row.some(c => c !== '')) rows.push(row);

  if (rows.length < 2) return [];

  // Skip header, build lectures
  const lectures = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    // Need at least 교육명 (col 2) to be valid
    if (cols.length < 5 || !cols[2]) continue;
    lectures.push({
      category: cols[0] || '',
      subCategory: cols[1] || '',
      name: cols[2] || '',
      level: cols[3] || '',
      intro: cols[4] || '',
      goals: cols[5] || '',
      target: cols[6] || '',
      curriculum: cols[7] || '',
      url: cols[8] || '',
    });
  }
  return lectures;
}

async function handleLectureInfoRoutes(req, res, { parseMultipart, sendJson }) {
  // POST /api/lecture-info/summarize
  if (req.method === 'POST' && req.url === '/api/lecture-info/summarize') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        const rawText = body.text || '';
        const lectures = parseTSV(rawText);

        if (lectures.length === 0) {
          return sendJson(res, 400, { error: '강의 데이터를 파싱할 수 없습니다. 탭으로 구분된 데이터를 붙여넣어주세요.' });
        }

        // Process each lecture with delay to avoid rate limiting
        const results = [];
        for (let i = 0; i < lectures.length; i++) {
          // Add delay between requests (Groq free tier rate limit)
          if (i > 0) await new Promise(r => setTimeout(r, 2000));

          try {
            const summary = await summarizeLecture(lectures[i]);
            results.push({
              name: lectures[i].name,
              info: summary.info,
              point1: summary.point1,
              point2: summary.point2,
              point3: summary.point3,
              url: lectures[i].url,
            });
          } catch (err) {
            console.log(`[Fallback] ${lectures[i].name}: ${err.message}`);
            // Fallback: extract from raw goals
            const goals = (lectures[i].goals || '').split(/\d+\.\s*/).filter(g => g.trim());
            results.push({
              name: lectures[i].name,
              info: lectures[i].intro || '',
              point1: goals[0] ? goals[0].trim().split('\n')[0] : '',
              point2: goals[1] ? goals[1].trim().split('\n')[0] : '',
              point3: goals[2] ? goals[2].trim().split('\n')[0] : '',
              url: lectures[i].url,
            });
          }
        }

        // Generate Excel
        const headers = ['교육명', '강의정보', '학습 Point 1', '학습 Point 2', '학습 Point 3', 'URL'];
        const rows = results.map(r => [r.name, r.info, r.point1, r.point2, r.point3, r.url]);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws['!cols'] = [
          { wch: 40 }, { wch: 55 }, { wch: 45 }, { wch: 45 }, { wch: 45 }, { wch: 45 },
        ];
        XLSX.utils.book_append_sheet(wb, ws, '강의 정보');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const filename = encodeURIComponent('강의 정보 정리.xlsx');
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

  async function summarizeOne(lecture) {
    try {
      const summary = await summarizeLecture(lecture);
      return {
        name: lecture.name,
        info: summary.info,
        point1: summary.point1,
        point2: summary.point2,
        point3: summary.point3,
        url: lecture.url,
      };
    } catch (err) {
      console.log(`[Fallback] ${lecture.name}: ${err.message}`);
      const goals = (lecture.goals || '').split(/\d+\.\s*/).filter(g => g.trim());
      return {
        name: lecture.name,
        info: lecture.intro || '',
        point1: goals[0] ? goals[0].trim().split('\n')[0] : '',
        point2: goals[1] ? goals[1].trim().split('\n')[0] : '',
        point3: goals[2] ? goals[2].trim().split('\n')[0] : '',
        url: lecture.url,
      };
    }
  }

  // POST /api/lecture-info/by-names
  if (req.method === 'POST' && req.url === '/api/lecture-info/by-names') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        const names = (body.names || '').split('\n').map(n => n.trim()).filter(Boolean);

        if (names.length === 0) {
          return sendJson(res, 400, { error: '강의명을 입력해주세요.' });
        }

        const lectures = await findLectures(names);
        const found = lectures.filter(l => !l.notFound);
        const notFound = lectures.filter(l => l.notFound).map(l => l.name);

        if (found.length === 0) {
          return sendJson(res, 400, { error: '일치하는 강의를 찾을 수 없습니다: ' + notFound.join(', ') });
        }

        const results = [];
        for (let i = 0; i < found.length; i++) {
          if (i > 0) await new Promise(r => setTimeout(r, 2000));
          results.push(await summarizeOne(found[i]));
        }

        sendJson(res, 200, {
          results,
          notFound,
          total: names.length,
          summarized: results.length,
        });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // POST /api/lecture-info/retry
  if (req.method === 'POST' && req.url === '/api/lecture-info/retry') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        const name = (body.name || '').trim();
        if (!name) return sendJson(res, 400, { error: '강의명이 필요합니다.' });

        const lectures = await findLectures([name]);
        const lec = lectures.find(l => !l.notFound);
        if (!lec) return sendJson(res, 404, { error: '강의를 찾을 수 없습니다.' });

        const result = await summarizeOne(lec);
        sendJson(res, 200, { result });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // POST /api/lecture-info/download
  if (req.method === 'POST' && req.url === '/api/lecture-info/download') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        const results = Array.isArray(body.results) ? body.results : [];
        if (!results.length) return sendJson(res, 400, { error: '다운로드할 데이터가 없습니다.' });

        const headers = ['교육명', '강의정보', '학습 Point 1', '학습 Point 2', '학습 Point 3', 'URL'];
        const rows = results.map(r => [r.name || '', r.info || '', r.point1 || '', r.point2 || '', r.point3 || '', r.url || '']);
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws['!cols'] = [{ wch: 40 }, { wch: 55 }, { wch: 45 }, { wch: 45 }, { wch: 45 }, { wch: 45 }];
        XLSX.utils.book_append_sheet(wb, ws, '강의 정보');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const filename = encodeURIComponent('강의 정보 정리.xlsx');
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

  sendJson(res, 404, { error: 'Not found' });
}

module.exports = { handleLectureInfoRoutes };
