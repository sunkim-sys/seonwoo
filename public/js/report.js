let reportData = null;
let currentMonth = 'summary';

async function loadReport() {
  try {
    const res = await fetch('/api/report');
    reportData = await res.json();
    document.getElementById('loading').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    buildMonthSelector();
    renderView();
  } catch (err) {
    document.getElementById('loading').textContent = '데이터 로드 실패: ' + err.message;
  }
}

function buildMonthSelector() {
  const container = document.getElementById('monthSelector');
  let html = `<button class="month-btn active" data-month="summary">전체 누적</button>`;
  reportData.availableMonths.forEach(name => {
    const label = name.replace(' 레포트', '');
    html += `<button class="month-btn" data-month="${name}">${label}</button>`;
  });
  container.innerHTML = html;

  container.querySelectorAll('.month-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.month-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMonth = btn.dataset.month;
      renderView();
    });
  });
}

function renderView() {
  if (currentMonth === 'summary') {
    renderSummary();
  } else {
    renderMonthly(reportData.months[currentMonth]);
  }
}

function renderSummary() {
  const s = reportData.summary;

  // Use first monthly sheet for trend
  const firstMonth = reportData.availableMonths[0];
  if (firstMonth && reportData.months[firstMonth]) {
    renderTrendChart(reportData.months[firstMonth].monthlyTrend);
  }

  renderTopList('singleTop', s.singleTop10);
  renderTopList('allplanTop', s.allplanTop10);

  // Category rank (summary only)
  document.getElementById('categoryRankSection').style.display = 'block';
  renderHBarChart('categoryChart', s.categoryRank.map(c => ({ label: c.category, value: c.count })));
  renderHBarChart('subCategoryChart', s.categoryRank.map(c => ({ label: c.subCategory, value: c.subCount })).filter(c => c.label && c.value));

  // Hide category tops for summary
  document.getElementById('categoryTopsSection').style.display = 'none';
}

function renderMonthly(data) {
  if (!data) return;

  if (data.monthlyTrend.length > 0) {
    renderTrendChart(data.monthlyTrend);
  }

  renderTopList('singleTop', data.singleTop10);
  renderTopList('allplanTop', data.allplanTop10);

  // Hide summary-only category rank
  document.getElementById('categoryRankSection').style.display = 'none';

  // Show category TOP 50s
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

  // Show top 10 only
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

  const barsHtml = trend.map(t => {
    const h = Math.max((t.total / maxVal) * 180, 4);
    return `
      <div class="bar-group">
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
  container.innerHTML = `<div class="top-list">` + items.map(item => `
    <div class="top-item">
      <div class="top-rank">${item.rank}</div>
      <div class="top-name" title="${item.name}">${item.name}</div>
      <div class="top-category">${item.category}</div>
      <div class="top-count">${item.count.toLocaleString()}명</div>
    </div>
  `).join('') + `</div>`;
}

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
