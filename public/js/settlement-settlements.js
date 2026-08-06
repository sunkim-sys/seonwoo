(function () {
  const periodInput = document.getElementById('periodInput');
  const calcBtn = document.getElementById('calcBtn');
  const csvDownloadBtn = document.getElementById('csvDownloadBtn');
  const loadingEl = document.getElementById('loading');
  const errorBox = document.getElementById('errorBox');
  const tableBody = document.getElementById('tableBody');
  const kpiTotal = document.getElementById('kpiTotal');
  const kpiCount = document.getElementById('kpiCount');
  const kpiStatus = document.getElementById('kpiStatus');
  const detailModal = document.getElementById('detailModal');
  const detailModalClose = document.getElementById('detailModalClose');
  const detailBody = document.getElementById('detailBody');

  const TYPE_LABELS = {
    RATE_BY_COURSE_PRICE: 'TYPE1', RATE_BY_REVENUE_HOUR_RATIO: 'TYPE2',
    RATE_BY_PRICE_MINUS_MARKETING: 'TYPE3', RATE_BY_COMPLETION_TIER: 'TYPE4',
    FIXED_PER_STUDENT: 'TYPE5', TURNKEY: 'TYPE6',
  };

  let currentRows = [];

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtMoney(n) { return Math.round(Number(n)).toLocaleString('ko-KR') + '원'; }

  function currentPeriod() {
    return periodInput.value || new Date().toISOString().slice(0, 7);
  }

  async function loadData() {
    const period = currentPeriod();
    loadingEl.style.display = 'block';
    errorBox.style.display = 'none';
    try {
      const res = await fetch(`/api/settlement/settlements?period=${period}`);
      if (!res.ok) throw new Error((await res.json()).error || '조회 실패');
      currentRows = await res.json();
      render();
    } catch (err) {
      errorBox.textContent = '데이터를 불러오지 못했습니다: ' + err.message;
      errorBox.style.display = 'block';
    } finally {
      loadingEl.style.display = 'none';
    }
  }

  function render() {
    // 계약별 최신 버전만 표시
    const latestByContract = new Map();
    for (const r of currentRows) {
      const existing = latestByContract.get(r.contract_id);
      if (!existing || r.version > existing.version) latestByContract.set(r.contract_id, r);
    }
    const rows = [...latestByContract.values()];

    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    kpiTotal.textContent = fmtMoney(total);
    kpiCount.textContent = rows.length;
    const calculated = rows.filter(r => r.status === '계산됨').length;
    const confirmed = rows.filter(r => r.status === '확정').length;
    kpiStatus.textContent = `계산됨: ${calculated} / 확정: ${confirmed}`;

    if (!rows.length) {
      tableBody.innerHTML = `<tr><td colspan="8"><div class="empty-state">정산 데이터가 없습니다. "정산 계산" 버튼을 눌러 계산해주세요.</div></td></tr>`;
      return;
    }
    tableBody.innerHTML = rows
      .sort((a, b) => b.amount - a.amount)
      .map(r => `
        <tr data-id="${r.id}">
          <td>${escapeHtml(r.provider_name)}</td>
          <td>${escapeHtml(r.course_id)}${r.course_name ? ` (${escapeHtml(r.course_name)})` : ''}</td>
          <td><span class="pill ${r.product_type === 'subscription' ? 'pill-blue' : 'pill-gray'}">${r.product_type === 'subscription' ? '구독' : '단건'}</span></td>
          <td>${TYPE_LABELS[r.settlement_type] || r.settlement_type}</td>
          <td>${fmtMoney(r.amount)}</td>
          <td>v${r.version}</td>
          <td>${r.status === '확정' ? '<span class="pill pill-blue">확정</span>' : '<span class="pill pill-green">계산됨</span>'}</td>
          <td>
            <button class="btn-small detail-btn" data-id="${r.id}">상세</button>
            ${r.status === '계산됨' ? `<button class="btn-small confirm-btn" data-id="${r.id}">확정</button>` : ''}
          </td>
        </tr>
      `).join('');
  }

  calcBtn.addEventListener('click', async () => {
    if (!confirm(`${currentPeriod()} 정산을 계산할까요? 재계산 시 새 버전이 생성됩니다.`)) return;
    calcBtn.disabled = true;
    calcBtn.textContent = '계산 중...';
    try {
      const res = await fetch('/api/settlement/calculate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: currentPeriod() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '계산 실패');
      await loadData();
    } catch (err) {
      alert('계산 중 오류: ' + err.message);
    } finally {
      calcBtn.disabled = false;
      calcBtn.textContent = '정산 계산';
    }
  });

  tableBody.addEventListener('click', async (e) => {
    const detailBtn = e.target.closest('.detail-btn');
    const confirmBtn = e.target.closest('.confirm-btn');
    if (detailBtn) {
      const row = currentRows.find(r => r.id === Number(detailBtn.dataset.id));
      if (!row) return;
      detailBody.innerHTML = `
        <p style="margin-bottom:10px; font-size:13.5px;">${escapeHtml(row.provider_name)} · ${escapeHtml(row.course_id)} · ${TYPE_LABELS[row.settlement_type]} · <strong>${fmtMoney(row.amount)}</strong></p>
        <div class="detail-json">${escapeHtml(JSON.stringify(row.calculation_detail, null, 2))}</div>
      `;
      detailModal.style.display = 'flex';
    }
    if (confirmBtn) {
      if (!confirm('이 정산을 확정하시겠습니까? 확정 후에는 되돌리기 어려울 수 있습니다.')) return;
      try {
        const res = await fetch(`/api/settlement/settlements/${confirmBtn.dataset.id}/confirm`, { method: 'POST' });
        if (!res.ok) throw new Error((await res.json()).error || '확정 실패');
        await loadData();
      } catch (err) {
        alert('확정 중 오류: ' + err.message);
      }
    }
  });

  csvDownloadBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const latestByContract = new Map();
    for (const r of currentRows) {
      const existing = latestByContract.get(r.contract_id);
      if (!existing || r.version > existing.version) latestByContract.set(r.contract_id, r);
    }
    const rows = [...latestByContract.values()];
    const header = ['CP사', '코스ID', '코스명', '유형', '정산타입', '정산액', '버전', '상태'];
    const lines = [header.join(',')];
    rows.forEach(r => {
      lines.push([r.provider_name, r.course_id, r.course_name || '', r.product_type, TYPE_LABELS[r.settlement_type], Math.round(r.amount), r.version, r.status]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `정산_${currentPeriod()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  detailModalClose.addEventListener('click', () => { detailModal.style.display = 'none'; });
  detailModal.addEventListener('click', (e) => { if (e.target === detailModal) detailModal.style.display = 'none'; });

  periodInput.value = new Date().toISOString().slice(0, 7);
  periodInput.addEventListener('change', loadData);

  loadData();
})();
