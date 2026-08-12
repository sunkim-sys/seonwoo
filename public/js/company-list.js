(function () {
  const API = '/api/company-list';
  let allRows = [];
  let urlFiltersApplied = false;

  const loadingEl = document.getElementById('loading');
  const errorBox = document.getElementById('errorBox');
  const tableWrap = document.getElementById('tableWrap');
  const tableBody = document.getElementById('tableBody');
  const resultCount = document.getElementById('resultCount');

  const searchInput = document.getElementById('searchInput');
  const filterStatus = document.getElementById('filterStatus');
  const filterResetBtn = document.getElementById('filterResetBtn');
  const filterAttentionBtn = document.getElementById('filterAttentionBtn');

  const msCsm = document.getElementById('msCsm');
  const msCsmBtn = document.getElementById('msCsmBtn');
  const msCsmPanel = document.getElementById('msCsmPanel');
  const msAe = document.getElementById('msAe');
  const msAeBtn = document.getElementById('msAeBtn');
  const msAePanel = document.getElementById('msAePanel');
  const selectedCsm = new Set();
  const selectedAe = new Set();

  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
  const selectedIds = new Set();

  const NEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7일
  let attentionOnly = false;

  const addBtn = document.getElementById('addBtn');
  const formModal = document.getElementById('formModal');
  const formModalClose = document.getElementById('formModalClose');
  const formModalTitle = document.getElementById('formModalTitle');
  const companyForm = document.getElementById('companyForm');
  const cancelBtn = document.getElementById('cancelBtn');
  const deleteBtn = document.getElementById('deleteBtn');

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
  }

  function fmtDate(iso) {
    if (!iso) return '';
    return String(iso).slice(0, 10);
  }

  async function loadData() {
    loadingEl.style.display = 'block';
    tableWrap.style.display = 'none';
    errorBox.style.display = 'none';
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error((await res.json()).error || '조회 실패');
      allRows = await res.json();
      populateFilterOptions();
      if (!urlFiltersApplied) {
        urlFiltersApplied = true;
        applyUrlFilters();
      }
      render();
    } catch (err) {
      showError('데이터를 불러오지 못했습니다: ' + err.message);
    } finally {
      loadingEl.style.display = 'none';
      tableWrap.style.display = 'block';
    }
  }

  function renderMultiselect(panelEl, btnEl, options, selectedSet, allLabel) {
    // 더 이상 존재하지 않는 값은 선택에서 제거
    [...selectedSet].forEach(v => { if (!options.includes(v)) selectedSet.delete(v); });

    panelEl.innerHTML = options.map(opt => `
      <label class="multiselect-option">
        <input type="checkbox" value="${escapeHtml(opt)}" ${selectedSet.has(opt) ? 'checked' : ''}>
        ${escapeHtml(opt)}
      </label>
    `).join('') || '<div class="multiselect-option">옵션 없음</div>';

    updateMultiselectBtn(btnEl, selectedSet, allLabel);
  }

  function updateMultiselectBtn(btnEl, selectedSet, allLabel) {
    btnEl.textContent = selectedSet.size ? `${allLabel.replace('전체 ', '')} (${selectedSet.size})` : allLabel;
  }

  function bindMultiselect(containerEl, panelEl, btnEl, selectedSet, allLabel) {
    btnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !containerEl.classList.contains('open');
      document.querySelectorAll('.multiselect.open').forEach(el => el.classList.remove('open'));
      if (willOpen) containerEl.classList.add('open');
    });
    panelEl.addEventListener('change', (e) => {
      const cb = e.target;
      if (cb.type !== 'checkbox') return;
      if (cb.checked) selectedSet.add(cb.value); else selectedSet.delete(cb.value);
      updateMultiselectBtn(btnEl, selectedSet, allLabel);
      render();
    });
  }

  document.addEventListener('click', () => {
    document.querySelectorAll('.multiselect.open').forEach(el => el.classList.remove('open'));
  });

  bindMultiselect(msCsm, msCsmPanel, msCsmBtn, selectedCsm, '전체 CSM');
  bindMultiselect(msAe, msAePanel, msAeBtn, selectedAe, '전체 LD');

  function populateFilterOptions() {
    const csmSet = [...new Set(allRows.map(r => r.csm).filter(Boolean))].sort();
    const aeSet = [...new Set(allRows.map(r => r.ae).filter(Boolean))].sort();

    renderMultiselect(msCsmPanel, msCsmBtn, csmSet, selectedCsm, '전체 CSM');
    renderMultiselect(msAePanel, msAeBtn, aeSet, selectedAe, '전체 LD');

    document.getElementById('csmOptions').innerHTML =
      csmSet.map(c => `<option value="${escapeHtml(c)}">`).join('');
    document.getElementById('aeOptions').innerHTML =
      aeSet.map(a => `<option value="${escapeHtml(a)}">`).join('');
  }

  function applyUrlFilters() {
    const csm = new URLSearchParams(location.search).get('csm');
    if (!csm) return;
    selectedCsm.add(csm);
    renderMultiselect(msCsmPanel, msCsmBtn, [...new Set(allRows.map(r => r.csm).filter(Boolean))].sort(), selectedCsm, '전체 CSM');
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function isUnassigned(r) {
    return !r.csm || !r.ae;
  }

  function isNew(r) {
    const ts = Date.parse(r.created_at || r.updated_at || '');
    return !Number.isNaN(ts) && (Date.now() - ts) < NEW_THRESHOLD_MS;
  }

  function getFiltered() {
    const q = searchInput.value.trim().toLowerCase();
    const status = filterStatus.value;

    return allRows.filter(r => {
      if (q && !(r.member_group_name || '').toLowerCase().includes(q)) return false;
      if (selectedCsm.size && !selectedCsm.has(r.csm)) return false;
      if (selectedAe.size && !selectedAe.has(r.ae)) return false;
      if (status && r.status !== status) return false;
      if (attentionOnly && !isUnassigned(r) && !isNew(r)) return false;
      return true;
    });
  }

  function renderBadges(r) {
    let badges = '';
    if (isNew(r)) badges += `<span class="row-badge row-badge-new">NEW</span>`;
    if (isUnassigned(r)) badges += `<span class="row-badge row-badge-unassigned">배정필요</span>`;
    return badges;
  }

  function updateBulkDeleteBtn() {
    bulkDeleteBtn.textContent = `선택 삭제 (${selectedIds.size})`;
    bulkDeleteBtn.disabled = selectedIds.size === 0;
  }

  function render() {
    const rows = getFiltered();
    resultCount.textContent = `총 ${rows.length}개`;

    const anyFilter = searchInput.value || selectedCsm.size || selectedAe.size || filterStatus.value || attentionOnly;
    filterResetBtn.style.display = anyFilter ? 'inline-flex' : 'none';

    if (!rows.length) {
      tableBody.innerHTML = `<tr><td colspan="16"><div class="empty-state">데이터가 없습니다.</div></td></tr>`;
      selectAllCheckbox.checked = false;
      updateBulkDeleteBtn();
      return;
    }

    tableBody.innerHTML = rows.map(r => `
      <tr data-id="${r.id}">
        <td><input type="checkbox" class="row-checkbox" data-id="${r.id}" ${selectedIds.has(r.id) ? 'checked' : ''}></td>
        <td>${escapeHtml(r.member_group_name)}${renderBadges(r)}</td>
        <td>${escapeHtml(r.member_group_ext_id)}</td>
        <td>${escapeHtml(r.csm)}</td>
        <td>${escapeHtml(r.ae)}</td>
        <td>${escapeHtml(r.plan)}</td>
        <td>${escapeHtml(r.enroll_type)}</td>
        <td><span class="status-pill status-${r.status === 'closed' ? 'closed' : 'ongoing'}">${escapeHtml(r.status)}</span></td>
        <td>${escapeHtml(r.completion_criteria)}</td>
        <td>${fmtDate(r.first_enroll_date)}</td>
        <td>${fmtDate(r.lecture_start_date)}</td>
        <td>${fmtDate(r.lecture_end_date)}</td>
        <td>${escapeHtml(r.edu_manager_name)}</td>
        <td>${escapeHtml(r.edu_manager_email)}</td>
        <td>${escapeHtml(r.edu_manager_phone)}</td>
        <td><button class="row-edit-btn" data-id="${r.id}">수정</button></td>
      </tr>
    `).join('');

    selectAllCheckbox.checked = rows.every(r => selectedIds.has(r.id));
    updateBulkDeleteBtn();
  }

  function openForm(row) {
    companyForm.reset();
    document.getElementById('f_id').value = row?.id || '';
    document.getElementById('f_member_group_name').value = row?.member_group_name || '';
    document.getElementById('f_member_group_ext_id').value = row?.member_group_ext_id || '';
    document.getElementById('f_status').value = row?.status || 'ongoing';
    document.getElementById('f_csm').value = row?.csm || '';
    document.getElementById('f_ae').value = row?.ae || '';
    document.getElementById('f_plan').value = row?.plan || '';
    document.getElementById('f_enroll_type').value = row?.enroll_type || '';
    document.getElementById('f_completion_criteria').value = row?.completion_criteria || '';
    document.getElementById('f_first_enroll_date').value = fmtDate(row?.first_enroll_date);
    document.getElementById('f_lecture_start_date').value = fmtDate(row?.lecture_start_date);
    document.getElementById('f_lecture_end_date').value = fmtDate(row?.lecture_end_date);
    document.getElementById('f_edu_manager_name').value = row?.edu_manager_name || '';
    document.getElementById('f_edu_manager_email').value = row?.edu_manager_email || '';
    document.getElementById('f_edu_manager_phone').value = row?.edu_manager_phone || '';

    formModalTitle.textContent = row ? '기업 수정' : '기업 추가';
    deleteBtn.style.display = row ? 'inline-flex' : 'none';
    formModal.style.display = 'flex';
  }

  function closeForm() {
    formModal.style.display = 'none';
  }

  function collectFormData() {
    return {
      member_group_name: document.getElementById('f_member_group_name').value.trim(),
      member_group_ext_id: document.getElementById('f_member_group_ext_id').value.trim(),
      status: document.getElementById('f_status').value,
      csm: document.getElementById('f_csm').value.trim(),
      ae: document.getElementById('f_ae').value.trim(),
      plan: document.getElementById('f_plan').value.trim(),
      enroll_type: document.getElementById('f_enroll_type').value.trim(),
      completion_criteria: document.getElementById('f_completion_criteria').value.trim(),
      first_enroll_date: document.getElementById('f_first_enroll_date').value || '',
      lecture_start_date: document.getElementById('f_lecture_start_date').value || '',
      lecture_end_date: document.getElementById('f_lecture_end_date').value || '',
      edu_manager_name: document.getElementById('f_edu_manager_name').value.trim(),
      edu_manager_email: document.getElementById('f_edu_manager_email').value.trim(),
      edu_manager_phone: document.getElementById('f_edu_manager_phone').value.trim(),
    };
  }

  companyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('f_id').value;
    const body = collectFormData();
    if (!body.member_group_name) {
      alert('멤버그룹명은 필수입니다.');
      return;
    }
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
      alert('저장 중 오류가 발생했습니다: ' + err.message);
    }
  });

  deleteBtn.addEventListener('click', async () => {
    const id = document.getElementById('f_id').value;
    if (!id) return;
    if (!confirm('정말 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || '삭제 실패');
      closeForm();
      await loadData();
    } catch (err) {
      alert('삭제 중 오류가 발생했습니다: ' + err.message);
    }
  });

  addBtn.addEventListener('click', () => openForm(null));
  cancelBtn.addEventListener('click', closeForm);
  formModalClose.addEventListener('click', closeForm);
  formModal.addEventListener('click', (e) => { if (e.target === formModal) closeForm(); });

  tableBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('row-checkbox')) return;
    const btn = e.target.closest('.row-edit-btn');
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = Number((btn || tr).dataset.id);
    const row = allRows.find(r => r.id === id);
    if (row) openForm(row);
  });

  tableBody.addEventListener('change', (e) => {
    if (!e.target.classList.contains('row-checkbox')) return;
    const id = Number(e.target.dataset.id);
    if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
    selectAllCheckbox.checked = getFiltered().every(r => selectedIds.has(r.id));
    updateBulkDeleteBtn();
  });

  selectAllCheckbox.addEventListener('change', () => {
    const rows = getFiltered();
    if (selectAllCheckbox.checked) rows.forEach(r => selectedIds.add(r.id));
    else rows.forEach(r => selectedIds.delete(r.id));
    render();
  });

  bulkDeleteBtn.addEventListener('click', async () => {
    if (!selectedIds.size) return;
    if (!confirm(`선택한 ${selectedIds.size}개 기업을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    try {
      await Promise.all([...selectedIds].map(id =>
        fetch(`${API}/${id}`, { method: 'DELETE' }).then(res => {
          if (!res.ok) throw new Error('삭제 실패');
        })
      ));
      selectedIds.clear();
      await loadData();
    } catch (err) {
      alert('일괄 삭제 중 오류가 발생했습니다: ' + err.message);
      await loadData();
    }
  });

  filterAttentionBtn.addEventListener('click', () => {
    attentionOnly = !attentionOnly;
    filterAttentionBtn.classList.toggle('active', attentionOnly);
    render();
  });

  [searchInput, filterStatus].forEach(el => {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  filterResetBtn.addEventListener('click', () => {
    searchInput.value = '';
    filterStatus.value = '';
    selectedCsm.clear();
    selectedAe.clear();
    updateMultiselectBtn(msCsmBtn, selectedCsm, '전체 CSM');
    updateMultiselectBtn(msAeBtn, selectedAe, '전체 LD');
    msCsmPanel.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    msAePanel.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    attentionOnly = false;
    filterAttentionBtn.classList.remove('active');
    render();
  });

  loadData();
})();
