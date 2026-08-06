const url = require('url');
const providers = require('../services/settlement/providers');
const contracts = require('../services/settlement/contracts');
const products = require('../services/settlement/products');
const revenues = require('../services/settlement/revenues');
const users = require('../services/settlement/users');
const calc = require('../services/settlement/calc');
const dashboard = require('../services/settlement/dashboard');
const { IMPORT_TYPES, TEMPLATES } = require('../services/settlement/csvImport');

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('잘못된 JSON 형식입니다.')); }
    });
    req.on('error', reject);
  });
}

async function handleSettlementRoutes(req, res, { parseMultipart, sendJson }) {
  const parsed = url.parse(req.url, true);
  const p = parsed.pathname;
  const q = parsed.query;
  const method = req.method;

  try {
    // ---- CP사 관리 ----
    if (method === 'GET' && p === '/api/settlement/providers') {
      return sendJson(res, 200, await providers.listProviders());
    }
    let m = p.match(/^\/api\/settlement\/providers\/(\d+)$/);
    if (m && method === 'GET') {
      const row = await providers.getProvider(Number(m[1]));
      return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: '찾을 수 없습니다.' });
    }
    if (method === 'POST' && p === '/api/settlement/providers') {
      return sendJson(res, 201, await providers.createProvider(await readJsonBody(req)));
    }
    if (m && method === 'PUT') {
      const row = await providers.updateProvider(Number(m[1]), await readJsonBody(req));
      return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: '찾을 수 없습니다.' });
    }
    if (m && method === 'DELETE') {
      await providers.deleteProvider(Number(m[1]));
      return sendJson(res, 200, { ok: true });
    }

    // ---- 계약 관리 ----
    if (method === 'GET' && p === '/api/settlement/contracts') {
      return sendJson(res, 200, await contracts.listContracts());
    }
    m = p.match(/^\/api\/settlement\/contracts\/(\d+)$/);
    if (m && method === 'GET') {
      const row = await contracts.getContract(Number(m[1]));
      return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: '찾을 수 없습니다.' });
    }
    if (method === 'POST' && p === '/api/settlement/contracts') {
      return sendJson(res, 201, await contracts.createContract(await readJsonBody(req)));
    }
    if (m && method === 'PUT') {
      const row = await contracts.updateContract(Number(m[1]), await readJsonBody(req));
      return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: '찾을 수 없습니다.' });
    }
    if (m && method === 'DELETE') {
      await contracts.deleteContract(Number(m[1]));
      return sendJson(res, 200, { ok: true });
    }

    // ---- 상품 관리 ----
    if (method === 'GET' && p === '/api/settlement/products') {
      return sendJson(res, 200, await products.listProducts());
    }
    if (method === 'POST' && p === '/api/settlement/products/exclude') {
      const body = await readJsonBody(req);
      await products.setSettlementExcluded(body.product_ids || [], body.excluded !== false);
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'DELETE' && p === '/api/settlement/products') {
      await products.deleteAllProducts();
      return sendJson(res, 200, { ok: true });
    }
    m = p.match(/^\/api\/settlement\/products\/([^/]+)$/);
    if (m && method === 'GET') {
      const row = await products.getProduct(decodeURIComponent(m[1]));
      return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: '찾을 수 없습니다.' });
    }
    if (method === 'POST' && p === '/api/settlement/products') {
      return sendJson(res, 201, await products.createProduct(await readJsonBody(req)));
    }
    if (m && method === 'PUT') {
      const row = await products.updateProduct(decodeURIComponent(m[1]), await readJsonBody(req));
      return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: '찾을 수 없습니다.' });
    }
    if (m && method === 'DELETE') {
      await products.deleteProduct(decodeURIComponent(m[1]));
      return sendJson(res, 200, { ok: true });
    }

    // ---- 매출 관리 ----
    if (method === 'GET' && p === '/api/settlement/revenues') {
      return sendJson(res, 200, await revenues.listRevenues());
    }
    if (method === 'POST' && p === '/api/settlement/revenues') {
      return sendJson(res, 201, await revenues.createRevenue(await readJsonBody(req)));
    }
    m = p.match(/^\/api\/settlement\/revenues\/([^/]+)\/mappings$/);
    if (m && method === 'POST') {
      const body = await readJsonBody(req);
      await revenues.addMapping(decodeURIComponent(m[1]), body.product_id);
      return sendJson(res, 200, { ok: true });
    }
    m = p.match(/^\/api\/settlement\/revenues\/([^/]+)\/mappings\/([^/]+)$/);
    if (m && method === 'DELETE') {
      await revenues.removeMapping(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
      return sendJson(res, 200, { ok: true });
    }
    m = p.match(/^\/api\/settlement\/revenues\/([^/]+)$/);
    if (m && method === 'GET') {
      const row = await revenues.getRevenue(decodeURIComponent(m[1]));
      return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: '찾을 수 없습니다.' });
    }
    if (m && method === 'PUT') {
      const row = await revenues.updateRevenue(decodeURIComponent(m[1]), await readJsonBody(req));
      return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: '찾을 수 없습니다.' });
    }
    if (m && method === 'DELETE') {
      await revenues.deleteRevenue(decodeURIComponent(m[1]));
      return sendJson(res, 200, { ok: true });
    }

    // ---- 사용자 관리 ----
    if (method === 'GET' && p === '/api/settlement/users') {
      return sendJson(res, 200, await users.listUsers());
    }
    if (method === 'POST' && p === '/api/settlement/users') {
      return sendJson(res, 201, await users.createUser(await readJsonBody(req)));
    }
    m = p.match(/^\/api\/settlement\/users\/(\d+)$/);
    if (m && method === 'PUT') {
      const row = await users.updateUser(Number(m[1]), await readJsonBody(req));
      return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: '찾을 수 없습니다.' });
    }
    m = p.match(/^\/api\/settlement\/users\/(\d+)\/deactivate$/);
    if (m && method === 'POST') {
      await users.deactivateUser(Number(m[1]));
      return sendJson(res, 200, { ok: true });
    }

    // ---- 대시보드 ----
    if (method === 'GET' && p === '/api/settlement/dashboard/summary') {
      return sendJson(res, 200, await dashboard.getSummary(q.period));
    }
    if (method === 'GET' && p === '/api/settlement/dashboard/trend') {
      return sendJson(res, 200, await dashboard.getTrend(q.start_period, q.end_period));
    }
    if (method === 'GET' && p === '/api/settlement/dashboard/review') {
      return sendJson(res, 200, await dashboard.getReview(q.period));
    }

    // ---- 정산 ----
    if (method === 'GET' && p === '/api/settlement/settlements') {
      return sendJson(res, 200, await calc.listSettlements(q.period));
    }
    m = p.match(/^\/api\/settlement\/settlements\/(\d+)$/);
    if (m && method === 'GET') {
      const row = await calc.getSettlement(Number(m[1]));
      return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: '찾을 수 없습니다.' });
    }
    m = p.match(/^\/api\/settlement\/settlements\/(\d+)\/confirm$/);
    if (m && method === 'POST') {
      const row = await calc.confirmSettlement(Number(m[1]));
      return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: '찾을 수 없습니다.' });
    }
    if (method === 'POST' && p === '/api/settlement/calculate') {
      const body = await readJsonBody(req);
      const rows = await calc.runSettlementCalculation(body.period);
      return sendJson(res, 200, { calculated: rows.length, rows });
    }

    // ---- CSV Import ----
    m = p.match(/^\/api\/settlement\/import\/([^/]+)\/template$/);
    if (m && method === 'GET') {
      const type = m[1];
      const template = TEMPLATES[type];
      if (!template) return sendJson(res, 404, { error: '알 수 없는 유형입니다.' });
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${type}_template.csv"`,
      });
      return res.end('﻿' + template);
    }
    m = p.match(/^\/api\/settlement\/import\/([^/]+)$/);
    if (m && method === 'POST') {
      const type = m[1];
      const importType = IMPORT_TYPES[type];
      if (!importType) return sendJson(res, 400, { error: '알 수 없는 import 유형입니다.' });

      const parts = await parseMultipart(req);
      const filePart = parts.find(part => part.name === 'file' && part.filename);
      if (!filePart) return sendJson(res, 400, { error: 'CSV 파일을 첨부해주세요.' });
      const periodPart = parts.find(part => part.name === 'settlement_year_month' && !part.filename);
      const period = periodPart ? periodPart.data.toString('utf-8').trim() : undefined;

      const result = importType.needsPeriod
        ? await importType.handler(filePart.data, period)
        : await importType.handler(filePart.data);
      return sendJson(res, 200, result);
    }
    if (method === 'GET' && p === '/api/settlement/import') {
      return sendJson(res, 200, Object.entries(IMPORT_TYPES).map(([key, v]) => ({ key, label: v.label, needsPeriod: v.needsPeriod })));
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

module.exports = { handleSettlementRoutes };
