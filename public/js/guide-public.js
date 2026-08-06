(function () {
  let content = { categories: [], hotPicks: [] };
  const sessionId = (() => {
    let sid = sessionStorage.getItem('sf_sid');
    if (!sid) { sid = Math.random().toString(36).slice(2); sessionStorage.setItem('sf_sid', sid); }
    return sid;
  })();

  const gpHome = document.getElementById('gpHome');
  const gpCategory = document.getElementById('gpCategory');
  const gpArticle = document.getElementById('gpArticle');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function findCategory(catId) { return content.categories.find(c => c.id === catId); }
  function findArticle(catId, artId) {
    const cat = findCategory(catId);
    return cat ? cat.articles.find(a => a.id === artId) : null;
  }

  function showView(view) {
    gpHome.style.display = view === 'home' ? 'block' : 'none';
    gpCategory.style.display = view === 'category' ? 'block' : 'none';
    gpArticle.style.display = view === 'article' ? 'block' : 'none';
  }

  function renderHome() {
    const hotGrid = document.getElementById('hotGrid');
    const hotSection = document.getElementById('hotSection');
    if (!content.hotPicks.length) {
      hotSection.style.display = 'none';
    } else {
      hotSection.style.display = 'block';
      hotGrid.innerHTML = content.hotPicks.map(pick => {
        const art = findArticle(pick.cat, pick.art);
        if (!art) return '';
        return `
          <div class="gp-hot-card" data-cat="${escapeHtml(pick.cat)}" data-art="${escapeHtml(pick.art)}">
            <img src="${escapeHtml(art.image)}" alt="" onerror="this.style.display='none'">
            <div class="gp-hot-title">${escapeHtml(art.title)}</div>
          </div>
        `;
      }).join('');
    }

    document.getElementById('catGrid').innerHTML = content.categories.map(c => `
      <div class="gp-cat-card" data-cat="${escapeHtml(c.id)}">
        <img src="${escapeHtml(c.image)}" alt="" onerror="this.style.display='none'">
        <div class="gp-cat-title">${escapeHtml(c.title)}</div>
        <div class="gp-cat-desc">${escapeHtml(c.desc)}</div>
      </div>
    `).join('');
  }

  function renderCategory(catId) {
    const cat = findCategory(catId);
    if (!cat) { location.hash = ''; return; }
    document.getElementById('catHeaderImg').src = cat.image || '';
    document.getElementById('catHeaderTitle').textContent = cat.title;
    document.getElementById('catHeaderDesc').textContent = cat.desc;
    document.getElementById('articleList').innerHTML = cat.articles.length
      ? cat.articles.map(a => `
        <div class="gp-article-row" data-cat="${escapeHtml(cat.id)}" data-art="${escapeHtml(a.id)}">
          <div class="gp-article-info">
            <div class="gp-article-title">${escapeHtml(a.title)}</div>
            <div class="gp-article-desc">${escapeHtml(a.desc)}</div>
          </div>
          <div class="gp-chevron">›</div>
        </div>
      `).join('')
      : '<div class="gp-empty">등록된 아티클이 없습니다.</div>';
    showView('category');
  }

  function renderArticle(catId, artId) {
    const cat = findCategory(catId);
    const art = cat && findArticle(catId, artId);
    if (!cat || !art) { location.hash = `#${catId || ''}`; return; }
    document.getElementById('backToCategoryLabel').textContent = cat.title;
    document.getElementById('articleBreadcrumb').textContent = `${cat.title} > ${art.title}`;
    document.getElementById('articleTitle').textContent = art.title;
    document.getElementById('articleBody').innerHTML = art.body || '';
    showView('article');

    fetch('/api/guide/track', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: catId, articleId: artId, sessionId }),
    }).catch(() => {});
  }

  function route() {
    const parts = location.hash.replace(/^#/, '').split('/').filter(Boolean);
    if (parts.length === 0) { showView('home'); renderHome(); }
    else if (parts.length === 1) { renderCategory(parts[0]); }
    else { renderArticle(parts[0], parts[1]); }
  }

  window.addEventListener('hashchange', route);

  document.getElementById('backToHome').addEventListener('click', () => { location.hash = ''; });
  document.getElementById('backToCategory').addEventListener('click', () => {
    const parts = location.hash.replace(/^#/, '').split('/').filter(Boolean);
    location.hash = parts[0] || '';
  });

  document.body.addEventListener('click', (e) => {
    const hotCard = e.target.closest('.gp-hot-card');
    const catCard = e.target.closest('.gp-cat-card');
    const artRow = e.target.closest('.gp-article-row');
    if (hotCard) location.hash = `#${hotCard.dataset.cat}/${hotCard.dataset.art}`;
    else if (catCard) location.hash = `#${catCard.dataset.cat}`;
    else if (artRow) location.hash = `#${artRow.dataset.cat}/${artRow.dataset.art}`;
  });

  // ---- 클라이언트 사이드 검색 ----
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { searchResults.classList.remove('show'); return; }
    const matches = [];
    for (const cat of content.categories) {
      for (const art of cat.articles) {
        if (art.title.toLowerCase().includes(q) || (art.body || '').toLowerCase().includes(q)) {
          matches.push({ cat, art });
          if (matches.length >= 10) break;
        }
      }
      if (matches.length >= 10) break;
    }
    searchResults.innerHTML = matches.length
      ? matches.map(({ cat, art }) => `
        <div class="gp-search-result-item" data-cat="${escapeHtml(cat.id)}" data-art="${escapeHtml(art.id)}">
          <div>
            <div class="gp-search-result-title">${escapeHtml(art.title)}</div>
            <div class="gp-search-result-cat">${escapeHtml(cat.title)}</div>
          </div>
        </div>
      `).join('')
      : '<div class="gp-search-result-item">검색 결과가 없습니다.</div>';
    searchResults.classList.add('show');
  });
  searchResults.addEventListener('click', (e) => {
    const item = e.target.closest('.gp-search-result-item[data-art]');
    if (!item) return;
    location.hash = `#${item.dataset.cat}/${item.dataset.art}`;
    searchInput.value = '';
    searchResults.classList.remove('show');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.gp-search-wrap')) searchResults.classList.remove('show');
  });

  async function init() {
    try {
      const res = await fetch('/api/guide/content');
      content = await res.json();
    } catch {
      content = { categories: [], hotPicks: [] };
    }
    route();
  }
  init();
})();
