(function () {
  const API = '/api/company-list';
  let allRows = [];

  const loadingEl = document.getElementById('loading');
  const errorBox = document.getElementById('errorBox');
  const tableWrap = document.getElementById('tableWrap');
  const tableBody = document.getElementById('tableBody');
  const resultCount = document.getElementById('resultCount');

  const searchInput = document.getElementById('searchInput');
  const filterCsm = document.getElementById('filterCsm');
  const filterAe = document.getElementById('filterAe');
  const filterStatus = document.getElementById('filterStatus');
  const filterResetBtn = document.getElementById('filterResetBtn');

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
      render();
    } catch (err) {
      showError('데이터를 불러오지 못했습니다: ' + err.message);
    } finally {
      loadingEl.style.display = 'none';
      tableWrap.style.display = 'block';
    }
  }

  function populateFilterOptions() {
    const csmSet = [...new Set(allRows.map(r => r.csm).filter(Boolean))].sort();
    const aeSet = [...new Set(allRows.map(r => r.ae).filter(Boolean))].sort();

    filterCsm.innerHTML = '<option value="">전체 CSM</option>' +
      csmSet.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    filterAe.innerHTML = '<option value="">전체 LD</option>' +
      aeSet.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');

    document.getElementById('csmOptions').innerHTML =
      csmSet.map(c => `<option value="${escapeHtml(c)}">`).join('');
    document.getElementById('aeOptions').innerHTML =
      aeSet.map(a => `<option value="${escapeHtml(a)}">`).join('');
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function getFiltered() {
    const q = searchInput.value.trim().toLowerCase();
    const csm = filterCsm.value;
    const ae = filterAe.value;
    const status = filterStatus.value;

    return allRows.filter(r => {
      if (q && !(r.member_group_name || '').toLowerCase().includes(q)) return false;
      if (csm && r.csm !== csm) return false;
      if (ae && r.ae !== ae) return false;
      if (status && r.status !== status) return false;
      return true;
    });
  }

  function render() {
    const rows = getFiltered();
    resultCount.textContent = `총 ${rows.length}개`;

    const anyFilter = searchInput.value || filterCsm.value || filterAe.value || filterStatus.value;
    filterResetBtn.style.display = anyFilter ? 'inline-flex' : 'none';

    if (!rows.length) {
      tableBody.innerHTML = `<tr><td colspan="15"><div class="empty-state">데이터가 없습니다.</div></td></tr>`;
      return;
    }

    tableBody.innerHTML = rows.map(r => `
      <tr data-id="${r.id}">
        <td>${escapeHtml(r.member_group_name)}</td>
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
    const btn = e.target.closest('.row-edit-btn');
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = Number((btn || tr).dataset.id);
    const row = allRows.find(r => r.id === id);
    if (row) openForm(row);
  });

  [searchInput, filterCsm, filterAe, filterStatus].forEach(el => {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  filterResetBtn.addEventListener('click', () => {
    searchInput.value = '';
    filterCsm.value = '';
    filterAe.value = '';
    filterStatus.value = '';
    render();
  });

  loadData();
})();
