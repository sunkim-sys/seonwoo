const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleLectureInfoRoutes } = require('./routes/lectureInfo');
const { handleRecommendRoutes } = require('./routes/recommend');
const { handleCatalogRoutes } = require('./routes/catalog');
const { handleCategorizeRoutes } = require('./routes/categorize');
const { handleMembersRoutes } = require('./routes/members');
const { handleResultReportRoutes } = require('./routes/resultReport');
const { handleCompanyListRoutes } = require('./routes/companyList');
const { handleSettlementRoutes } = require('./routes/settlement');
const { handleEnrollmentReportRoutes } = require('./routes/enrollmentReport');
const { handleAuthRoutes } = require('./routes/auth');
const { getSession } = require('./services/auth');

const PORT = process.env.PORT || 3000;
const PUBLIC_ROOT = path.join(__dirname, 'public');

// Paths reachable without a logged-in session: the login page itself, its API,
// and shared static assets (no secrets live in css/js — data comes from gated APIs).
function isPublicPath(pathname) {
  return pathname === '/login.html'
    || pathname.startsWith('/css/')
    || pathname.startsWith('/js/');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
};

function serveStatic(req, res) {
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  const requested = pathname === '/' ? 'index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_ROOT, requested));

  // Containment check: normalize can still walk out of PUBLIC_ROOT via a
  // crafted "../" path, so reject anything that resolves outside it.
  if (filePath !== PUBLIC_ROOT && !filePath.startsWith(PUBLIC_ROOT + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: serve index.html for page routes
      if (err.code === 'ENOENT' && !ext) {
        fs.readFile(path.join(PUBLIC_ROOT, 'index.html'), (err2, html) => {
          if (err2) { res.writeHead(404); res.end('Not Found'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
        });
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
    if (!boundaryMatch) return reject(new Error('No boundary'));
    const boundary = boundaryMatch[1] || boundaryMatch[2];

    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const delimiter = Buffer.from('\r\n--' + boundary);
      const closeDelimiter = Buffer.from('--' + boundary + '--');
      const parts = [];

      // First boundary starts without leading \r\n
      let pos = buffer.indexOf(Buffer.from('--' + boundary));
      if (pos === -1) { resolve([]); return; }
      pos += ('--' + boundary).length + 2; // skip boundary + \r\n

      while (pos < buffer.length) {
        // Find next delimiter
        let nextDelim = buffer.indexOf(delimiter, pos);
        if (nextDelim === -1) break;

        const partData = buffer.slice(pos, nextDelim);
        const headerEnd = partData.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const headerStr = partData.slice(0, headerEnd).toString('utf-8');
          const body = partData.slice(headerEnd + 4);

          const nameMatch = headerStr.match(/name="([^"]+)"/);
          const filenameMatch = headerStr.match(/filename="([^"]+)"/);

          parts.push({
            name: nameMatch ? nameMatch[1] : '',
            filename: filenameMatch ? filenameMatch[1] : null,
            data: body,
          });
        }

        pos = nextDelim + delimiter.length + 2; // skip delimiter + \r\n
      }

      resolve(parts);
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  try {
    // CORS - allow all for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Auth: login/logout/me are handled before the gate below
    if (req.url.startsWith('/api/auth')) {
      return await handleAuthRoutes(req, res, { sendJson });
    }

    // Everything else requires a valid session, except login.html and shared static assets
    const pathname = req.url.split('?')[0];
    if (!isPublicPath(pathname)) {
      const session = getSession(req);
      if (!session) {
        if (pathname.startsWith('/api/')) {
          return sendJson(res, 401, { error: '로그인이 필요합니다.' });
        }
        res.writeHead(302, { Location: '/login.html?redirect=' + encodeURIComponent(pathname) });
        return res.end();
      }
      req.session = session;
    }

    // API routes
    if (req.url.startsWith('/api/lecture-info')) {
      return await handleLectureInfoRoutes(req, res, { parseMultipart, sendJson });
    }
    if (req.url.startsWith('/api/recommend')) {
      return await handleRecommendRoutes(req, res, { parseMultipart, sendJson });
    }
    if (req.url.startsWith('/api/catalog')) {
      return await handleCatalogRoutes(req, res, { sendJson });
    }
    if (req.url.startsWith('/api/categorize')) {
      return await handleCategorizeRoutes(req, res, { sendJson });
    }
    if (req.url.startsWith('/api/members')) {
      return await handleMembersRoutes(req, res, { sendJson });
    }
    if (req.url.startsWith('/api/result-report')) {
      return await handleResultReportRoutes(req, res, { parseMultipart, sendJson });
    }
    if (req.url.startsWith('/api/company-list')) {
      return await handleCompanyListRoutes(req, res, { sendJson });
    }
    if (req.url.startsWith('/api/settlement')) {
      return await handleSettlementRoutes(req, res, { parseMultipart, sendJson });
    }
    if (req.url.startsWith('/api/enrollment-report')) {
      return await handleEnrollmentReportRoutes(req, res, { parseMultipart, sendJson });
    }
    // Static files
    serveStatic(req, res);
  } catch (err) {
    console.error('ERROR:', err);
    sendJson(res, 500, { error: 'Internal Server Error: ' + err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
