(function () {
  const periodInput = document.getElementById('periodInput');
  const tabs = document.querySelectorAll('.settle-tab');
  const panels = { summary: document.getElementById('panel-summary'), trend: document.getElementById('panel-trend'), analysis: document.getElementById('panel-analysis'), review: document.getElementById('panel-review') };

  const TYPE_LABELS = {
    RATE_BY_COURSE_PRICE: 'TYPE1', RATE_BY_REVENUE_HOUR_RATIO: 'TYPE2',
    RATE_BY_PRICE_MINUS_MARKETING: 'TYPE3', RATE_BY_COMPLETION_TIER: 'TYPE4',
    FIXED_PER_STUDENT: 'TYPE5', TURNKEY: 'TYPE6',
  };

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtMoney(n) { return Math.round(Number(n)).toLocaleString('ko-KR') + '원'; }
  function fmtPct(n) { return n === null || n === undefined ? '' : `${n >= 0 ? '▲' : '▼'} ${Math.abs(n).toFixed(1)}% 전기간 대비`; }

  function currentPeriod() { return periodInput.value || new Date().toISOString().slice(0, 7); }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      Object.values(panels).forEach(p => p.style.display = 'none');
      panels[tab.dataset.tab].style.display = 'block';
      if (tab.dataset.tab === 'trend') loadTrend();
    });
  });

  async function loadSummary() {
    const res = await fetch(`/api/settlement/dashboard/summary?period=${currentPeriod()}`);
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('sumTotal').textContent = fmtMoney(data.total_amount);
    const totalDelta = document.getElementById('sumTotalDelta');
    totalDelta.textContent = fmtPct(data.total_amount_mom_pct);
    totalDelta.className = 'kpi-box-delta ' + (data.total_amount_mom_pct >= 0 ? 'up' : 'down');

    document.getElementById('sumCourseCount').textContent = data.course_count;
    const courseDelta = document.getElementById('sumCourseDelta');
    courseDelta.textContent = fmtPct(data.course_count_mom_pct);
    courseDelta.className = 'kpi-box-delta ' + (data.course_count_mom_pct >= 0 ? 'up' : 'down');

    document.getElementById('sumStatus').textContent = `계산됨: ${data.calculated_count} / 확정: ${data.confirmed_count}`;

    document.getElementById('typeBreakdownList').innerHTML = data.type_breakdown.map(t => `
      <div class="row-item"><span>${escapeHtml(t.label)}</span><strong>${fmtMoney(t.amount)}</strong></div>
    `).join('');

    const providerRows = data.by_provider.map(p => `
      <tr><td>${escapeHtml(p.provider)}</td><td>${p.course_count}</td><td>${fmtMoney(p.amount)}</td>
      <td>계산됨: ${p.calculated}${p.confirmed ? ` / 확정: ${p.confirmed}` : ''}</td></tr>
    `).join('');
    document.getElementById('byProviderBody').innerHTML = providerRows || '<tr><td colspan="4"><div class="empty-state">데이터가 없습니다.</div></td></tr>';
    document.getElementById('analysisBody').innerHTML = data.by_provider.map((p, i) => `
      <tr><td>${i + 1}</td><td>${escapeHtml(p.provider)}</td><td>${p.course_count}</td><td>${fmtMoney(p.amount)}</td>
      <td>계산됨: ${p.calculated}${p.confirmed ? ` / 확정: ${p.confirmed}` : ''}</td></tr>
    `).join('') || '<tr><td colspan="5"><div class="empty-state">데이터가 없습니다.</div></td></tr>';
  }

  let trendChart, typeTrendChart;
  async function loadTrend() {
    const start = document.getElementById('trendStart').value;
    const end = document.getElementById('trendEnd').value;
    const res = await fetch(`/api/settlement/dashboard/trend?start_period=${start}&end_period=${end}`);
    if (!res.ok) return;
    const data = await res.json();

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById('trendChart'), {
      type: 'line',
      data: {
        labels: data.monthly.map(m => m.period),
        datasets: [{ label: '총 정산액', data: data.monthly.map(m => m.amount), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.15)', fill: true, tension: 0.3 }],
      },
      options: { responsive: true, plugins: { legend: { display: false } } },
    });

    const typeKeys = Object.keys(TYPE_LABELS);
    const palette = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#94a3b8'];
    if (typeTrendChart) typeTrendChart.destroy();
    typeTrendChart = new Chart(document.getElementById('typeTrendChart'), {
      type: 'bar',
      data: {
        labels: data.type_monthly.map(m => m.period),
        datasets: typeKeys.map((key, i) => ({
          label: TYPE_LABELS[key],
          data: data.type_monthly.map(m => m.by_type[key] || 0),
          backgroundColor: palette[i],
        })),
      },
      options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true } } },
    });
  }

  async function loadReview() {
    const res = await fetch(`/api/settlement/dashboard/review?period=${currentPeriod()}`);
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('reviewNeeded').textContent = data.review_needed_count;
    document.getElementById('reviewNotRegistered').textContent = data.product_not_registered_count;
    document.getElementById('reviewNotMapped').textContent = data.revenue_not_mapped_count;
    document.getElementById('reviewNotCreated').textContent = data.settlement_not_created_count;

    document.getElementById('reviewBody').innerHTML = data.items.length
      ? data.items.map(item => `
        <tr>
          <td>${escapeHtml(item.product_name)} <span style="color:var(--text-muted)">(${escapeHtml(item.product_id)})</span></td>
          <td>${item.product_type === 'subscription' ? '구독' : item.product_type === 'single' ? '단건' : '-'}</td>
          <td>${item.issues.map(i => `<span class="pill pill-amber">${escapeHtml(i)}</span>`).join(' ')}</td>
          <td>${item.actions.map(a => `<span class="pill pill-blue">${escapeHtml(a)}</span>`).join(' ') || '-'}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="4"><div class="empty-state">검토가 필요한 항목이 없습니다.</div></td></tr>';
  }

  document.getElementById('trendApplyBtn').addEventListener('click', loadTrend);
  periodInput.addEventListener('change', () => { loadSummary(); loadReview(); });

  const now = new Date();
  periodInput.value = now.toISOString().slice(0, 7);
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  document.getElementById('trendStart').value = threeMonthsAgo.toISOString().slice(0, 7);
  document.getElementById('trendEnd').value = now.toISOString().slice(0, 7);

  loadSummary();
  loadReview();
})();
