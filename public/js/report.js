let reportData = null;
let viewMode = 'summary'; // summary | month | quarter | range
let selectedMonth = null;
let selectedQuarter = null;
let rangeStart = null;
let rangeEnd = null;

async function loadReport() {
  try {
    const res = await fetch('/api/report');
    reportData = await res.json();
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
  // "2026년 03월 레포트" → 3
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
      // Reset secondary state when switching tabs
      selectedMonth = null;
      selectedQuarter = null;
      rangeStart = null;
      rangeEnd = null;
      renderSubSelector();
      renderView();
    });
  });
}

function renderSubSelector() {
  const container = document.getElementById('subSelector');
  const months = reportData.availableMonths || [];

  if (viewMode === 'summary') {
    container.innerHTML = '';
    return;
  }

  if (viewMode === 'month') {
    container.innerHTML = months.map((name, i) => `
      <button class="sub-btn ${selectedMonth === name ? 'active' : ''}" data-month="${name}">${shortLabel(name)}</button>
    `).join('');
    container.querySelectorAll('.sub-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedMonth = btn.dataset.month;
        renderSubSelector();
        renderView();
      });
    });
    if (!selectedMonth && months.length > 0) {
      selectedMonth = months[months.length - 1];
      renderSubSelector();
    }
    return;
  }

  if (viewMode === 'quarter') {
    // Group by year, render Q1~Q4 buttons per year
    const years = [...new Set(months.map(monthYear))].filter(Boolean).sort();
    let html = '';
    years.forEach(year => {
      html += `<div class="quarter-group"><span class="quarter-year">${year}년</span>`;
      [1, 2, 3, 4].forEach(q => {
        const start = (q - 1) * 3 + 1;
        const end = q * 3;
        const has = months.some(m => monthYear(m) === year && monthIndex(m) >= start && monthIndex(m) <= end);
        const key = `${year}-Q${q}`;
        html += `<button class="sub-btn ${selectedQuarter === key ? 'active' : ''} ${has ? '' : 'disabled'}" data-q="${key}" ${has ? '' : 'disabled'}>Q${q}</button>`;
      });
      html += `</div>`;
    });
    container.innerHTML = html;
    container.querySelectorAll('.sub-btn:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedQuarter = btn.dataset.q;
        renderSubSelector();
        renderView();
      });
    });
    return;
  }

  if (viewMode === 'range') {
    const opts = months.map(m => `<option value="${m}">${shortLabel(m)}</option>`).join('');
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
    if (rangeStart) startSel.value = rangeStart;
    if (rangeEnd) endSel.value = rangeEnd;
    else endSel.value = months[months.length - 1];

    document.getElementById('applyRangeBtn').addEventListener('click', () => {
      rangeStart = startSel.value;
      rangeEnd = endSel.value;
      renderView();
    });
    return;
  }
}

function getRangeMonths() {
  // Returns ordered array of monthly sheet names within current view's range.
  const months = reportData.availableMonths || [];
  if (viewMode === 'summary' || viewMode === 'month') return [];
  if (viewMode === 'quarter' && selectedQuarter) {
    const [yStr, qStr] = selectedQuarter.split('-Q');
    const year = Number(yStr);
    const q = Number(qStr);
    const start = (q - 1) * 3 + 1;
    const end = q * 3;
    return months.filter(m => monthYear(m) === year && monthIndex(m) >= start && monthIndex(m) <= end);
  }
  if (viewMode === 'range' && rangeStart && rangeEnd) {
    const i1 = months.indexOf(rangeStart);
    const i2 = months.indexOf(rangeEnd);
    if (i1 < 0 || i2 < 0) return [];
    const [a, b] = i1 <= i2 ? [i1, i2] : [i2, i1];
    return months.slice(a, b + 1);
  }
  return [];
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
    renderMonthly(reportData.months[selectedMonth]);
    return;
  }

  // quarter / range
  const range = getRangeMonths();
  if (range.length === 0) {
    document.getElementById('trendChart').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px;">선택된 기간이 없습니다.</p>';
    document.getElementById('singleTop').innerHTML = '';
    document.getElementById('allplanTop').innerHTML = '';
    document.getElementById('categoryTopsSection').style.display = 'none';
    document.getElementById('categoryRankSection').style.display = 'none';
    if (viewMode === 'quarter') labelEl.textContent = '분기를 선택하세요';
    return;
  }

  const lastMonth = range[range.length - 1];
  const lastData = reportData.months[lastMonth];
  if (!lastData) return;

  // Range label
  const startLabel = shortLabel(range[0]);
  const endLabel = shortLabel(range[range.length - 1]);
  if (viewMode === 'quarter') {
    labelEl.textContent = `${selectedQuarter.replace('-', '년 ')} (${startLabel} ~ ${endLabel})`;
  } else {
    labelEl.textContent = `${startLabel} ~ ${endLabel}`;
  }

  // Trend = slice of last month's monthlyTrend by month range
  const trendMonths = range.map(name => monthIndex(name));
  const slicedTrend = lastData.monthlyTrend.filter(t => {
    const num = Number(t.month.replace(/[^0-9]/g, ''));
    return trendMonths.includes(num);
  });

  if (slicedTrend.length > 0) {
    renderTrendChart(slicedTrend);
  } else {
    renderTrendChart(lastData.monthlyTrend);
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
  const firstMonth = reportData.availableMonths[0];
  if (firstMonth && reportData.months[firstMonth]) {
    renderTrendChart(reportData.months[firstMonth].monthlyTrend);
  }

  renderTopList('singleTop', s.singleTop10);
  renderTopList('allplanTop', s.allplanTop10);

  document.getElementById('categoryRankSection').style.display = 'block';
  renderHBarChart('categoryChart', s.categoryRank.map(c => ({ label: c.category, value: c.count })));
  renderHBarChart('subCategoryChart', s.categoryRank.map(c => ({ label: c.subCategory, value: c.subCount })).filter(c => c.label && c.value));

  document.getElementById('categoryTopsSection').style.display = 'none';
}

function renderMonthly(data) {
  if (!data) return;

  if (data.monthlyTrend.length > 0) {
    renderTrendChart(data.monthlyTrend);
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
      <div class="bar-group">
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
    else if (viewMode === 'quarter' && selectedQuarter) suffix = selectedQuarter;
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
