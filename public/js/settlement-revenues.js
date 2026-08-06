(function () {
  const API = '/api/settlement/revenues';
  const PRODUCTS_API = '/api/settlement/products';
  let allRows = [];
  let allProducts = [];
  let currentRevenueId = null;

  const loadingEl = document.getElementById('loading');
  const errorBox = document.getElementById('errorBox');
  const tableWrap = document.getElementById('tableWrap');
  const tableBody = document.getElementById('tableBody');
  const resultCount = document.getElementById('resultCount');

  const addBtn = document.getElementById('addBtn');
  const formModal = document.getElementById('formModal');
  const formModalClose = document.getElementById('formModalClose');
  const formModalTitle = document.getElementById('formModalTitle');
  const revenueForm = document.getElementById('revenueForm');
  const cancelBtn = document.getElementById('cancelBtn');
  const deleteBtn = document.getElementById('deleteBtn');
  const mappingSection = document.getElementById('mappingSection');
  const mappingList = document.getElementById('mappingList');
  const mappingProductSelect = document.getElementById('mappingProductSelect');
  const addMappingBtn = document.getElementById('addMappingBtn');

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtDate(iso) { return iso ? String(iso).slice(0, 10) : ''; }
  function fmtMoney(n) { return Number(n).toLocaleString('ko-KR') + '원'; }

  async function loadProducts() {
    const res = await fetch(PRODUCTS_API);
    allProducts = res.ok ? await res.json() : [];
  }

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

  function render() {
    resultCount.textContent = `총 ${allRows.length}개`;
    if (!allRows.length) {
      tableBody.innerHTML = `<tr><td colspan="5"><div class="empty-state">등록된 매출이 없습니다.</div></td></tr>`;
      return;
    }
    tableBody.innerHTML = allRows.map(r => `
      <tr data-id="${escapeHtml(r.revenue_id)}">
        <td>${escapeHtml(r.revenue_id)}</td>
        <td>${escapeHtml(r.revenue_name)}</td>
        <td>${fmtMoney(r.contract_amount)}</td>
        <td>${fmtDate(r.contract_start_date)} ~ ${fmtDate(r.contract_end_date)}</td>
        <td>${(r.mapped_product_names || []).length ? r.mapped_product_names.map(escapeHtml).join(', ') : '없음'}</td>
        <td><button class="row-edit-btn" data-id="${escapeHtml(r.revenue_id)}">수정</button></td>
      </tr>
    `).join('');
  }

  function renderMappingList(row) {
    const ids = row?.mapped_product_ids || [];
    const names = row?.mapped_product_names || [];
    if (!ids.length) {
      mappingList.innerHTML = '<p style="font-size:12.5px; color:var(--text-muted); margin-bottom:8px;">매핑된 구독 상품이 없습니다.</p>';
      return;
    }
    mappingList.innerHTML = ids.map((pid, i) => `
      <div class="mapping-row">
        <span style="flex:1;">${escapeHtml(names[i] || pid)} (${escapeHtml(pid)})</span>
        <button type="button" class="btn-small" data-remove-product="${escapeHtml(pid)}">삭제</button>
      </div>
    `).join('');
  }

  function populateProductSelect() {
    const subs = allProducts.filter(p => p.product_type === 'subscription');
    mappingProductSelect.innerHTML = subs.length
      ? subs.map(p => `<option value="${escapeHtml(p.product_id)}">${escapeHtml(p.product_name)} (${escapeHtml(p.product_id)})</option>`).join('')
      : '<option value="">구독 상품이 없습니다</option>';
  }

  function openForm(row) {
    revenueForm.reset();
    currentRevenueId = row?.revenue_id || null;
    document.getElementById('f_orig_id').value = row?.revenue_id || '';
    document.getElementById('f_revenue_id').value = row?.revenue_id || '';
    document.getElementById('f_revenue_id').disabled = !!row;
    document.getElementById('f_revenue_name').value = row?.revenue_name || '';
    document.getElementById('f_contract_amount').value = row?.contract_amount ?? '';
    document.getElementById('f_contract_start_date').value = fmtDate(row?.contract_start_date);
    document.getElementById('f_contract_end_date').value = fmtDate(row?.contract_end_date);

    formModalTitle.textContent = row ? '매출 수정' : '매출 등록';
    deleteBtn.style.display = row ? 'inline-flex' : 'none';
    mappingSection.style.display = row ? 'block' : 'none';
    if (row) {
      populateProductSelect();
      renderMappingList(row);
    }
    formModal.style.display = 'flex';
  }

  function closeForm() { formModal.style.display = 'none'; }

  revenueForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const origId = document.getElementById('f_orig_id').value;
    const body = {
      revenue_id: document.getElementById('f_revenue_id').value.trim(),
      revenue_name: document.getElementById('f_revenue_name').value.trim(),
      contract_amount: document.getElementById('f_contract_amount').value,
      contract_start_date: document.getElementById('f_contract_start_date').value,
      contract_end_date: document.getElementById('f_contract_end_date').value,
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

  addMappingBtn.addEventListener('click', async () => {
    const productId = mappingProductSelect.value;
    if (!productId || !currentRevenueId) return;
    try {
      const res = await fetch(`${API}/${encodeURIComponent(currentRevenueId)}/mappings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '매핑 추가 실패');
      await loadData();
      const updated = allRows.find(r => r.revenue_id === currentRevenueId);
      renderMappingList(updated);
    } catch (err) {
      alert('매핑 추가 중 오류: ' + err.message);
    }
  });

  mappingList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove-product]');
    if (!btn || !currentRevenueId) return;
    try {
      const res = await fetch(`${API}/${encodeURIComponent(currentRevenueId)}/mappings/${encodeURIComponent(btn.dataset.removeProduct)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || '매핑 삭제 실패');
      await loadData();
      const updated = allRows.find(r => r.revenue_id === currentRevenueId);
      renderMappingList(updated);
    } catch (err) {
      alert('매핑 삭제 중 오류: ' + err.message);
    }
  });

  addBtn.addEventListener('click', () => openForm(null));
  cancelBtn.addEventListener('click', closeForm);
  formModalClose.addEventListener('click', closeForm);
  formModal.addEventListener('click', (e) => { if (e.target === formModal) closeForm(); });

  tableBody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const row = allRows.find(r => r.revenue_id === tr.dataset.id);
    if (row) openForm(row);
  });

  (async () => {
    await loadProducts();
    await loadData();
  })();
})();
