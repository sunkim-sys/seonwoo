const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const fileName = document.getElementById('fileName');
const status = document.getElementById('status');
const results = document.getElementById('results');
const sheetList = document.getElementById('sheetList');
const validation = document.getElementById('validation');

let selectedFile = null;

// Click to select file
uploadArea.addEventListener('click', () => fileInput.click());

// File selected
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) {
    selectFile(e.target.files[0]);
  }
});

// Drag & drop
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    selectFile(e.dataTransfer.files[0]);
  }
});

function selectFile(file) {
  if (!file.name.match(/\.xlsx?$/i)) {
    showStatus('엑셀 파일(.xlsx)만 업로드할 수 있습니다.', 'error');
    return;
  }
  selectedFile = file;
  fileName.textContent = file.name;
  uploadBtn.disabled = false;
  status.style.display = 'none';
  results.classList.remove('show');
  validation.innerHTML = '';
}

// Upload
uploadBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  uploadBtn.disabled = true;
  uploadBtn.textContent = '변환 중...';
  status.style.display = 'none';

  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('productId', document.getElementById('productId').value);
  formData.append('courseId', document.getElementById('courseId').value);
  formData.append('startDate', document.getElementById('startDate').value);
  formData.append('endDate', document.getElementById('endDate').value);

  try {
    console.log('Uploading file:', selectedFile.name, selectedFile.size, 'bytes');
    const res = await fetch('/api/ipgwa/upload', {
      method: 'POST',
      body: formData,
    });
    console.log('Response status:', res.status);
    const text = await res.text();
    console.log('Response body:', text);
    const data = JSON.parse(text);

    if (!res.ok) throw new Error(data.error);

    const fieldLabels = {
      name: '이름', email: '이메일', phone: '휴대폰', dept: '부서',
      rank: '직급', job: '직무', product: '상품명', empId: '사번',
    };
    const mapped = (data.mappedFields || []).map(f => fieldLabels[f] || f).join(', ');
    const extraMsg = mapped ? ` (인식된 컬럼: ${mapped})` : '';
    showStatus(`${data.rowCount}건의 데이터를 변환했습니다.${extraMsg}`, 'success');
    renderValidation(data.issues || []);
    renderSheets(data.sheets);
  } catch (err) {
    console.error('Upload error:', err);
    showStatus(err.message || '알 수 없는 오류가 발생했습니다.', 'error');
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = '업로드 및 변환';
  }
});

function renderValidation(issues) {
  if (!issues.length) {
    validation.innerHTML = `
      <div class="validation-box ok">
        <div class="validation-title">✓ 이메일·휴대폰 형식 이상 없음</div>
      </div>`;
    return;
  }
  const rows = issues.map((i, idx) => `
    <tr data-issue-idx="${idx}">
      <td class="v-row">${i.rowNumber}행</td>
      <td class="v-name">${escapeHtml(i.name)}</td>
      <td class="v-field">${i.field}</td>
      <td class="v-value">
        <input type="text"
          class="v-input"
          data-row-number="${i.rowNumber}"
          data-field="${i.field}"
          data-original="${escapeHtml(i.value)}"
          value="${escapeHtml(i.value)}"
          placeholder="${i.field === '이메일' ? 'name@example.com' : '010-1234-5678'}">
      </td>
      <td class="v-reason">${escapeHtml(i.reason)}</td>
    </tr>
  `).join('');
  validation.innerHTML = `
    <div class="validation-box warn">
      <div class="validation-title">⚠ 확인이 필요한 항목 ${issues.length}건</div>
      <div class="validation-hint">값을 직접 고친 뒤 <b>수정 적용</b>을 누르면 결과 파일과 원본(수정본) 모두 반영됩니다.</div>
      <div class="validation-table-wrap">
        <table class="validation-table">
          <thead><tr><th>행</th><th>이름</th><th>항목</th><th>수정할 값</th><th>문제</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="validation-actions">
        <button id="applyFixBtn" class="btn btn-primary">수정 적용</button>
      </div>
    </div>`;

  document.getElementById('applyFixBtn').addEventListener('click', applyFixes);
}

async function applyFixes() {
  const inputs = [...document.querySelectorAll('.v-input')];
  const corrections = inputs
    .filter(inp => inp.value !== inp.dataset.original)
    .map(inp => ({
      rowNumber: Number(inp.dataset.rowNumber),
      field: inp.dataset.field,
      value: inp.value.trim(),
    }));

  if (!corrections.length) {
    showStatus('변경된 값이 없습니다.', 'error');
    return;
  }

  const btn = document.getElementById('applyFixBtn');
  btn.disabled = true;
  btn.textContent = '적용 중...';
  try {
    const res = await fetch('/api/ipgwa/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ corrections }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showStatus(`${data.applied}건을 수정했습니다. 원본과 변환 결과 모두 반영되었습니다.`, 'success');
    renderValidation(data.issues || []);

    // Refresh any open previews
    document.querySelectorAll('.preview-body.open').forEach(body => {
      const card = body.closest('.sheet-card');
      const sheetId = card.dataset.sheetId;
      body.classList.remove('open');
      body.innerHTML = '';
      const pbtn = card.querySelector('.btn-preview');
      pbtn.textContent = '미리보기';
      togglePreview(sheetId, pbtn);
    });
  } catch (err) {
    showStatus(err.message || '수정 적용에 실패했습니다.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '수정 적용';
  }
}

function showStatus(msg, type) {
  if (type === 'loading') {
    status.innerHTML = `<span class="spinner"></span><span>${msg}</span>`;
  } else {
    status.textContent = msg;
  }
  status.className = 'status ' + type;
}

function renderSheets(sheets) {
  sheetList.innerHTML = sheets.map(s => `
    <div class="sheet-card" data-sheet-id="${s.id}">
      <div class="sheet-card-head">
        <div>
          <div class="sheet-name">${s.name}</div>
          <div class="sheet-rows">${s.rowCount}건</div>
        </div>
        <div class="sheet-actions">
          <button class="btn-preview" data-id="${s.id}">미리보기</button>
          <a href="/api/ipgwa/download/${s.id}" class="btn-download">다운로드</a>
        </div>
      </div>
      <div class="preview-body" id="preview-${s.id}"></div>
    </div>
  `).join('');
  results.classList.add('show');

  sheetList.querySelectorAll('.btn-preview').forEach(btn => {
    btn.addEventListener('click', () => togglePreview(btn.dataset.id, btn));
  });
}

async function togglePreview(sheetId, btn) {
  const body = document.getElementById('preview-' + sheetId);
  if (body.classList.contains('open')) {
    body.classList.remove('open');
    body.innerHTML = '';
    btn.textContent = '미리보기';
    return;
  }

  btn.disabled = true;
  btn.textContent = '불러오는 중...';
  try {
    const res = await fetch('/api/ipgwa/preview/' + sheetId);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    body.innerHTML = renderPreviewTable(data.headers, data.rows);
    body.classList.add('open');
    btn.textContent = '접기';
  } catch (err) {
    body.innerHTML = `<div class="preview-error">${err.message}</div>`;
    body.classList.add('open');
    btn.textContent = '접기';
  } finally {
    btn.disabled = false;
  }
}

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPreviewTable(headers, rows) {
  const MAX = 20;
  const shown = rows.slice(0, MAX);
  const more = rows.length - shown.length;

  const thead = `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${shown.map(r =>
    `<tr>${headers.map((_, i) => `<td>${escapeHtml(r[i])}</td>`).join('')}</tr>`
  ).join('')}</tbody>`;

  const footer = more > 0
    ? `<div class="preview-footer">+ ${more}건 더 있습니다. 전체 데이터는 다운로드로 확인하세요.</div>`
    : (rows.length === 0 ? `<div class="preview-footer">데이터가 없습니다.</div>` : '');

  return `<div class="preview-table-wrap"><table class="preview-table">${thead}${tbody}</table></div>${footer}`;
}
