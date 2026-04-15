const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const fileName = document.getElementById('fileName');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const summaryEl = document.getElementById('clSummary');
const issuesSection = document.getElementById('clIssuesSection');
const issuesEl = document.getElementById('clIssues');
const applyBtn = document.getElementById('applyBtn');
const previewEl = document.getElementById('clPreview');
const downloadBtn = document.getElementById('downloadBtn');

let selectedFile = null;
let lastResult = null;

uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) selectFile(e.target.files[0]);
});
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  if (e.dataTransfer.files.length) selectFile(e.dataTransfer.files[0]);
});

function selectFile(file) {
  if (!file.name.match(/\.xlsx?$/i)) {
    showStatus('엑셀 파일(.xlsx)만 업로드할 수 있습니다.', 'error');
    return;
  }
  selectedFile = file;
  fileName.textContent = file.name;
  uploadBtn.disabled = false;
  statusEl.style.display = 'none';
}

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + (type || '');
  statusEl.style.display = 'block';
}

uploadBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  uploadBtn.disabled = true;
  uploadBtn.textContent = '분석 중...';
  showStatus('파일 분석 중입니다...', 'info');

  const fd = new FormData();
  fd.append('file', selectedFile);
  try {
    const res = await fetch('/api/cleansing/upload', { method: 'POST', body: fd });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(text.slice(0, 200)); }
    if (!res.ok) throw new Error(data.error || '분석 실패');

    lastResult = data;
    renderResults(data);
    const fieldLabels = { name: '이름', email: '이메일', phone: '휴대폰', dept: '부서', rank: '직급', job: '직무', empId: '사번' };
    const recognized = (data.recognized || []).map(f => fieldLabels[f] || f).join(', ');
    showStatus(`분석 완료 (인식된 컬럼: ${recognized})`, 'success');
  } catch (err) {
    showStatus('오류: ' + err.message, 'error');
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = '분석 시작';
  }
});

function renderResults(data) {
  resultsEl.style.display = 'block';
  const s = data.summary;
  summaryEl.innerHTML = `
    <div class="cl-stat"><div class="cl-stat-k">전체</div><div class="cl-stat-v">${s.totalRows.toLocaleString()}건</div></div>
    <div class="cl-stat"><div class="cl-stat-k">자동 정리됨</div><div class="cl-stat-v ok">${s.changedRows.toLocaleString()}건</div></div>
    <div class="cl-stat"><div class="cl-stat-k">형식 오류</div><div class="cl-stat-v ${s.formatIssues > 0 ? 'warn' : ''}">${s.formatIssues.toLocaleString()}건</div></div>
    <div class="cl-stat"><div class="cl-stat-k">중복</div><div class="cl-stat-v ${s.duplicateIssues > 0 ? 'warn' : ''}">${s.duplicateIssues.toLocaleString()}건</div></div>
  `;

  const allIssues = [
    ...(data.issues || []).map(i => ({ ...i, type: 'format' })),
    ...(data.duplicates || []).map(i => ({ ...i, type: 'dup' })),
  ];
  if (allIssues.length === 0) {
    issuesSection.style.display = 'none';
  } else {
    issuesSection.style.display = 'block';
    issuesEl.innerHTML = `
      <div class="cl-issues-table-wrap">
        <table class="cl-issues-table">
          <thead><tr><th>행</th><th>이름</th><th>필드</th><th>값</th><th>이유</th></tr></thead>
          <tbody>
            ${allIssues.map(i => `
              <tr class="${i.type === 'dup' ? 'is-dup' : 'is-fmt'}">
                <td>${i.rowNumber}</td>
                <td>${escapeHtml(i.name)}</td>
                <td>${i.field}</td>
                <td><input type="text" class="cl-edit"
                  data-row="${i.rowNumber}" data-field="${i.field}"
                  value="${escapeHtml(i.value)}"></td>
                <td class="cl-reason-cell">${escapeHtml(i.reason)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Preview table
  const headers = data.preview.headers;
  const rows = data.preview.rows;
  previewEl.innerHTML = `
    <thead>
      <tr>
        <th>행</th>
        ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
        <th>변경</th>
      </tr>
    </thead>
    <tbody>
      ${rows.slice(0, 200).map(r => `
        <tr class="${r.diffs.length > 0 ? 'has-diff' : ''}">
          <td>${r.rowNumber}</td>
          ${r.cells.map(c => `<td>${escapeHtml(c)}</td>`).join('')}
          <td class="cl-diff-cell">${r.diffs.length > 0 ? r.diffs.map(d => `${d.field}: <s>${escapeHtml(d.before)}</s> → <b>${escapeHtml(d.after)}</b>`).join('<br>') : '-'}</td>
        </tr>
      `).join('')}
      ${rows.length > 200 ? `<tr><td colspan="${headers.length + 2}" class="cl-truncated">... ${rows.length - 200}건 더 (다운로드에는 모두 포함)</td></tr>` : ''}
    </tbody>
  `;
}

applyBtn.addEventListener('click', async () => {
  const inputs = issuesEl.querySelectorAll('.cl-edit');
  const edits = [];
  inputs.forEach(inp => {
    edits.push({
      rowNumber: Number(inp.dataset.row),
      field: inp.dataset.field,
      value: inp.value,
    });
  });
  applyBtn.disabled = true;
  applyBtn.textContent = '적용 중...';
  try {
    const res = await fetch('/api/cleansing/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edits }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showStatus(`${data.applied}건 수정 적용 완료. 다운로드에 반영됩니다.`, 'success');
  } catch (err) {
    showStatus('수정 적용 실패: ' + err.message, 'error');
  } finally {
    applyBtn.disabled = false;
    applyBtn.textContent = '수정 적용';
  }
});

downloadBtn.addEventListener('click', () => {
  window.location.href = '/api/cleansing/download';
});

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
