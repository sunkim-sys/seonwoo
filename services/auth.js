const crypto = require('crypto');

const SESSION_COOKIE = 'wt_sid';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

// In-memory session store: token -> { userId, name, role, loginId, expiresAt }
// Lost on process restart (Render free-tier cold sleep) — users just log in again.
const sessions = new Map();

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    if (!key) return;
    out[key] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

function isHttps(req) {
  return req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted;
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    userId: user.id,
    name: user.name,
    role: user.role,
    loginId: user.login_id,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function getSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function destroySession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) sessions.delete(token);
}

function setSessionCookie(req, res, token) {
  const secure = isHttps(req) ? ' Secure;' : '';
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax;${secure} Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
}

function clearSessionCookie(req, res) {
  const secure = isHttps(req) ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax;${secure} Max-Age=0`);
}

module.exports = {
  SESSION_COOKIE,
  createSession,
  getSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
};
