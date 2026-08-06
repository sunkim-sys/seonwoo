(function () {
  const API = '/api/guide';
  let content = { categories: [], hotPicks: [] };
  let selected = null; // { type: 'category'|'article'|'hotpicks', catId, artId }
  let pendingUploadTarget = null; // 'category-image' | 'article-image' | 'editor-insert'

  const statusEl = document.getElementById('status');
  const categoryTreeEl = document.getElementById('categoryTree');
  const panelContainer = document.getElementById('panelContainer');
  const imageUploadInput = document.getElementById('imageUploadInput');
  const saveAllBtn = document.getElementById('saveAllBtn');
  const hotPicksNav = document.getElementById('hotPicksNav');
  const addCategoryBtn = document.getElementById('addCategoryBtn');

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + (type || '');
    statusEl.style.display = msg ? 'block' : 'none';
    if (msg && type !== 'error') setTimeout(() => { statusEl.style.display = 'none'; }, 2500);
  }

  function findCategory(catId) { return content.categories.find(c => c.id === catId); }
  function findArticle(catId, artId) {
    const cat = findCategory(catId);
    return cat ? cat.articles.find(a => a.id === artId) : null;
  }

  async function loadContent() {
    const res = await fetch(`${API}/content`);
    content = await res.json();
    renderTree();
  }

  // ---------------- 트리 렌더링 ----------------
  function renderTree() {
    categoryTreeEl.innerHTML = content.categories.map(cat => `
      <div class="ga-cat-item ${selected?.catId === cat.id ? 'open' : ''}" data-cat="${escapeHtml(cat.id)}">
        <div class="ga-cat-row ${selected?.type === 'category' && selected.catId === cat.id ? 'active' : ''}" data-cat="${escapeHtml(cat.id)}">
          <span class="ga-cat-toggle" data-toggle="${escapeHtml(cat.id)}">▶</span>
          <span class="ga-cat-title">${escapeHtml(cat.title)}</span>
          <span class="ga-row-controls">
            <button data-move="category" data-id="${escapeHtml(cat.id)}" data-dir="up" title="위로">↑</button>
            <button data-move="category" data-id="${escapeHtml(cat.id)}" data-dir="down" title="아래로">↓</button>
            <button data-delete="category" data-id="${escapeHtml(cat.id)}" title="삭제">×</button>
          </span>
        </div>
        <div class="ga-art-list">
          ${cat.articles.map(art => `
            <div class="ga-art-row ${selected?.type === 'article' && selected.artId === art.id ? 'active' : ''}" data-cat="${escapeHtml(cat.id)}" data-art="${escapeHtml(art.id)}">
              <span class="ga-art-title">${escapeHtml(art.title)}</span>
              <span class="ga-row-controls">
                <button data-move="article" data-id="${escapeHtml(art.id)}" data-dir="up" title="위로">↑</button>
                <button data-move="article" data-id="${escapeHtml(art.id)}" data-dir="down" title="아래로">↓</button>
                <button data-delete="article" data-id="${escapeHtml(art.id)}" title="삭제">×</button>
              </span>
            </div>
          `).join('')}
          <button class="ga-add-article-btn" data-add-article="${escapeHtml(cat.id)}">+ 아티클 추가</button>
        </div>
      </div>
    `).join('');
  }

  categoryTreeEl.addEventListener('click', async (e) => {
    const toggle = e.target.closest('[data-toggle]');
    const moveBtn = e.target.closest('[data-move]');
    const deleteBtn = e.target.closest('[data-delete]');
    const addArticleBtn = e.target.closest('[data-add-article]');
    const catRow = e.target.closest('.ga-cat-row');
    const artRow = e.target.closest('.ga-art-row');

    if (moveBtn) {
      const type = moveBtn.dataset.move;
      const id = moveBtn.dataset.id;
      const dir = moveBtn.dataset.dir;
      await fetch(`${API}/${type === 'category' ? 'categories' : 'articles'}/${id}/move`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction: dir }),
      });
      await loadContent();
      return;
    }
    if (deleteBtn) {
      const type = deleteBtn.dataset.delete;
      const id = deleteBtn.dataset.id;
      if (!confirm(type === 'category' ? '카테고리를 삭제하면 소속된 아티클도 모두 삭제됩니다. 계속할까요?' : '아티클을 삭제할까요?')) return;
      await fetch(`${API}/${type === 'category' ? 'categories' : 'articles'}/${id}`, { method: 'DELETE' });
      if (selected && ((type === 'category' && selected.catId === id) || (type === 'article' && selected.artId === id))) {
        selected = null;
        renderEmptyPanel();
      }
      await loadContent();
      return;
    }
    if (addArticleBtn) {
      const catId = addArticleBtn.dataset.addArticle;
      const res = await fetch(`${API}/categories/${catId}/articles`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '새 아티클' }),
      });
      const art = await res.json();
      await loadContent();
      selectArticle(catId, art.id);
      return;
    }
    if (toggle) {
      const item = toggle.closest('.ga-cat-item');
      item.classList.toggle('open');
      return;
    }
    if (artRow) { selectArticle(artRow.dataset.cat, artRow.dataset.art); return; }
    if (catRow) { selectCategory(catRow.dataset.cat); return; }
  });

  addCategoryBtn.addEventListener('click', async () => {
    const res = await fetch(`${API}/categories`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '새 카테고리' }),
    });
    const cat = await res.json();
    await loadContent();
    selectCategory(cat.id);
  });

  hotPicksNav.addEventListener('click', () => { selected = { type: 'hotpicks' }; renderTree(); renderHotPicksPanel(); });

  function renderEmptyPanel() {
    panelContainer.innerHTML = '<div class="ga-panel-empty">왼쪽에서 카테고리·아티클을 선택하거나 새로 추가해주세요.</div>';
  }

  // ---------------- 카테고리 편집 패널 ----------------
  function selectCategory(catId) {
    selected = { type: 'category', catId };
    renderTree();
    const cat = findCategory(catId);
    if (!cat) return renderEmptyPanel();

    panelContainer.innerHTML = `
      <div class="ga-panel-head">
        <div class="ga-breadcrumb">${escapeHtml(cat.id)}</div>
        <button class="btn btn-primary" id="saveCategoryBtn" style="padding:9px 16px;">이 카테고리 저장</button>
      </div>
      <div class="input-grid">
        <div class="input-group full-width"><label>제목</label><input type="text" id="catTitle" value="${escapeHtml(cat.title)}"></div>
        <div class="input-group full-width"><label>설명</label><input type="text" id="catDesc" value="${escapeHtml(cat.desc)}"></div>
        <div class="input-group full-width">
          <label>썸네일 이미지</label>
          <div style="display:flex; gap:8px;">
            <input type="text" id="catImage" value="${escapeHtml(cat.image)}" placeholder="이미지 URL" style="flex:1;">
            <button type="button" class="btn-small" id="catImageUploadBtn">파일 업로드</button>
          </div>
        </div>
      </div>
      <p class="rr-hint">아티클 ${cat.articles.length}개 · 왼쪽 목록에서 추가/삭제/순서 변경 가능</p>
    `;
    document.getElementById('saveCategoryBtn').addEventListener('click', () => saveCategory(catId));
    document.getElementById('catImageUploadBtn').addEventListener('click', () => {
      pendingUploadTarget = 'category-image';
      imageUploadInput.click();
    });
  }

  async function saveCategory(catId) {
    const body = {
      title: document.getElementById('catTitle').value.trim(),
      description: document.getElementById('catDesc').value.trim(),
      image: document.getElementById('catImage').value.trim(),
    };
    try {
      const res = await fetch(`${API}/categories/${catId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || '저장 실패');
      await loadContent();
      showStatus('카테고리가 저장되었습니다.', 'success');
    } catch (err) {
      showStatus('저장 중 오류: ' + err.message, 'error');
    }
  }

  // ---------------- 아티클 편집 패널 (리치텍스트 에디터 포함) ----------------
  function selectArticle(catId, artId) {
    selected = { type: 'article', catId, artId };
    renderTree();
    const art = findArticle(catId, artId);
    if (!art) return renderEmptyPanel();

    panelContainer.innerHTML = `
      <div class="ga-panel-head">
        <div class="ga-breadcrumb">${escapeHtml(catId)} / ${escapeHtml(artId)}</div>
        <button class="btn btn-primary" id="saveArticleBtn" style="padding:9px 16px;">이 아티클 저장</button>
      </div>
      <div class="input-grid">
        <div class="input-group full-width"><label>제목</label><input type="text" id="artTitle" value="${escapeHtml(art.title)}"></div>
        <div class="input-group full-width"><label>한 줄 설명</label><input type="text" id="artDesc" value="${escapeHtml(art.desc)}"></div>
        <div class="input-group full-width">
          <label>썸네일/커버 이미지</label>
          <div style="display:flex; gap:8px;">
            <input type="text" id="artImage" value="${escapeHtml(art.image)}" placeholder="이미지 URL" style="flex:1;">
            <button type="button" class="btn-small" id="artImageUploadBtn">파일 업로드</button>
          </div>
        </div>
      </div>

      <label style="display:block; font-size:13px; font-weight:600; margin:16px 0 8px; color:var(--text);">본문</label>
      <div class="ga-editor-toolbar" id="editorToolbar">
        <button type="button" data-cmd="bold" title="굵게"><b>B</b></button>
        <button type="button" data-cmd="italic" title="기울임"><i>I</i></button>
        <span class="ga-toolbar-sep"></span>
        <button type="button" data-cmd="h1" title="큰 제목">H1</button>
        <button type="button" data-cmd="h2" title="작은 제목">H2</button>
        <button type="button" data-cmd="p" title="본문">P</button>
        <span class="ga-toolbar-sep"></span>
        <button type="button" data-cmd="ul" title="글머리 기호">• 목록</button>
        <button type="button" data-cmd="ol" title="번호 매기기">1. 목록</button>
        <button type="button" data-cmd="hr" title="구분선">구분선</button>
        <span class="ga-toolbar-sep"></span>
        <button type="button" data-cmd="link" title="링크">🔗 링크</button>
        <button type="button" data-cmd="image" title="이미지 삽입">🖼️ 이미지</button>
        <span class="ga-toolbar-sep"></span>
        <select id="colorSelect" title="글자색">
          <option value="">글자색</option>
          <option value="txt-cobalt">파랑</option>
          <option value="txt-orange">주황</option>
          <option value="txt-gray">회색</option>
        </select>
        <select id="noticeSelect" title="알림박스">
          <option value="">알림박스</option>
          <option value="info">안내 (파랑)</option>
          <option value="success">완료 (초록)</option>
          <option value="warning">주의 (노랑)</option>
        </select>
        <span class="ga-toolbar-sep"></span>
        <button type="button" id="toggleSourceBtn" title="HTML 소스 직접 편집">HTML 소스</button>
      </div>
      <div class="ga-editor-body guide-body" id="editorBody" contenteditable="true">${art.body || ''}</div>
      <textarea class="ga-editor-source" id="editorSource" style="display:none;"></textarea>
    `;

    document.getElementById('saveArticleBtn').addEventListener('click', () => saveArticle(catId, artId));
    document.getElementById('artImageUploadBtn').addEventListener('click', () => {
      pendingUploadTarget = 'article-image';
      imageUploadInput.click();
    });
    setupEditorToolbar();
  }

  function setupEditorToolbar() {
    const editorBody = document.getElementById('editorBody');
    const editorSource = document.getElementById('editorSource');
    const toolbar = document.getElementById('editorToolbar');
    const colorSelect = document.getElementById('colorSelect');
    const noticeSelect = document.getElementById('noticeSelect');
    const toggleSourceBtn = document.getElementById('toggleSourceBtn');
    let sourceMode = false;

    function wrapSelectionHtml(buildFn) {
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) { alert('먼저 텍스트를 선택해주세요.'); return; }
      const text = sel.toString();
      document.execCommand('insertHTML', false, buildFn(escapeHtml(text)));
    }

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cmd]');
      if (!btn) return;
      editorBody.focus();
      const cmd = btn.dataset.cmd;

      if (cmd === 'bold') document.execCommand('bold');
      else if (cmd === 'italic') document.execCommand('italic');
      else if (cmd === 'ul') document.execCommand('insertUnorderedList');
      else if (cmd === 'ol') document.execCommand('insertOrderedList');
      else if (cmd === 'hr') document.execCommand('insertHTML', false, '<hr class="body-divider">');
      else if (cmd === 'h1' || cmd === 'h2' || cmd === 'p') {
        document.execCommand('formatBlock', false, cmd === 'p' ? 'p' : 'h3');
        if (cmd !== 'p') {
          const sel = window.getSelection();
          let node = sel.anchorNode;
          while (node && node.nodeName !== 'H3') node = node.parentNode;
          if (node) node.className = cmd === 'h1' ? 'h-lvl1' : 'h-lvl2';
        }
      } else if (cmd === 'link') {
        const url = prompt('링크 URL을 입력하세요:', 'https://');
        if (!url) return;
        wrapSelectionHtml(text => `<a href="${escapeHtml(url)}" class="link-default" target="_blank" rel="noopener">${text}</a>`);
      } else if (cmd === 'image') {
        pendingUploadTarget = 'editor-insert';
        imageUploadInput.click();
      }
    });

    colorSelect.addEventListener('change', () => {
      const cls = colorSelect.value;
      colorSelect.value = '';
      if (!cls) return;
      editorBody.focus();
      wrapSelectionHtml(text => `<span class="${cls}">${text}</span>`);
    });

    noticeSelect.addEventListener('change', () => {
      const type = noticeSelect.value;
      noticeSelect.value = '';
      if (!type) return;
      editorBody.focus();
      const sel = window.getSelection();
      const text = sel.rangeCount && !sel.isCollapsed ? sel.toString() : '안내 내용을 입력하세요';
      document.execCommand('insertHTML', false, `<div class="notice-box ${type}"><p>${escapeHtml(text)}</p></div><p><br></p>`);
    });

    toggleSourceBtn.addEventListener('click', () => {
      sourceMode = !sourceMode;
      if (sourceMode) {
        editorSource.value = editorBody.innerHTML;
        editorBody.style.display = 'none';
        editorSource.style.display = 'block';
        toggleSourceBtn.style.background = 'var(--border)';
      } else {
        editorBody.innerHTML = editorSource.value;
        editorBody.style.display = 'block';
        editorSource.style.display = 'none';
        toggleSourceBtn.style.background = 'transparent';

        // 소스 모드에서 돌아올 때 포커스/커서를 에디터 끝으로 복원 (안 하면 다음 입력이 엉뚱한 곳으로 감)
        editorBody.focus();
        const range = document.createRange();
        range.selectNodeContents(editorBody);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
  }

  function getEditorHtml() {
    const editorSource = document.getElementById('editorSource');
    const editorBody = document.getElementById('editorBody');
    return editorSource.style.display !== 'none' ? editorSource.value : editorBody.innerHTML;
  }

  async function saveArticle(catId, artId) {
    const body = {
      title: document.getElementById('artTitle').value.trim(),
      description: document.getElementById('artDesc').value.trim(),
      image: document.getElementById('artImage').value.trim(),
      body: getEditorHtml(),
    };
    try {
      const res = await fetch(`${API}/articles/${artId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || '저장 실패');
      await loadContent();
      showStatus('아티클이 저장되었습니다.', 'success');
    } catch (err) {
      showStatus('저장 중 오류: ' + err.message, 'error');
    }
  }

  // ---------------- HOT 픽 관리 패널 ----------------
  function renderHotPicksPanel() {
    const hotSet = new Set(content.hotPicks.map(p => `${p.cat}/${p.art}`));
    panelContainer.innerHTML = `
      <div class="ga-panel-head">
        <h3 style="font-size:15px; font-weight:700; margin:0;">🔥 HOT 픽 관리</h3>
        <button class="btn btn-primary" id="saveHotPicksBtn" style="padding:9px 16px;">저장</button>
      </div>
      ${content.categories.map(cat => `
        <div class="ga-hp-cat-title">${escapeHtml(cat.title)}</div>
        ${cat.articles.map(art => `
          <label class="ga-hp-item">
            <input type="checkbox" data-cat="${escapeHtml(cat.id)}" data-art="${escapeHtml(art.id)}" ${hotSet.has(`${cat.id}/${art.id}`) ? 'checked' : ''}>
            ${escapeHtml(art.title)}
          </label>
        `).join('') || '<p class="rr-hint">아티클이 없습니다.</p>'}
      `).join('') || '<p class="rr-hint">카테고리가 없습니다.</p>'}
    `;
    document.getElementById('saveHotPicksBtn').addEventListener('click', saveHotPicks);
  }

  async function saveHotPicks() {
    const picks = [...panelContainer.querySelectorAll('input[type="checkbox"]:checked')].map(el => ({
      category_id: el.dataset.cat, article_id: el.dataset.art,
    }));
    try {
      const res = await fetch(`${API}/hotpicks`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ picks }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '저장 실패');
      await loadContent();
      showStatus('HOT 픽이 저장되었습니다.', 'success');
    } catch (err) {
      showStatus('저장 중 오류: ' + err.message, 'error');
    }
  }

  // ---------------- 이미지 업로드 (공용) ----------------
  imageUploadInput.addEventListener('change', async () => {
    const file = imageUploadInput.files[0];
    imageUploadInput.value = '';
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API}/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '업로드 실패');

      if (pendingUploadTarget === 'category-image') {
        document.getElementById('catImage').value = data.path;
      } else if (pendingUploadTarget === 'article-image') {
        document.getElementById('artImage').value = data.path;
      } else if (pendingUploadTarget === 'editor-insert') {
        const editorBody = document.getElementById('editorBody');
        editorBody.focus();
        document.execCommand('insertHTML', false, `<img class="guide-img" src="${data.path}" alt="" loading="lazy">`);
      }
      showStatus('이미지가 업로드되었습니다.', 'success');
    } catch (err) {
      showStatus('업로드 중 오류: ' + err.message, 'error');
    } finally {
      pendingUploadTarget = null;
    }
  });

  // ---------------- 전체 저장 ----------------
  saveAllBtn.addEventListener('click', () => {
    if (!selected) { showStatus('저장할 항목이 없습니다.', 'error'); return; }
    if (selected.type === 'category') saveCategory(selected.catId);
    else if (selected.type === 'article') saveArticle(selected.catId, selected.artId);
    else if (selected.type === 'hotpicks') saveHotPicks();
  });

  loadContent();
})();
