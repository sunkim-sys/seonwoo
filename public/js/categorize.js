const lectureInput = document.getElementById('lectureInput');
const classifyBtn = document.getElementById('classifyBtn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const resultListEl = document.getElementById('resultList');
const resultCountEl = document.getElementById('resultCount');
const downloadBtn = document.getElementById('downloadBtn');
const lcCounter = document.getElementById('lcCounter');

let categoryTree = {};
let lastResults = [];

function parseInput(text) {
  // Split by blank line; each block can have "강의명:" / "소개:" labels
  // OR if no labels, treat each non-empty line as a name-only entry.
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const lectures = [];
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    let name = '';
    let intro = '';
    let labeled = false;
    for (const line of lines) {
      const nameMatch = line.match(/^(강의명|이름|name)\s*[:：]\s*(.+)$/i);
      const introMatch = line.match(/^(소개|설명|intro|description)\s*[:：]\s*(.+)$/i);
      if (nameMatch) { name = nameMatch[2].trim(); labeled = true; }
      else if (introMatch) { intro = introMatch[2].trim(); labeled = true; }
      else if (!labeled) {
        // Unlabeled lines: each becomes its own lecture (name only)
        lectures.push({ name: line, intro: '' });
      } else {
        // Labeled block, additional lines extend intro
        intro += (intro ? ' ' : '') + line;
      }
    }
    if (labeled && name) lectures.push({ name, intro });
  }
  return lectures;
}

function updateCounter() {
  const lectures = parseInput(lectureInput.value);
  lcCounter.textContent = `${lectures.length}개 강의`;
}

lectureInput.addEventListener('input', updateCounter);

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + (type || '');
  statusEl.style.display = 'block';
}

async function loadTree() {
  try {
    const res = await fetch('/api/categorize/tree');
    const data = await res.json();
    categoryTree = data.tree || {};
  } catch (err) {
    console.error(err);
  }
}
loadTree();

classifyBtn.addEventListener('click', async () => {
  const lectures = parseInput(lectureInput.value);
  if (lectures.length === 0) {
    showStatus('강의를 입력해주세요.', 'error');
    return;
  }
  if (lectures.length > 50) {
    showStatus('한 번에 최대 50개까지 분류할 수 있습니다.', 'error');
    return;
  }

  classifyBtn.disabled = true;
  classifyBtn.innerHTML = '<span class="spinner"></span> 분류 중...';
  showStatus(`${lectures.length}개 강의를 AI에 분류 요청 중입니다...`, 'info');

  try {
    const res = await fetch('/api/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lectures }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(text.slice(0, 200)); }
    if (!res.ok) throw new Error(data.error || '분류 실패');

    lastResults = data.results || [];
    renderResults(lastResults);
    showStatus(`${lastResults.length}개 강의 분류 완료`, 'success');
  } catch (err) {
    showStatus('오류: ' + err.message, 'error');
  } finally {
    classifyBtn.disabled = false;
    classifyBtn.textContent = 'AI 분류';
  }
});

function renderResults(results) {
  if (!results.length) {
    resultsEl.style.display = 'none';
    return;
  }
  resultsEl.style.display = 'block';
  resultCountEl.textContent = `(${results.length}건)`;

  resultListEl.innerHTML = results.map((r, idx) => {
    const cats = Object.keys(categoryTree);
    const subs = categoryTree[r.category] || [];
    const conf = Math.round((r.confidence || 0) * 100);
    const confClass = conf >= 80 ? 'high' : (conf >= 50 ? 'mid' : 'low');
    const validBadge = r.valid ? '' : '<span class="cz-warn-badge">검증 실패</span>';

    return `
      <div class="cz-card" data-idx="${idx}">
        <div class="cz-card-head">
          <div class="cz-name">${escapeHtml(r.name)}</div>
          <div class="cz-conf ${confClass}" title="신뢰도">${conf}%</div>
        </div>
        ${r.intro ? `<div class="cz-intro">${escapeHtml(r.intro)}</div>` : ''}
        <div class="cz-grid">
          <div>
            <label>대분류</label>
            <select class="cz-cat" data-idx="${idx}">
              ${cats.map(c => `<option value="${c}" ${c === r.category ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>서브카테고리</label>
            <select class="cz-sub" data-idx="${idx}">
              ${subs.map(s => `<option value="${s}" ${s === r.subCategory ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        ${r.reason ? `<div class="cz-reason">💡 ${escapeHtml(r.reason)}</div>` : ''}
        ${validBadge}
      </div>
    `;
  }).join('');

  resultListEl.querySelectorAll('.cz-cat').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = Number(sel.dataset.idx);
      lastResults[idx].category = sel.value;
      const subs = categoryTree[sel.value] || [];
      lastResults[idx].subCategory = subs[0] || '';
      lastResults[idx].valid = true;
      renderResults(lastResults);
    });
  });
  resultListEl.querySelectorAll('.cz-sub').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = Number(sel.dataset.idx);
      lastResults[idx].subCategory = sel.value;
    });
  });
}

downloadBtn.addEventListener('click', () => {
  if (!lastResults.length) return;
  const aoa = [['강의명', '대분류', '서브카테고리', '신뢰도(%)', '근거', '소개']];
  lastResults.forEach(r => {
    aoa.push([
      r.name,
      r.category,
      r.subCategory,
      Math.round((r.confidence || 0) * 100),
      r.reason || '',
      r.intro || '',
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 36 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 40 }, { wch: 50 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '카테고리 분류');
  const filename = `카테고리분류_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
});

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

updateCounter();
