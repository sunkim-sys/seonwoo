let allRawLogs = [];

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ko-KR');
}

function renderSummary(articles) {
  const body = document.getElementById('summaryBody');
  if (!articles.length) {
    body.innerHTML = '<tr><td colspan="4">아직 수집된 로그가 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = articles.map(a => `
    <tr>
      <td>${escapeHtml(a.title || a.articleId)}</td>
      <td><a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.url)}</a></td>
      <td>${a.views}</td>
      <td>${formatDate(a.lastViewedAt)}</td>
    </tr>
  `).join('');
}

function renderRaw(logs) {
  const body = document.getElementById('rawBody');
  if (!logs.length) {
    body.innerHTML = '<tr><td colspan="5">아직 수집된 로그가 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = logs.map(l => `
    <tr>
      <td>${formatDate(l.receivedAt)}</td>
      <td>${escapeHtml(l.title || l.articleId)}</td>
      <td>${escapeHtml(l.referrer)}</td>
      <td>${escapeHtml(l.ip)}</td>
      <td>${escapeHtml(l.userAgent)}</td>
    </tr>
  `).join('');
}

function applyFilter() {
  const q = document.getElementById('filterInput').value.trim().toLowerCase();
  if (!q) return renderRaw(allRawLogs);
  const filtered = allRawLogs.filter(l =>
    (l.title || '').toLowerCase().includes(q) ||
    (l.url || '').toLowerCase().includes(q) ||
    (l.articleId || '').toLowerCase().includes(q)
  );
  renderRaw(filtered);
}

async function init() {
  try {
    const [summaryRes, logsRes] = await Promise.all([
      fetch('/api/doc-log/summary').then(r => r.json()),
      fetch('/api/doc-log?limit=500').then(r => r.json()),
    ]);
    allRawLogs = logsRes.logs || [];
    renderSummary(summaryRes.articles || []);
    renderRaw(allRawLogs);
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
  } catch (err) {
    document.getElementById('loading').textContent = '로그를 불러오지 못했습니다: ' + err.message;
  }
}

document.getElementById('filterInput')?.addEventListener('input', applyFilter);
init();
