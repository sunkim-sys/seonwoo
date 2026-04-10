const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const fileName = document.getElementById('fileName');
const status = document.getElementById('status');
const results = document.getElementById('results');
const sheetList = document.getElementById('sheetList');

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
  formData.append('contactEmail', document.getElementById('contactEmail').value);
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

    showStatus(`${data.rowCount}건의 데이터를 변환했습니다.`, 'success');
    renderSheets(data.sheets);
  } catch (err) {
    console.error('Upload error:', err);
    showStatus(err.message || '알 수 없는 오류가 발생했습니다.', 'error');
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = '업로드 및 변환';
  }
});

function showStatus(msg, type) {
  status.textContent = msg;
  status.className = 'status ' + type;
}

function renderSheets(sheets) {
  sheetList.innerHTML = sheets.map(s => `
    <div class="sheet-card">
      <div>
        <div class="sheet-name">${s.name}</div>
        <div class="sheet-rows">${s.rowCount}건</div>
      </div>
      <a href="/api/ipgwa/download/${s.id}" class="btn-download">다운로드</a>
    </div>
  `).join('');
  results.classList.add('show');
}
