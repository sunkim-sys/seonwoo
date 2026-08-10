const users = require('../services/settlement/users');
const { createSession, destroySession, getSession, setSessionCookie, clearSessionCookie } = require('../services/auth');

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

async function handleAuthRoutes(req, res, { sendJson }) {
  const p = req.url.split('?')[0];

  try {
    if (req.method === 'POST' && p === '/api/auth/login') {
      const body = await readJsonBody(req);
      const user = await users.verifyLogin(body.login_id, body.password);
      if (!user) return sendJson(res, 401, { error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
      const token = createSession(user);
      setSessionCookie(req, res, token);
      return sendJson(res, 200, { name: user.name, role: user.role, login_id: user.login_id });
    }

    if (req.method === 'POST' && p === '/api/auth/logout') {
      destroySession(req);
      clearSessionCookie(req, res);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && p === '/api/auth/me') {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: '로그인이 필요합니다.' });
      return sendJson(res, 200, { name: session.name, role: session.role, login_id: session.loginId });
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

module.exports = { handleAuthRoutes };
