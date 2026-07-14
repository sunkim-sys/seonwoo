const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOG_FILE = path.join(DATA_DIR, 'doc-logs.jsonl');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function appendLog(entry) {
  ensureDataDir();
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

function readLogs() {
  if (!fs.existsSync(LOG_FILE)) return [];
  return fs.readFileSync(LOG_FILE, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function queryLogs({ articleId, from, to, limit } = {}) {
  let logs = readLogs();
  if (articleId) logs = logs.filter(l => l.articleId === articleId);
  if (from) logs = logs.filter(l => l.receivedAt >= from);
  if (to) logs = logs.filter(l => l.receivedAt <= to);
  logs.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
  if (limit) logs = logs.slice(0, limit);
  return logs;
}

function summarize() {
  const logs = readLogs();
  const byArticle = new Map();
  for (const log of logs) {
    const key = log.articleId || log.url;
    if (!key) continue;
    if (!byArticle.has(key)) {
      byArticle.set(key, { articleId: key, title: log.title, url: log.url, views: 0, lastViewedAt: null });
    }
    const entry = byArticle.get(key);
    entry.views += 1;
    if (!entry.lastViewedAt || log.receivedAt > entry.lastViewedAt) entry.lastViewedAt = log.receivedAt;
    if (log.title) entry.title = log.title;
  }
  return Array.from(byArticle.values()).sort((a, b) => b.views - a.views);
}

module.exports = { appendLog, readLogs, queryLogs, summarize };
