const status = document.getElementById('status');
const textarea = document.getElementById('lectureNames');
const counter = document.getElementById('lineCounter');
const resultsEl = document.getElementById('results');
const resultList = document.getElementById('resultList');
const resultCount = document.getElementById('resultCount');
const searchBtn = document.getElementById('searchBtn');
const downloadBtn = document.getElementById('downloadBtn');

let currentResults = [];

function showStatus(msg, type) {
  if (type === 'loading') {
    status.innerHTML = `<span class="spinner"></span><span>${msg}</span>`;
  } else {
    status.textContent = msg;
  }
  status.className = 'status ' + type;
}

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function countLines() {
  const n = textarea.value.split('\n').map(s => s.trim()).filter(Boolean).length;
  counter.textContent = `${n}개 강의`;
}

textarea.addEventListener('input', countLines);
countLines();

searchBtn.addEventListener('click', async () => {
  const names = textarea.value.trim();
  if (!names) {
    showStatus('강의명을 입력해주세요.', 'error');
    return;
  }

  searchBtn.disabled = true;
  searchBtn.textContent = 'AI 요약 중...';
  resultsEl.style.display = 'none';
  showStatus(`${names.split('\n').filter(Boolean).length}개 강의를 분석 중입니다. 강의당 약 2-3초 소요됩니다...`, 'loading');

  try {
    const res = await fetch('/api/lecture-info/by-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    currentResults = data.results;
    const notFoundMsg = data.notFound && data.notFound.length
      ? ` (찾지 못한 강의: ${data.notFound.join(', ')})`
      : '';
    showStatus(`${data.summarized}개 강의를 요약했습니다.${notFoundMsg}`, 'success');
    renderResults();
  } catch (err) {
    showStatus('오류: ' + err.message, 'error');
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'AI 요약';
  }
});

function renderResults() {
  resultCount.textContent = `(${currentResults.length}개)`;
  resultList.innerHTML = currentResults.map((r, i) => `
    <div class="li-result-card" data-idx="${i}">
      <div class="li-card-head">
        <div class="li-card-title">${escapeHtml(r.name)}</div>
        <button class="btn-retry" data-idx="${i}">다시 요약</button>
      </div>
      ${r.url ? `<a href="${r.url}" target="_blank" class="li-card-url">${escapeHtml(r.url)}</a>` : ''}
      <div class="li-card-body">
        <div class="li-field">
          <label>강의정보</label>
          <textarea data-field="info" data-idx="${i}" rows="2">${escapeHtml(r.info)}</textarea>
        </div>
        <div class="li-field">
          <label>학습 Point 1</label>
          <textarea data-field="point1" data-idx="${i}" rows="2">${escapeHtml(r.point1)}</textarea>
        </div>
        <div class="li-field">
          <label>학습 Point 2</label>
          <textarea data-field="point2" data-idx="${i}" rows="2">${escapeHtml(r.point2)}</textarea>
        </div>
        <div class="li-field">
          <label>학습 Point 3</label>
          <textarea data-field="point3" data-idx="${i}" rows="2">${escapeHtml(r.point3)}</textarea>
        </div>
      </div>
    </div>
  `).join('');
  resultsEl.style.display = 'block';

  resultList.querySelectorAll('textarea[data-field]').forEach(el => {
    el.addEventListener('input', () => {
      const idx = Number(el.dataset.idx);
      currentResults[idx][el.dataset.field] = el.value;
    });
  });

  resultList.querySelectorAll('.btn-retry').forEach(btn => {
    btn.addEventListener('click', () => retryOne(Number(btn.dataset.idx), btn));
  });
}

async function retryOne(idx, btn) {
  const name = currentResults[idx].name;
  btn.disabled = true;
  btn.textContent = '요약 중...';
  try {
    const res = await fetch('/api/lecture-info/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    currentResults[idx] = data.result;
    renderResults();
    showStatus(`"${name}" 재요약 완료`, 'success');
  } catch (err) {
    showStatus('재요약 실패: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '다시 요약';
  }
}

downloadBtn.addEventListener('click', async () => {
  if (!currentResults.length) return;
  downloadBtn.disabled = true;
  downloadBtn.textContent = '다운로드 중...';
  try {
    const res = await fetch('/api/lecture-info/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: currentResults }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '강의 정보 정리.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showStatus('다운로드 실패: ' + err.message, 'error');
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = '엑셀 다운로드';
  }
});
