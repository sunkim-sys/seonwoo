const { runMembersDownload } = require('../services/membersService');
const fs = require('fs');
const path = require('path');

// In-memory job store: jobId -> { tmpDir, files, mergedPath }
const jobs = new Map();

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

async function handleMembersRoutes(req, res, { sendJson }) {
  // POST /api/members/run  — SSE stream
  if (req.method === 'POST' && req.url === '/api/members/run') {
    let body;
    try { body = await parseJsonBody(req); }
    catch (e) { return sendJson(res, 400, { error: '요청 형식 오류' }); }

    const { companies } = body;
    if (!Array.isArray(companies) || companies.length === 0) {
      return sendJson(res, 400, { error: '기업명을 입력하세요.' });
    }

    const credentials = {
      email: process.env.SKILLFLO_EMAIL || '',
      password: process.env.SKILLFLO_PASSWORD || '',
    };
    if (!credentials.email || !credentials.password) {
      return sendJson(res, 500, { error: '서버에 SKILLFLO 계정 정보가 설정되지 않았습니다.' });
    }

    // SSE setup
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (type, data) => {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2);

    try {
      const { results, mergedPath, tmpDir } = await runMembersDownload(
        companies,
        credentials,
        (msg) => send('progress', { msg })
      );

      // Store job for download
      const files = results
        .filter(r => r.success && r.filePath && fs.existsSync(r.filePath))
        .map(r => ({ company: r.company, filename: path.basename(r.filePath) }));

      jobs.set(jobId, { tmpDir, mergedPath });

      // Clean up old jobs after 30 minutes
      setTimeout(() => {
        const job = jobs.get(jobId);
        if (job) {
          try { fs.rmSync(job.tmpDir, { recursive: true, force: true }); } catch (_) {}
          jobs.delete(jobId);
        }
      }, 30 * 60 * 1000);

      send('done', {
        jobId,
        files,
        merged: path.basename(mergedPath),
        successCount: results.filter(r => r.success).length,
        failCount: results.filter(r => !r.success).length,
      });
    } catch (err) {
      send('error', { msg: err.message });
    }

    res.end();
    return;
  }

  // GET /api/members/download/:jobId/:filename
  const dlMatch = req.url.match(/^\/api\/members\/download\/([^/]+)\/(.+)$/);
  if (req.method === 'GET' && dlMatch) {
    const [, jobId, filename] = dlMatch;
    const job = jobs.get(jobId);
    if (!job) return sendJson(res, 404, { error: '다운로드 링크가 만료되었습니다.' });

    const filePath = path.join(job.tmpDir, decodeURIComponent(filename));
    if (!filePath.startsWith(job.tmpDir) || !fs.existsSync(filePath)) {
      return sendJson(res, 404, { error: '파일을 찾을 수 없습니다.' });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv; charset=utf-8';

    const encodedName = encodeURIComponent(path.basename(filePath));
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

module.exports = { handleMembersRoutes };
