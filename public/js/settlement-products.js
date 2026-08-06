(function () {
  const API = '/api/settlement/products';
  let allRows = [];

  const loadingEl = document.getElementById('loading');
  const errorBox = document.getElementById('errorBox');
  const tableWrap = document.getElementById('tableWrap');
  const tableBody = document.getElementById('tableBody');
  const resultCount = document.getElementById('resultCount');
  const filterType = document.getElementById('filterType');
  const filterExcluded = document.getElementById('filterExcluded');
  const selectAll = document.getElementById('selectAll');

  const addBtn = document.getElementById('addBtn');
  const excludeBtn = document.getElementById('excludeBtn');
  const deleteAllBtn = document.getElementById('deleteAllBtn');
  const formModal = document.getElementById('formModal');
  const formModalClose = document.getElementById('formModalClose');
  const formModalTitle = document.getElementById('formModalTitle');
  const productForm = document.getElementById('productForm');
  const cancelBtn = document.getElementById('cancelBtn');
  const deleteBtn = document.getElementById('deleteBtn');

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtDate(iso) { return iso ? String(iso).slice(0, 10) : ''; }

  async function loadData() {
    loadingEl.style.display = 'block';
    tableWrap.style.display = 'none';
    errorBox.style.display = 'none';
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error((await res.json()).error || '조회 실패');
      allRows = await res.json();
      render();
    } catch (err) {
      errorBox.textContent = '데이터를 불러오지 못했습니다: ' + err.message;
      errorBox.style.display = 'block';
    } finally {
      loadingEl.style.display = 'none';
      tableWrap.style.display = 'block';
    }
  }

  function getFiltered() {
    return allRows.filter(r => {
      if (filterType.value && r.product_type !== filterType.value) return false;
      if (filterExcluded.value && String(r.settlement_excluded) !== filterExcluded.value) return false;
      return true;
    });
  }

  function render() {
    const rows = getFiltered();
    resultCount.textContent = `총 ${rows.length}개`;
    selectAll.checked = false;
    if (!rows.length) {
      tableBody.innerHTML = `<tr><td colspan="8"><div class="empty-state">등록된 상품이 없습니다.</div></td></tr>`;
      return;
    }
    tableBody.innerHTML = rows.map(r => `
      <tr>
        <td><input type="checkbox" class="row-check" data-id="${escapeHtml(r.product_id)}"></td>
        <td data-id="${escapeHtml(r.product_id)}" class="row-open">${escapeHtml(r.product_id)}</td>
        <td data-id="${escapeHtml(r.product_id)}" class="row-open">${escapeHtml(r.product_name)}</td>
        <td><span class="pill ${r.product_type === 'subscription' ? 'pill-blue' : 'pill-gray'}">${r.product_type === 'subscription' ? '구독' : '단건'}</span></td>
        <td>${fmtDate(r.start_date)} ~ ${fmtDate(r.end_date)}</td>
        <td>${(r.mapped_revenue_ids || []).length ? r.mapped_revenue_ids.length + '건' : '미연결'}</td>
        <td>${r.settlement_excluded ? '<span class="pill pill-red">제외</span>' : '<span class="pill pill-green">포함</span>'}</td>
        <td><button class="row-edit-btn" data-id="${escapeHtml(r.product_id)}">수정</button></td>
      </tr>
    `).join('');
  }

  function openForm(row) {
    productForm.reset();
    document.getElementById('f_orig_id').value = row?.product_id || '';
    document.getElementById('f_product_id').value = row?.product_id || '';
    document.getElementById('f_product_id').disabled = !!row;
    document.getElementById('f_product_name').value = row?.product_name || '';
    document.getElementById('f_product_type').value = row?.product_type || 'single';
    document.getElementById('f_start_date').value = fmtDate(row?.start_date);
    document.getElementById('f_end_date').value = fmtDate(row?.end_date);

    formModalTitle.textContent = row ? '상품 수정' : '상품 등록';
    deleteBtn.style.display = row ? 'inline-flex' : 'none';
    formModal.style.display = 'flex';
  }

  function closeForm() { formModal.style.display = 'none'; }

  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const origId = document.getElementById('f_orig_id').value;
    const body = {
      product_id: document.getElementById('f_product_id').value.trim(),
      product_name: document.getElementById('f_product_name').value.trim(),
      product_type: document.getElementById('f_product_type').value,
      start_date: document.getElementById('f_start_date').value,
      end_date: document.getElementById('f_end_date').value,
    };
    try {
      const res = await fetch(origId ? `${API}/${encodeURIComponent(origId)}` : API, {
        method: origId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || '저장 실패');
      closeForm();
      await loadData();
    } catch (err) {
      alert('저장 중 오류: ' + err.message);
    }
  });

  deleteBtn.addEventListener('click', async () => {
    const id = document.getElementById('f_orig_id').value;
    if (!id || !confirm('정말 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || '삭제 실패');
      closeForm();
      await loadData();
    } catch (err) {
      alert('삭제 중 오류: ' + err.message);
    }
  });

  excludeBtn.addEventListener('click', async () => {
    const ids = [...document.querySelectorAll('.row-check:checked')].map(el => el.dataset.id);
    if (!ids.length) { alert('상품을 선택해주세요.'); return; }
    try {
      const res = await fetch(`${API}/exclude`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: ids, excluded: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '처리 실패');
      await loadData();
    } catch (err) {
      alert('처리 중 오류: ' + err.message);
    }
  });

  deleteAllBtn.addEventListener('click', async () => {
    if (!confirm('전체 상품을 정말 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    try {
      const res = await fetch(API, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || '삭제 실패');
      await loadData();
    } catch (err) {
      alert('삭제 중 오류: ' + err.message);
    }
  });

  selectAll.addEventListener('change', () => {
    document.querySelectorAll('.row-check').forEach(el => { el.checked = selectAll.checked; });
  });

  addBtn.addEventListener('click', () => openForm(null));
  cancelBtn.addEventListener('click', closeForm);
  formModalClose.addEventListener('click', closeForm);
  formModal.addEventListener('click', (e) => { if (e.target === formModal) closeForm(); });

  tableBody.addEventListener('click', (e) => {
    if (e.target.closest('.row-check')) return;
    const cell = e.target.closest('.row-open') || e.target.closest('.row-edit-btn');
    if (!cell) return;
    const row = allRows.find(r => r.product_id === cell.dataset.id);
    if (row) openForm(row);
  });

  [filterType, filterExcluded].forEach(el => el.addEventListener('change', render));

  loadData();
})();
