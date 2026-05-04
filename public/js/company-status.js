const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const fileNameEl = document.getElementById('fileName');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const exportBtn = document.getElementById('exportBtn');

let selectedFile = null;

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) selectFile(e.target.files[0]);
});

function selectFile(file) {
  if (!file.name.match(/\.xlsx?$/i)) {
    showStatus('엑셀 파일(.xlsx)만 지원합니다.', 'error');
    return;
  }
  selectedFile = file;
  fileNameEl.textContent = file.name;
  analyzeBtn.disabled = false;
  statusEl.style.display = 'none';
  resultsEl.style.display = 'none';
}

analyzeBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = '분석 중...';
  showStatus('파일을 분석하고 있습니다...', 'loading');

  const formData = new FormData();
  formData.append('file', selectedFile);

  try {
    const res = await fetch('/api/company-status/analyze', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    statusEl.style.display = 'none';
    renderResults(data);
  } catch (err) {
    showStatus('오류: ' + err.message, 'error');
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = '분석 시작';
  }
});

exportBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  exportBtn.disabled = true;
  exportBtn.textContent = '내보내는 중...';
  const formData = new FormData();
  formData.append('file', selectedFile);
  try {
    const res = await fetch('/api/company-status/export', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '기업별_학습현황.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('내보내기 실패: ' + err.message);
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = 'Excel 내보내기';
  }
});

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + (type || '');
  statusEl.style.display = msg ? 'block' : 'none';
}

function renderResults(data) {
  document.getElementById('resultSummary').textContent =
    `기업 ${data.companyCount}개 · 전체 ${data.total.toLocaleString()}명`;

  const tbody = data.companies.map((c, i) => `
    <tr class="cs-row" data-idx="${i}" style="cursor:pointer;">
      <td class="td-rank">${i + 1}</td>
      <td>${escapeHtml(c.name)}</td>
      <td class="td-count">${c.count.toLocaleString()}명</td>
    </tr>
  `).join('');

  document.getElementById('companyTable').innerHTML = `
    <table class="cs-table">
      <thead><tr><th>#</th><th>기업명</th><th>구성원 수</th></tr></thead>
      <tbody>${tbody}</tbody>
    </table>
  `;

  document.querySelectorAll('.cs-row').forEach(row => {
    row.addEventListener('click', () => showDetail(data.companies[Number(row.dataset.idx)], data.headers));
  });

  resultsEl.style.display = 'block';
}

function showDetail(company, headers) {
  document.getElementById('detailTitle').textContent = `${company.name} — ${company.count}명`;
  const thead = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
  const tbody = company.members.map(row =>
    `<tr>${headers.map((_, i) => `<td>${escapeHtml(String(row[i] ?? ''))}</td>`).join('')}</tr>`
  ).join('');
  document.getElementById('detailBody').innerHTML = `
    <div class="preview-table-wrap">
      <table class="preview-table">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  `;
  document.getElementById('detailModal').style.display = 'flex';
}

document.getElementById('detailClose').addEventListener('click', () => {
  document.getElementById('detailModal').style.display = 'none';
});
document.getElementById('detailModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

function escapeHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
