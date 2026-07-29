const url = require('url');
const {
  listCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany,
} = require('../services/companyListService');

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(new Error('잘못된 JSON 형식입니다.'));
      }
    });
    req.on('error', reject);
  });
}

async function handleCompanyListRoutes(req, res, { sendJson }) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const idMatch = pathname.match(/^\/api\/company-list\/(\d+)$/);

  try {
    // GET /api/company-list?search=&csm=&ae=&status=
    if (req.method === 'GET' && pathname === '/api/company-list') {
      const rows = await listCompanies(parsed.query);
      return sendJson(res, 200, rows);
    }

    // GET /api/company-list/:id
    if (req.method === 'GET' && idMatch) {
      const row = await getCompany(Number(idMatch[1]));
      if (!row) return sendJson(res, 404, { error: '찾을 수 없습니다.' });
      return sendJson(res, 200, row);
    }

    // POST /api/company-list
    if (req.method === 'POST' && pathname === '/api/company-list') {
      const body = await readJsonBody(req);
      const row = await createCompany(body);
      return sendJson(res, 201, row);
    }

    // PUT /api/company-list/:id
    if (req.method === 'PUT' && idMatch) {
      const body = await readJsonBody(req);
      const row = await updateCompany(Number(idMatch[1]), body);
      if (!row) return sendJson(res, 404, { error: '찾을 수 없습니다.' });
      return sendJson(res, 200, row);
    }

    // DELETE /api/company-list/:id
    if (req.method === 'DELETE' && idMatch) {
      await deleteCompany(Number(idMatch[1]));
      return sendJson(res, 200, { ok: true });
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

module.exports = { handleCompanyListRoutes };
