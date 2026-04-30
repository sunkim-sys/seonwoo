let allLectures = [];
let filtered = [];
let currentPage = 1;
const PAGE_SIZE = 20;

const FAV_KEY = 'wt-catalog-favorites';
let favorites = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]'));
let showFavOnly = false;

// Compare state (max 2)
let compareItems = [];

function saveFavorites() {
  localStorage.setItem(FAV_KEY, JSON.stringify([...favorites]));
}

function lectureId(l) {
  return (l.name || '') + '::' + (l.category || '');
}

async function fetchCatalog(attempt = 1, maxAttempts = 3) {
  const loadingEl = document.getElementById('loading');
  const hint = attempt > 1 ? ` (재시도 ${attempt}/${maxAttempts})` : '';
  loadingEl.textContent = `데이터를 불러오고 있습니다...${hint}`;

  const res = await fetch('/api/catalog');
  const raw = await res.text();
  try {
    const data = JSON.parse(raw);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (e instanceof SyntaxError) {
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
        return fetchCatalog(attempt + 1, maxAttempts);
      }
      throw new Error(`서버가 JSON을 반환하지 않았습니다 (HTTP ${res.status}). Render 서버가 시작 중이거나 장애 상태일 수 있어요. 잠시 후 새로고침해주세요.`);
    }
    throw e;
  }
}

async function loadCatalog() {
  try {
    const data = await fetchCatalog();

    allLectures = data.lectures;
    filtered = allLectures;

    populateSelect('filterCategory', data.categories);
    populateSelect('filterSub', data.subCategories);
    populateSelect('filterLevel', data.levels);

    document.getElementById('loading').style.display = 'none';

    restoreFromUrl();
    applyFilters();
  } catch (err) {
    document.getElementById('loading').innerHTML = `
      데이터를 불러오는 데 실패했습니다.<br>
      <span style="font-size:12px;color:var(--text-muted);">${err.message}</span><br>
      <button onclick="location.reload()" style="margin-top:12px;padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-family:inherit;">다시 시도</button>`;
  }
}

function populateSelect(id, options) {
  const select = document.getElementById(id);
  options.forEach(opt => {
    const el = document.createElement('option');
    el.value = opt;
    el.textContent = opt;
    select.appendChild(el);
  });
}

function restoreFromUrl() {
  const params = new URLSearchParams(location.search);
  if (params.get('q')) document.getElementById('searchInput').value = params.get('q');
  if (params.get('cat')) document.getElementById('filterCategory').value = params.get('cat');
  if (params.get('sub')) document.getElementById('filterSub').value = params.get('sub');
  if (params.get('level')) document.getElementById('filterLevel').value = params.get('level');
  if (params.get('sort')) document.getElementById('sortBy').value = params.get('sort');
  if (params.get('favOnly') === '1') { showFavOnly = true; }
  if (params.get('page')) currentPage = parseInt(params.get('page')) || 1;
  updateFavBtn();
}

function syncUrl() {
  const params = new URLSearchParams();
  const q = document.getElementById('searchInput').value;
  const cat = document.getElementById('filterCategory').value;
  const sub = document.getElementById('filterSub').value;
  const level = document.getElementById('filterLevel').value;
  const sort = document.getElementById('sortBy').value;
  if (q) params.set('q', q);
  if (cat) params.set('cat', cat);
  if (sub) params.set('sub', sub);
  if (level) params.set('level', level);
  if (sort && sort !== 'default') params.set('sort', sort);
  if (showFavOnly) params.set('favOnly', '1');
  if (currentPage > 1) params.set('page', String(currentPage));
  const qs = params.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

function applyFilters() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const category = document.getElementById('filterCategory').value;
  const sub = document.getElementById('filterSub').value;
  const level = document.getElementById('filterLevel').value;
  const sort = document.getElementById('sortBy').value;

  filtered = allLectures.filter(l => {
    if (category && l.category !== category) return false;
    if (sub && l.subCategory !== sub) return false;
    if (level && l.level !== level) return false;
    if (showFavOnly && !favorites.has(lectureId(l))) return false;
    if (search) {
      const text = (l.name + ' ' + l.intro + ' ' + l.category + ' ' + l.subCategory).toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });

  const levelOrder = { '초급': 1, '중급': 2, '고급': 3 };
  if (sort === 'name-asc') filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
  else if (sort === 'name-desc') filtered.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'ko'));
  else if (sort === 'level') filtered.sort((a, b) => (levelOrder[a.level] || 99) - (levelOrder[b.level] || 99));
  else if (sort === 'category') filtered.sort((a, b) => (a.category || '').localeCompare(b.category || '', 'ko'));

  if (currentPage > Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))) currentPage = 1;
  updateResetBtn();
  render();
  syncUrl();
}

function updateResetBtn() {
  const btn = document.getElementById('filterResetBtn');
  if (!btn) return;
  const q = document.getElementById('searchInput').value;
  const cat = document.getElementById('filterCategory').value;
  const sub = document.getElementById('filterSub').value;
  const level = document.getElementById('filterLevel').value;
  const sort = document.getElementById('sortBy').value;
  const hasFilter = q || cat || sub || level || (sort && sort !== 'default') || showFavOnly;
  btn.style.display = hasFilter ? 'inline-flex' : 'none';
}

function highlight(text, keyword) {
  if (!keyword) return escapeHtml(text);
  const safe = escapeHtml(text);
  const re = new RegExp(escapeRegex(keyword), 'gi');
  return safe.replace(re, m => `<mark>${m}</mark>`);
}

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function render() {
  const search = document.getElementById('searchInput').value;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  document.getElementById('resultCount').textContent =
    `총 ${filtered.length}개 과정${filtered.length !== allLectures.length ? ` (전체 ${allLectures.length}개 중)` : ''}`;

  const list = document.getElementById('catalogList');
  list.innerHTML = pageItems.map((l, i) => {
    const levelClass = getLevelClass(l.level);
    const id = lectureId(l);
    const isFav = favorites.has(id);
    const isCompare = compareItems.some(c => lectureId(c) === id);
    return `
      <div class="catalog-card ${isCompare ? 'compare-selected' : ''}" data-idx="${start + i}">
        <button class="fav-btn ${isFav ? 'on' : ''}" data-id="${escapeHtml(id)}" title="즐겨찾기">${isFav ? '★' : '☆'}</button>
        <button class="compare-btn ${isCompare ? 'on' : ''}" data-idx="${start + i}" title="비교 선택">${isCompare ? '✓ 비교중' : '비교'}</button>
        <div class="catalog-card-top">
          <div class="catalog-card-name">${highlight(l.name, search)}</div>
          ${l.level ? `<span class="catalog-card-level ${levelClass}">${l.level}</span>` : ''}
        </div>
        <div class="catalog-card-tags">
          ${l.category ? `<span class="tag">${highlight(l.category, search)}</span>` : ''}
          ${l.subCategory ? `<span class="tag">${highlight(l.subCategory, search)}</span>` : ''}
        </div>
        <div class="catalog-card-intro">${highlight(l.intro || '', search)}</div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (favorites.has(id)) favorites.delete(id);
      else favorites.add(id);
      saveFavorites();
      updateFavBtn();
      applyFilters();
    });
  });

  list.querySelectorAll('.compare-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const lecture = filtered[Number(btn.dataset.idx)];
      toggleCompare(lecture);
    });
  });

  list.querySelectorAll('.catalog-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.fav-btn') || e.target.closest('.compare-btn')) return;
      showDetail(Number(card.dataset.idx));
    });
  });

  renderPagination();
}

function getLevelClass(level) {
  if (!level) return 'level-default';
  if (level.includes('초급') && !level.includes('중급') && !level.includes('고급')) return 'level-beginner';
  if (level.includes('고급')) return 'level-advanced';
  return 'level-intermediate';
}

function renderPagination() {
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pag = document.getElementById('pagination');

  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  let html = '';
  const maxVisible = 7;
  let startPage = Math.max(1, currentPage - 3);
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

  if (currentPage > 1) {
    html += `<button class="page-btn" onclick="goPage(${currentPage - 1})">이전</button>`;
  }
  if (startPage > 1) {
    html += `<button class="page-btn" onclick="goPage(1)">1</button>`;
    if (startPage > 2) html += `<span style="padding:8px 4px;color:#94a3b8;">...</span>`;
  }
  for (let p = startPage; p <= endPage; p++) {
    html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`;
  }
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<span style="padding:8px 4px;color:#94a3b8;">...</span>`;
    html += `<button class="page-btn" onclick="goPage(${totalPages})">${totalPages}</button>`;
  }
  if (currentPage < totalPages) {
    html += `<button class="page-btn" onclick="goPage(${currentPage + 1})">다음</button>`;
  }

  pag.innerHTML = html;
}

function goPage(p) {
  currentPage = p;
  render();
  syncUrl();
  window.scrollTo({ top: 200, behavior: 'smooth' });
}

function showDetail(index) {
  const l = filtered[index];
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');

  body.innerHTML = `
    <div class="modal-name">${escapeHtml(l.name)}</div>
    <div class="catalog-card-tags" style="margin-bottom:16px;">
      ${l.category ? `<span class="tag">${escapeHtml(l.category)}</span>` : ''}
      ${l.subCategory ? `<span class="tag">${escapeHtml(l.subCategory)}</span>` : ''}
      ${l.level ? `<span class="tag">${escapeHtml(l.level)}</span>` : ''}
    </div>
    ${l.intro ? `<div class="modal-section"><h4>과정소개</h4><p>${escapeHtml(l.intro)}</p></div>` : ''}
    ${l.url ? `<div class="modal-section modal-url"><h4>강의 링크</h4><a href="${l.url}" target="_blank">${escapeHtml(l.url)}</a></div>` : ''}
  `;

  modal.style.display = 'flex';
}

document.getElementById('modalClose').addEventListener('click', () => {
  document.getElementById('modal').style.display = 'none';
});

document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById('modal').style.display = 'none';
  }
});

function updateFavBtn() {
  const btn = document.getElementById('favBtn');
  btn.classList.toggle('active', showFavOnly);
  btn.textContent = showFavOnly ? `★ 즐겨찾기만 (${favorites.size})` : `⭐ 즐겨찾기만 보기 (${favorites.size})`;
}

document.getElementById('favBtn').addEventListener('click', () => {
  showFavOnly = !showFavOnly;
  updateFavBtn();
  applyFilters();
});

document.getElementById('exportFavBtn').addEventListener('click', async () => {
  if (!favorites.size) {
    alert('즐겨찾기한 과정이 없습니다.');
    return;
  }
  const btn = document.getElementById('exportFavBtn');
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = '생성 중...';
  try {
    const res = await fetch('/api/catalog/export-favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...favorites] }),
    });
    if (!res.ok) {
      const raw = await res.text();
      let msg = raw;
      try { msg = JSON.parse(raw).error || raw; } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `과정_즐겨찾기_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('내보내기 실패: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
});

// URL 복사
document.getElementById('shareUrlBtn').addEventListener('click', () => {
  const url = location.href;
  const btn = document.getElementById('shareUrlBtn');
  const orig = btn.textContent;
  navigator.clipboard.writeText(url).then(() => {
    btn.textContent = '✓ 복사됨!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
  }).catch(() => {
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      btn.textContent = '✓ 복사됨!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    } catch {
      alert('URL: ' + url);
    }
  });
});

// 필터 초기화
document.getElementById('filterResetBtn').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterCategory').value = '';
  document.getElementById('filterSub').value = '';
  document.getElementById('filterLevel').value = '';
  document.getElementById('sortBy').value = 'default';
  showFavOnly = false;
  currentPage = 1;
  updateFavBtn();
  applyFilters();
});

// Compare 로직
function toggleCompare(lecture) {
  const id = lectureId(lecture);
  const idx = compareItems.findIndex(c => lectureId(c) === id);
  if (idx >= 0) {
    compareItems.splice(idx, 1);
  } else {
    if (compareItems.length >= 2) {
      // Replace the first item with a quick visual feedback
      compareItems.shift();
      compareItems.push(lecture);
    } else {
      compareItems.push(lecture);
    }
  }
  render();
  updateCompareBar();
}

function updateCompareBar() {
  const bar = document.getElementById('compareBar');
  const countEl = document.getElementById('compareCount');
  const doBtn = document.getElementById('doCompareBtn');
  if (compareItems.length === 0) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  const names = compareItems.map(l => `"${l.name.slice(0, 12)}${l.name.length > 12 ? '…' : ''}"`).join(', ');
  countEl.textContent = `${compareItems.length}개 선택: ${names}`;
  doBtn.disabled = compareItems.length < 2;
}

function showCompareModal() {
  if (compareItems.length < 2) return;
  const modal = document.getElementById('compareModal');
  const body = document.getElementById('compareBody');

  function buildCol(l) {
    const levelClass = getLevelClass(l.level);
    return `
      <div class="compare-col">
        <div class="compare-col-name">${escapeHtml(l.name)}</div>
        <div class="compare-col-tags">
          ${l.category ? `<span class="tag">${escapeHtml(l.category)}</span>` : ''}
          ${l.subCategory ? `<span class="tag">${escapeHtml(l.subCategory)}</span>` : ''}
          ${l.level ? `<span class="catalog-card-level ${levelClass}" style="font-size:11px;padding:2px 8px;">${escapeHtml(l.level)}</span>` : ''}
        </div>
        ${l.intro ? `<div class="compare-col-intro">${escapeHtml(l.intro)}</div>` : '<div class="compare-col-intro" style="color:var(--text-muted);">소개 없음</div>'}
        ${l.url ? `<a class="compare-col-link" href="${escapeHtml(l.url)}" target="_blank">강의 링크 →</a>` : ''}
      </div>
    `;
  }

  body.innerHTML = compareItems.map(buildCol).join('<div class="compare-divider"></div>');
  modal.style.display = 'flex';
}

document.getElementById('doCompareBtn').addEventListener('click', showCompareModal);

document.getElementById('clearCompareBtn').addEventListener('click', () => {
  compareItems = [];
  updateCompareBar();
  render();
});

document.getElementById('compareModalClose').addEventListener('click', () => {
  document.getElementById('compareModal').style.display = 'none';
});

document.getElementById('compareModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById('compareModal').style.display = 'none';
  }
});

let searchTimer;
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchTimer);
  currentPage = 1;
  searchTimer = setTimeout(applyFilters, 300);
});
['filterCategory', 'filterSub', 'filterLevel', 'sortBy'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    currentPage = 1;
    applyFilters();
  });
});

loadCatalog();
