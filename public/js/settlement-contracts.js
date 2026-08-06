(function () {
  const API = '/api/settlement/contracts';
  const PROVIDERS_API = '/api/settlement/providers';
  let allRows = [];
  let allProviders = [];

  const loadingEl = document.getElementById('loading');
  const errorBox = document.getElementById('errorBox');
  const tableWrap = document.getElementById('tableWrap');
  const tableBody = document.getElementById('tableBody');
  const resultCount = document.getElementById('resultCount');

  const addBtn = document.getElementById('addBtn');
  const formModal = document.getElementById('formModal');
  const formModalClose = document.getElementById('formModalClose');
  const formModalTitle = document.getElementById('formModalTitle');
  const contractForm = document.getElementById('contractForm');
  const cancelBtn = document.getElementById('cancelBtn');
  const deleteBtn = document.getElementById('deleteBtn');
  const settlementTypeSelect = document.getElementById('f_settlement_type');
  const fixedAmountGroup = document.getElementById('fixedAmountGroup');
  const tiersGroup = document.getElementById('tiersGroup');

  const TYPE_LABELS = {
    RATE_BY_COURSE_PRICE: 'TYPE1: 판매가',
    RATE_BY_REVENUE_HOUR_RATIO: 'TYPE2: 매출-수강시간',
    RATE_BY_PRICE_MINUS_MARKETING: 'TYPE3: 마케팅비 차감',
    RATE_BY_COMPLETION_TIER: 'TYPE4: 수강률 구간',
    FIXED_PER_STUDENT: 'TYPE5: 고정금액',
    TURNKEY: 'TYPE6: 턴키',
  };

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function loadProviders() {
    const res = await fetch(PROVIDERS_API);
    allProviders = res.ok ? await res.json() : [];
    document.getElementById('f_provider_id').innerHTML = allProviders.length
      ? allProviders.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (#${p.id})</option>`).join('')
      : '<option value="">등록된 CP사가 없습니다</option>';
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
      tableBody.innerHTML = `<tr><td colspan="6"><div class="empty-state">등록된 계약이 없습니다.</div></td></tr>`;
      return;
    }
    tableBody.innerHTML = allRows.map(r => `
      <tr data-id="${r.id}">
        <td>${escapeHtml(r.provider_name)}</td>
        <td>${escapeHtml(r.course_id)}${r.course_name ? ` <span style="color:var(--text-muted)">(${escapeHtml(r.course_name)})</span>` : ''}</td>
        <td><span class="pill ${r.product_type === 'subscription' ? 'pill-blue' : 'pill-gray'}">${r.product_type === 'subscription' ? '구독' : '단건'}</span></td>
        <td>${TYPE_LABELS[r.settlement_type] || r.settlement_type}</td>
        <td>${r.settlement_type === 'FIXED_PER_STUDENT' ? (r.fixed_amount_per_student ?? '-') + '원/인' : (r.rate !== null ? r.rate : '-')}</td>
        <td><button class="row-edit-btn" data-id="${r.id}">수정</button></td>
      </tr>
    `).join('');
  }

  function updateFieldVisibility() {
    const type = settlementTypeSelect.value;
    fixedAmountGroup.style.display = type === 'FIXED_PER_STUDENT' ? 'block' : 'none';
    tiersGroup.style.display = type === 'RATE_BY_COMPLETION_TIER' ? 'block' : 'none';
  }
  settlementTypeSelect.addEventListener('change', updateFieldVisibility);

  function openForm(row) {
    contractForm.reset();
    document.getElementById('f_id').value = row?.id || '';
    document.getElementById('f_provider_id').value = row?.provider_id || (allProviders[0]?.id ?? '');
    document.getElementById('f_course_id').value = row?.course_id || '';
    document.getElementById('f_course_name').value = row?.course_name || '';
    document.getElementById('f_product_type').value = row?.product_type || 'single';
    document.getElementById('f_settlement_type').value = row?.settlement_type || 'RATE_BY_REVENUE_HOUR_RATIO';
    document.getElementById('f_rate').value = row?.rate ?? '';
    document.getElementById('f_fixed_amount_per_student').value = row?.fixed_amount_per_student ?? '';
    document.getElementById('f_completion_tiers').value = row?.completion_tiers?.length ? JSON.stringify(row.completion_tiers) : '';
    updateFieldVisibility();

    formModalTitle.textContent = row ? '계약 수정' : '계약 등록';
    deleteBtn.style.display = row ? 'inline-flex' : 'none';
    formModal.style.display = 'flex';
  }

  function closeForm() { formModal.style.display = 'none'; }

  contractForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('f_id').value;
    let tiers = [];
    const tiersRaw = document.getElementById('f_completion_tiers').value.trim();
    if (tiersRaw) {
      try { tiers = JSON.parse(tiersRaw); } catch { alert('수강률 구간 JSON 형식이 올바르지 않습니다.'); return; }
    }
    const body = {
      provider_id: document.getElementById('f_provider_id').value,
      course_id: document.getElementById('f_course_id').value.trim(),
      course_name: document.getElementById('f_course_name').value.trim(),
      product_type: document.getElementById('f_product_type').value,
      settlement_type: document.getElementById('f_settlement_type').value,
      rate: document.getElementById('f_rate').value,
      fixed_amount_per_student: document.getElementById('f_fixed_amount_per_student').value,
      completion_tiers: tiers,
    };
    if (!body.provider_id) { alert('CP사를 선택해주세요.'); return; }
    if (!body.course_id) { alert('코스 ID는 필수입니다.'); return; }
    try {
      const res = await fetch(id ? `${API}/${id}` : API, {
        method: id ? 'PUT' : 'POST',
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
    const id = document.getElementById('f_id').value;
    if (!id || !confirm('정말 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || '삭제 실패');
      closeForm();
      await loadData();
    } catch (err) {
      alert('삭제 중 오류: ' + err.message);
    }
  });

  addBtn.addEventListener('click', () => {
    if (!allProviders.length) { alert('먼저 CP사를 등록해주세요.'); return; }
    openForm(null);
  });
  cancelBtn.addEventListener('click', closeForm);
  formModalClose.addEventListener('click', closeForm);
  formModal.addEventListener('click', (e) => { if (e.target === formModal) closeForm(); });

  tableBody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const row = allRows.find(r => r.id === Number(tr.dataset.id));
    if (row) openForm(row);
  });

  (async () => {
    await loadProviders();
    await loadData();
  })();
})();
