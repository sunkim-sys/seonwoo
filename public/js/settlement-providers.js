(function () {
  const API = '/api/settlement/providers';
  let allRows = [];

  const loadingEl = document.getElementById('loading');
  const errorBox = document.getElementById('errorBox');
  const tableWrap = document.getElementById('tableWrap');
  const tableBody = document.getElementById('tableBody');
  const resultCount = document.getElementById('resultCount');

  const addBtn = document.getElementById('addBtn');
  const formModal = document.getElementById('formModal');
  const formModalClose = document.getElementById('formModalClose');
  const formModalTitle = document.getElementById('formModalTitle');
  const providerForm = document.getElementById('providerForm');
  const cancelBtn = document.getElementById('cancelBtn');
  const deleteBtn = document.getElementById('deleteBtn');

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
      tableBody.innerHTML = `<tr><td colspan="7"><div class="empty-state">등록된 CP사가 없습니다.</div></td></tr>`;
      return;
    }
    tableBody.innerHTML = allRows.map(r => `
      <tr data-id="${r.id}">
        <td>${r.id}</td>
        <td>${escapeHtml(r.name)}</td>
        <td><span class="pill ${r.type === 'company' ? 'pill-blue' : 'pill-gray'}">${r.type === 'company' ? '회사' : '개인'}</span></td>
        <td>${escapeHtml(r.contact_email) || '-'}</td>
        <td>${escapeHtml(r.contact_phone) || '-'}</td>
        <td>${r.course_count}</td>
        <td><button class="row-edit-btn" data-id="${r.id}">수정</button></td>
      </tr>
    `).join('');
  }

  function openForm(row) {
    providerForm.reset();
    document.getElementById('f_id').value = row?.id || '';
    document.getElementById('f_name').value = row?.name || '';
    document.getElementById('f_type').value = row?.type || 'individual';
    document.getElementById('f_contact_email').value = row?.contact_email || '';
    document.getElementById('f_contact_phone').value = row?.contact_phone || '';
    document.getElementById('f_course_ids').value = (row?.course_ids || []).join(', ');

    formModalTitle.textContent = row ? 'CP사 수정' : 'CP사 등록';
    deleteBtn.style.display = row ? 'inline-flex' : 'none';
    formModal.style.display = 'flex';
  }

  function closeForm() { formModal.style.display = 'none'; }

  providerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('f_id').value;
    const body = {
      name: document.getElementById('f_name').value.trim(),
      type: document.getElementById('f_type').value,
      contact_email: document.getElementById('f_contact_email').value.trim(),
      contact_phone: document.getElementById('f_contact_phone').value.trim(),
      course_ids: document.getElementById('f_course_ids').value,
    };
    if (!body.name) { alert('이름은 필수입니다.'); return; }
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
    if (!id || !confirm('정말 삭제하시겠습니까? 관련 계약도 함께 삭제됩니다.')) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || '삭제 실패');
      closeForm();
      await loadData();
    } catch (err) {
      alert('삭제 중 오류: ' + err.message);
    }
  });

  addBtn.addEventListener('click', () => openForm(null));
  cancelBtn.addEventListener('click', closeForm);
  formModalClose.addEventListener('click', closeForm);
  formModal.addEventListener('click', (e) => { if (e.target === formModal) closeForm(); });

  tableBody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const row = allRows.find(r => r.id === Number(tr.dataset.id));
    if (row) openForm(row);
  });

  loadData();
})();
