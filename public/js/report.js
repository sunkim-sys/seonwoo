let reportData = null;
let viewMode = 'summary'; // summary | month | range
let selectedMonth = null;
let rangeStart = null;
let rangeEnd = null;
let sortedMonths = []; // chronologically sorted (oldest -> newest)

async function loadReport() {
  try {
    const res = await fetch('/api/report');
    reportData = await res.json();
    // Sort months chronologically
    sortedMonths = [...(reportData.availableMonths || [])].sort((a, b) => {
      const ya = monthYear(a), yb = monthYear(b);
      if (ya !== yb) return ya - yb;
      return monthIndex(a) - monthIndex(b);
    });
    document.getElementById('loading').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    setupViewTabs();
    renderSubSelector();
    renderView();
  } catch (err) {
    document.getElementById('loading').textContent = '데이터 로드 실패: ' + err.message;
  }
}

function monthIndex(name) {
  const m = name.match(/(\d{1,2})\s*월/);
  return m ? Number(m[1]) : 0;
}

function monthYear(name) {
  const y = name.match(/(\d{4})\s*년/);
  return y ? Number(y[1]) : 0;
}

function shortLabel(name) {
  return name.replace(' 레포트', '');
}

function setupViewTabs() {
  document.querySelectorAll('#viewModeTabs .vm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#viewModeTabs .vm-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      viewMode = btn.dataset.mode;
      selectedMonth = null;
      rangeStart = null;
      rangeEnd = null;
      renderSubSelector();
      renderView();
    });
  });
}

function renderSubSelector() {
  const container = document.getElementById('subSelector');

  if (viewMode === 'summary') {
    container.innerHTML = '';
    return;
  }

  if (viewMode === 'month') {
    if (!selectedMonth && sortedMonths.length > 0) {
      selectedMonth = sortedMonths[sortedMonths.length - 1];
    }
    container.innerHTML = sortedMonths.map(name => `
      <button class="sub-btn ${selectedMonth === name ? 'active' : ''}" data-month="${name}">${shortLabel(name)}</button>
    `).join('');
    container.querySelectorAll('.sub-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedMonth = btn.dataset.month;
        renderSubSelector();
        renderView();
      });
    });
    return;
  }

  if (viewMode === 'range') {
    if (!rangeStart && sortedMonths.length > 0) rangeStart = sortedMonths[0];
    if (!rangeEnd && sortedMonths.length > 0) rangeEnd = sortedMonths[sortedMonths.length - 1];
    const opts = sortedMonths.map(m => `<option value="${m}">${shortLabel(m)}</option>`).join('');
    container.innerHTML = `
      <div class="range-picker">
        <label>시작</label>
        <select id="rangeStartSel">${opts}</select>
        <span>~</span>
        <label>종료</label>
        <select id="rangeEndSel">${opts}</select>
        <button class="sub-btn active" id="applyRangeBtn">적용</button>
      </div>
    `;
    const startSel = document.getElementById('rangeStartSel');
    const endSel = document.getElementById('rangeEndSel');
    startSel.value = rangeStart;
    endSel.value = rangeEnd;
    document.getElementById('applyRangeBtn').addEventListener('click', () => {
      rangeStart = startSel.value;
      rangeEnd = endSel.value;
      renderView();
    });
    return;
  }
}

function getRangeMonths() {
  if (viewMode !== 'range' || !rangeStart || !rangeEnd) return [];
  const i1 = sortedMonths.indexOf(rangeStart);
  const i2 = sortedMonths.indexOf(rangeEnd);
  if (i1 < 0 || i2 < 0) return [];
  const [a, b] = i1 <= i2 ? [i1, i2] : [i2, i1];
  return sortedMonths.slice(a, b + 1);
}

function renderView() {
  const labelEl = document.getElementById('rangeLabel');
  labelEl.textContent = '';

  if (viewMode === 'summary') {
    renderSummary();
    return;
  }

  if (viewMode === 'month') {
    if (!selectedMonth) return;
    labelEl.textContent = shortLabel(selectedMonth);
    renderMonthlyOnly(reportData.months[selectedMonth], selectedMonth);
    return;
  }

  // range
  const range = getRangeMonths();
  if (range.length === 0) {
    document.getElementById('trendChart').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px;">선택된 기간이 없습니다.</p>';
    document.getElementById('singleTop').innerHTML = '';
    document.getElementById('allplanTop').innerHTML = '';
    document.getElementById('categoryTopsSection').style.display = 'none';
    document.getElementById('categoryRankSection').style.display = 'none';
    renderKpiCards([]);
    return;
  }

  const lastMonth = range[range.length - 1];
  const lastData = reportData.months[lastMonth];
  if (!lastData) return;

  labelEl.textContent = `${shortLabel(range[0])} ~ ${shortLabel(range[range.length - 1])}`;

  const trendMonthNums = range.map(monthIndex);
  const slicedTrend = (lastData.monthlyTrend || []).filter(t => {
    const num = Number(String(t.month).replace(/[^0-9]/g, ''));
    return trendMonthNums.includes(num);
  });

  if (slicedTrend.length > 0) {
    renderTrendChart(slicedTrend);
    renderKpiCards(slicedTrend);
  } else {
    renderTrendChart(lastData.monthlyTrend);
    renderKpiCards(lastData.monthlyTrend);
  }

  renderTopList('singleTop', lastData.singleTop10);
  renderTopList('allplanTop', lastData.allplanTop10);
  document.getElementById('categoryRankSection').style.display = 'none';

  const cats = Object.keys(lastData.categoryTops);
  if (cats.length > 0) {
    document.getElementById('categoryTopsSection').style.display = 'block';
    const select = document.getElementById('categorySelect');
    select.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
    select.onchange = () => renderCategoryTop(lastData.categoryTops[select.value]);
    renderCategoryTop(lastData.categoryTops[cats[0]]);
  } else {
    document.getElementById('categoryTopsSection').style.display = 'none';
  }
}

function renderSummary() {
  const s = reportData.summary;
  const lastMonth = sortedMonths[sortedMonths.length - 1];
  if (lastMonth && reportData.months[lastMonth]) {
    const trend = reportData.months[lastMonth].monthlyTrend;
    renderTrendChart(trend);
    renderKpiCards(trend);
  }
  renderTopList('singleTop', s.singleTop10);
  renderTopList('allplanTop', s.allplanTop10);
  document.getElementById('categoryRankSection').style.display = 'block';
  renderHBarChart('categoryChart', s.categoryRank.map(c => ({ label: c.category, value: c.count })));
  renderHBarChart('subCategoryChart', s.categoryRank.map(c => ({ label: c.subCategory, value: c.subCount })).filter(c => c.label && c.value));
  document.getElementById('categoryTopsSection').style.display = 'none';
}

function renderMonthlyOnly(data, monthName) {
  if (!data) return;

  // Filter trend to only the selected month
  const targetIdx = monthIndex(monthName);
  const trend = (data.monthlyTrend || []).filter(t => {
    const num = Number(String(t.month).replace(/[^0-9]/g, ''));
    return num === targetIdx;
  });
  if (trend.length > 0) {
    renderTrendChart(trend);
    renderKpiCards(trend);
  } else {
    renderTrendChart(data.monthlyTrend || []);
    renderKpiCards(data.monthlyTrend || []);
  }

  renderTopList('singleTop', data.singleTop10);
  renderTopList('allplanTop', data.allplanTop10);
  document.getElementById('categoryRankSection').style.display = 'none';

  const cats = Object.keys(data.categoryTops);
  if (cats.length > 0) {
    document.getElementById('categoryTopsSection').style.display = 'block';
    const select = document.getElementById('categorySelect');
    select.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
    select.onchange = () => renderCategoryTop(data.categoryTops[select.value]);
    renderCategoryTop(data.categoryTops[cats[0]]);
  } else {
    document.getElementById('categoryTopsSection').style.display = 'none';
  }
}

function renderCategoryTop(items) {
  const container = document.getElementById('categoryTopList');
  if (!items || items.length === 0) {
    container.innerHTML = '<p style="color:#94a3b8;font-size:13px;">데이터 없음</p>';
    return;
  }
  const top = items.slice(0, 10);
  container.innerHTML = `<div class="top-list">` + top.map(item => `
    <div class="top-item">
      <div class="top-rank">${item.rank}</div>
      <div class="top-name" title="${item.name}">${item.name}</div>
      <div class="top-category">${item.subCategory || item.category}</div>
      <div class="top-count">${item.count.toLocaleString()}명</div>
    </div>
  `).join('') + `</div>`;
}

function renderKpiCards(trend) {
  const container = document.getElementById('kpiCards');
  if (!trend || !trend.length) { container.innerHTML = ''; return; }

  const last = trend[trend.length - 1];
  const totalNew = trend.reduce((s, t) => s + (t.newCount || 0), 0);
  const totalClosed = trend.reduce((s, t) => s + (t.closedCount || 0), 0);
  const net = totalNew - totalClosed;

  const hasNewClosed = totalNew > 0 || totalClosed > 0;

  container.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">현재 콘텐츠</div>
      <div class="kpi-value">${last.total.toLocaleString()}<span class="kpi-unit">개</span></div>
    </div>
    ${hasNewClosed ? `
    <div class="kpi-card kpi-card--up">
      <div class="kpi-label">신규 추가</div>
      <div class="kpi-value">+${totalNew.toLocaleString()}</div>
    </div>
    <div class="kpi-card kpi-card--down">
      <div class="kpi-label">종료/삭제</div>
      <div class="kpi-value">-${totalClosed.toLocaleString()}</div>
    </div>
    <div class="kpi-card ${net >= 0 ? 'kpi-card--up' : 'kpi-card--down'}">
      <div class="kpi-label">순증</div>
      <div class="kpi-value">${net >= 0 ? '+' : ''}${net.toLocaleString()}</div>
    </div>` : ''}
  `;
}

function renderTrendChart(trend) {
  const container = document.getElementById('trendChart');
  const maxVal = Math.max(...trend.map(t => t.total), 1);

  const barsHtml = trend.map((t, i) => {
    const h = Math.max((t.total / maxVal) * 180, 4);
    const prev = i > 0 ? trend[i - 1].total : null;
    let mom = '';
    if (prev !== null && prev > 0) {
      const pct = ((t.total - prev) / prev) * 100;
      const sign = pct > 0 ? '+' : '';
      const cls = pct > 0 ? 'mom-up' : (pct < 0 ? 'mom-down' : 'mom-flat');
      const arrow = pct > 0 ? '↑' : (pct < 0 ? '↓' : '·');
      mom = `<div class="mom-badge ${cls}">${arrow} ${sign}${pct.toFixed(1)}%</div>`;
    }
    return `
      <div class="bar-group"
        data-total="${t.total}"
        data-new="${t.newCount || 0}"
        data-closed="${t.closedCount || 0}"
        data-label="${t.month}">
        ${mom}
        <div class="bar-value">${t.total.toLocaleString()}</div>
        <div class="bar bar-total" style="height:${h}px;"></div>
        <div class="bar-label">${t.month}</div>
      </div>
    `;
  }).join('');

  const detailHtml = trend.map(t => {
    if (!t.newCount && !t.closedCount) return '';
    return `${t.month}: <span style="color:#10b981;">+${t.newCount}</span> / <span style="color:#ef4444;">-${t.closedCount}</span>`;
  }).filter(Boolean).join(' &nbsp;&nbsp; ');

  container.innerHTML = `
    <div class="bar-chart">${barsHtml}</div>
    <div class="chart-legend">
      <div class="legend-item"><div class="legend-dot" style="background:#3b82f6;"></div> 전체 콘텐츠</div>
    </div>
    ${detailHtml ? `<div style="text-align:center;font-size:12px;color:#64748b;margin-top:8px;">${detailHtml}</div>` : ''}
  `;

  // Tooltip setup
  const tooltip = document.getElementById('barTooltip');
  container.querySelectorAll('.bar-group').forEach(group => {
    group.addEventListener('mouseenter', () => {
      const total = parseInt(group.dataset.total || '0');
      const newC = parseInt(group.dataset.new || '0');
      const closedC = parseInt(group.dataset.closed || '0');
      const label = group.dataset.label || '';
      let html = `<div class="bt-label">${label}</div>`;
      html += `<div class="bt-row"><span class="bt-dot" style="background:#3b82f6;"></span> 총 <strong>${total.toLocaleString()}개</strong></div>`;
      if (newC || closedC) {
        html += `<div class="bt-row"><span class="bt-dot" style="background:#10b981;"></span> 신규 <strong>+${newC.toLocaleString()}</strong></div>`;
        html += `<div class="bt-row"><span class="bt-dot" style="background:#ef4444;"></span> 종료 <strong>-${closedC.toLocaleString()}</strong></div>`;
      }
      tooltip.innerHTML = html;
      tooltip.style.display = 'block';
      positionTooltip(group, tooltip);
    });
    group.addEventListener('mousemove', () => positionTooltip(group, tooltip));
    group.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });
}

function positionTooltip(anchor, tooltip) {
  const rect = anchor.getBoundingClientRect();
  const tw = tooltip.offsetWidth || 140;
  const th = tooltip.offsetHeight || 80;
  let left = rect.left + rect.width / 2 - tw / 2;
  let top = rect.top - th - 10;
  // Prevent going off screen edges
  left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
  if (top < 8) top = rect.bottom + 8;
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

function renderTopList(containerId, items) {
  const container = document.getElementById(containerId);
  if (!items || items.length === 0) {
    container.innerHTML = '<p style="color:#94a3b8;font-size:13px;">데이터 없음</p>';
    return;
  }
  container.innerHTML = `<div class="top-list">` + items.map((item, i) => `
    <div class="top-item" data-list="${containerId}" data-idx="${i}">
      <div class="top-rank">${item.rank}</div>
      <div class="top-name" title="${item.name}">${item.name}</div>
      <div class="top-category">${item.category}</div>
      <div class="top-count">${item.count.toLocaleString()}명</div>
    </div>
  `).join('') + `</div>`;

  container.querySelectorAll('.top-item').forEach(el => {
    el.addEventListener('click', () => showTopDetail(items[Number(el.dataset.idx)]));
  });
}

function showTopDetail(item) {
  const modal = document.getElementById('reportModal');
  const body = document.getElementById('reportModalBody');
  body.innerHTML = `
    <h3 class="rm-name">${escapeHtml(item.name)}</h3>
    <div class="rm-grid">
      <div><div class="rm-k">순위</div><div class="rm-v">#${item.rank}</div></div>
      <div><div class="rm-k">카테고리</div><div class="rm-v">${escapeHtml(item.category || '-')}</div></div>
      ${item.subCategory ? `<div><div class="rm-k">서브카테고리</div><div class="rm-v">${escapeHtml(item.subCategory)}</div></div>` : ''}
      <div><div class="rm-k">수강인원</div><div class="rm-v">${item.count.toLocaleString()}명</div></div>
    </div>`;
  modal.style.display = 'flex';
}

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.getElementById('reportModalClose').addEventListener('click', () => {
  document.getElementById('reportModal').style.display = 'none';
});
document.getElementById('reportModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

document.getElementById('exportReportBtn').addEventListener('click', async () => {
  if (typeof html2canvas === 'undefined') {
    alert('내보내기 라이브러리 로드에 실패했습니다.');
    return;
  }
  const target = document.getElementById('dashboard');
  const btn = document.getElementById('exportReportBtn');
  btn.disabled = true;
  btn.textContent = '생성 중...';
  try {
    const theme = document.documentElement.getAttribute('data-theme');
    const bg = theme === 'dark' ? '#0b1220' : '#ffffff';
    const fullWidth = Math.max(target.scrollWidth, target.offsetWidth, 1100);
    const fullHeight = Math.max(target.scrollHeight, target.offsetHeight);
    const canvas = await html2canvas(target, {
      backgroundColor: bg,
      scale: 2,
      useCORS: true,
      width: fullWidth,
      height: fullHeight,
      windowWidth: fullWidth,
      windowHeight: fullHeight,
    });
    const link = document.createElement('a');
    let suffix = '전체';
    if (viewMode === 'month' && selectedMonth) suffix = shortLabel(selectedMonth);
    else if (viewMode === 'range' && rangeStart && rangeEnd) suffix = `${shortLabel(rangeStart)}_${shortLabel(rangeEnd)}`;
    link.download = `콘텐츠현황_${suffix}_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    alert('이미지 저장 실패: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '현재 뷰 PNG 저장';
  }
});

document.getElementById('exportExcelBtn').addEventListener('click', async () => {
  const btn = document.getElementById('exportExcelBtn');
  btn.disabled = true;
  btn.textContent = '생성 중...';
  try {
    const res = await fetch('/api/report/export');
    if (!res.ok) throw new Error('서버 오류');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    let suffix = '전체';
    if (viewMode === 'month' && selectedMonth) suffix = shortLabel(selectedMonth);
    else if (viewMode === 'range' && rangeStart && rangeEnd) suffix = `${shortLabel(rangeStart)}_${shortLabel(rangeEnd)}`;
    a.download = `콘텐츠현황_${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Excel 저장 실패: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Excel 저장';
  }
});

function renderHBarChart(containerId, items) {
  const container = document.getElementById(containerId);
  const maxVal = Math.max(...items.map(i => i.value), 1);

  container.innerHTML = `<div class="h-bar-list">` + items.map(item => {
    const pct = (item.value / maxVal) * 100;
    return `
      <div class="h-bar-item">
        <div class="h-bar-label">${item.label}</div>
        <div class="h-bar-track">
          <div class="h-bar-fill" style="width:${pct}%;">
            ${pct > 15 ? `<span>${item.value.toLocaleString()}</span>` : ''}
          </div>
        </div>
        <div class="h-bar-value">${item.value.toLocaleString()}</div>
      </div>
    `;
  }).join('') + `</div>`;
}

loadReport();
