(function () {
  const API = '/api/settlement/users';
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
  const userForm = document.getElementById('userForm');
  const cancelBtn = document.getElementById('cancelBtn');
  const passwordGroup = document.getElementById('passwordGroup');
  const statusGroup = document.getElementById('statusGroup');
  const passwordInput = document.getElementById('f_password');

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtDateTime(iso) { return iso ? new Date(iso).toLocaleString('ko-KR') : '-'; }

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
      tableBody.innerHTML = `<tr><td colspan="6"><div class="empty-state">등록된 사용자가 없습니다.</div></td></tr>`;
      return;
    }
    tableBody.innerHTML = allRows.map(r => `
      <tr data-id="${r.id}">
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.login_id)}</td>
        <td><span class="pill ${r.role === 'admin' ? 'pill-blue' : 'pill-gray'}">${r.role === 'admin' ? '관리자' : '회계'}</span></td>
        <td>${r.status === 'active' ? '<span class="pill pill-green">활성</span>' : '<span class="pill pill-red">비활성</span>'}</td>
        <td>${fmtDateTime(r.last_login_at)}</td>
        <td><button class="row-edit-btn" data-id="${r.id}">수정</button></td>
      </tr>
    `).join('');
  }

  function openForm(row) {
    userForm.reset();
    document.getElementById('f_id').value = row?.id || '';
    document.getElementById('f_name').value = row?.name || '';
    document.getElementById('f_role').value = row?.role || 'accountant';
    document.getElementById('f_login_id').value = row?.login_id || '';
    document.getElementById('f_login_id').disabled = !!row;
    document.getElementById('f_email').value = row?.email || '';
    document.getElementById('f_status').value = row?.status || 'active';

    formModalTitle.textContent = row ? '사용자 수정' : '사용자 추가';
    passwordInput.required = !row;
    passwordGroup.querySelector('label').textContent = row ? '새 비밀번호 (선택, 4자 이상)' : '비밀번호 * (4자 이상)';
    statusGroup.style.display = row ? 'block' : 'none';
    formModal.style.display = 'flex';
  }

  function closeForm() { formModal.style.display = 'none'; }

  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('f_id').value;
    const body = {
      name: document.getElementById('f_name').value.trim(),
      role: document.getElementById('f_role').value,
      login_id: document.getElementById('f_login_id').value.trim(),
      email: document.getElementById('f_email').value.trim(),
      status: document.getElementById('f_status').value,
    };
    const password = passwordInput.value;
    if (password) body.password = password;
    if (!id && !password) { alert('비밀번호는 필수입니다.'); return; }
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
