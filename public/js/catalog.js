let allLectures = [];
let filtered = [];
let currentPage = 1;
const PAGE_SIZE = 20;

// Load data
async function loadCatalog() {
  try {
    const res = await fetch('/api/catalog');
    const data = await res.json();

    allLectures = data.lectures;
    filtered = allLectures;

    // Populate filters
    populateSelect('filterCategory', data.categories);
    populateSelect('filterSub', data.subCategories);
    populateSelect('filterLevel', data.levels);

    document.getElementById('loading').style.display = 'none';
    applyFilters();
  } catch (err) {
    document.getElementById('loading').textContent = '데이터를 불러오는 데 실패했습니다: ' + err.message;
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

// Filters
function applyFilters() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const category = document.getElementById('filterCategory').value;
  const sub = document.getElementById('filterSub').value;
  const level = document.getElementById('filterLevel').value;

  filtered = allLectures.filter(l => {
    if (category && l.category !== category) return false;
    if (sub && l.subCategory !== sub) return false;
    if (level && l.level !== level) return false;
    if (search) {
      const text = (l.name + ' ' + l.intro + ' ' + l.category + ' ' + l.subCategory).toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });

  currentPage = 1;
  render();
}

function render() {
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  document.getElementById('resultCount').textContent =
    `총 ${filtered.length}개 과정${filtered.length !== allLectures.length ? ` (전체 ${allLectures.length}개 중)` : ''}`;

  const list = document.getElementById('catalogList');
  list.innerHTML = pageItems.map((l, i) => {
    const levelClass = getLevelClass(l.level);
    return `
      <div class="catalog-card" onclick="showDetail(${start + i})">
        <div class="catalog-card-top">
          <div class="catalog-card-name">${l.name}</div>
          ${l.level ? `<span class="catalog-card-level ${levelClass}">${l.level}</span>` : ''}
        </div>
        <div class="catalog-card-tags">
          ${l.category ? `<span class="tag">${l.category}</span>` : ''}
          ${l.subCategory ? `<span class="tag">${l.subCategory}</span>` : ''}
        </div>
        <div class="catalog-card-intro">${l.intro || ''}</div>
      </div>
    `;
  }).join('');

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
  window.scrollTo({ top: 200, behavior: 'smooth' });
}

// Detail modal
function showDetail(index) {
  const l = filtered[index];
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');

  body.innerHTML = `
    <div class="modal-name">${l.name}</div>
    <div class="catalog-card-tags" style="margin-bottom:16px;">
      ${l.category ? `<span class="tag">${l.category}</span>` : ''}
      ${l.subCategory ? `<span class="tag">${l.subCategory}</span>` : ''}
      ${l.level ? `<span class="tag">${l.level}</span>` : ''}
    </div>
    ${l.intro ? `<div class="modal-section"><h4>과정소개</h4><p>${l.intro}</p></div>` : ''}
    ${l.url ? `<div class="modal-section modal-url"><h4>강의 링크</h4><a href="${l.url}" target="_blank">${l.url}</a></div>` : ''}
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

// Event listeners
let searchTimer;
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 300);
});
document.getElementById('filterCategory').addEventListener('change', applyFilters);
document.getElementById('filterSub').addEventListener('change', applyFilters);
document.getElementById('filterLevel').addEventListener('change', applyFilters);

// Init
loadCatalog();
