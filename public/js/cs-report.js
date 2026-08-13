(function () {
  const API_DASHBOARD = '/api/cs-report/dashboard';
  const API_UPLOAD = '/api/cs-report/upload';
  const API_MONTHS = '/api/cs-report/months';

  const els = {
    fileInput: document.getElementById('csFileInput'),
    fileNames: document.getElementById('csFileNames'),
    uploadArea: document.getElementById('csUploadArea'),
    password: document.getElementById('csPassword'),
    uploadBtn: document.getElementById('csUploadBtn'),
    uploadStatus: document.getElementById('csUploadStatus'),
    loading: document.getElementById('csLoading'),
    errorBox: document.getElementById('csErrorBox'),
    content: document.getElementById('csContent'),
    dashboardTitle: document.getElementById('csDashboardTitle'),
    updatedAt: document.getElementById('csUpdatedAt'),
    monthLabel: document.getElementById('csMonthLabel'),
    monthPrev: document.getElementById('csMonthPrev'),
    monthNext: document.getElementById('csMonthNext'),
    statTotalLabel: document.getElementById('csStatTotalLabel'),
    statTotal: document.getElementById('csStatTotal'),
    statDiffTile: document.getElementById('csStatDiffTile'),
    statDiffLabel: document.getElementById('csStatDiffLabel'),
    statDiff: document.getElementById('csStatDiff'),
    statPrevLabel: document.getElementById('csStatPrevLabel'),
    statPrev: document.getElementById('csStatPrev'),
    insightTabs: document.getElementById('csInsightTabs'),
    insightBody: document.getElementById('csInsightBody'),
    busiestDay: document.getElementById('csBusiestDay'),
    calendar: document.getElementById('csCalendar'),
    weekly: document.getElementById('csWeekly'),
    tagRankList: document.getElementById('csTagRankList'),
    tagTrendRange: document.getElementById('csTagTrendRange'),
    tagOmitted: document.getElementById('csTagOmitted'),
    companyRankList: document.getElementById('csCompanyRankList'),
    top3List: document.getElementById('csTop3List'),
    resolutionTitle: document.getElementById('csResolutionTitle'),
    resolutionDesc: document.getElementById('csResolutionDesc'),
    resolutionCurrent: document.getElementById('csResolutionCurrent'),
    resolutionHistory: document.getElementById('csResolutionHistory'),
    archiveLinks: document.getElementById('csArchiveLinks'),
  };

  let selectedFiles = [];
  let currentMonth = null;
  let currentDashboard = null;
  let activeTab = 'repeat';
  let patternMode = 'monthly';
  let trendChart = null, tagTrendChart = null, companyTrendChart = null;

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function thisMonthStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function shiftMonth(month, delta) {
    const [y, m] = month.split('-').map(Number);
    const total = (y * 12 + (m - 1)) + delta;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    return `${ny}-${String(nm).padStart(2, '0')}`;
  }

  // --- Upload ---------------------------------------------------------

  function updateFileUI() {
    if (!selectedFiles.length) {
      els.fileNames.textContent = '';
      els.uploadBtn.disabled = true;
      return;
    }
    els.fileNames.textContent = selectedFiles.map(f => f.name).join(', ');
    els.uploadBtn.disabled = false;
  }

  els.fileInput.addEventListener('change', () => {
    selectedFiles = Array.from(els.fileInput.files || []);
    updateFileUI();
  });

  ['dragover', 'dragenter'].forEach(evt => {
    els.uploadArea.addEventListener(evt, (e) => { e.preventDefault(); els.uploadArea.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(evt => {
    els.uploadArea.addEventListener(evt, (e) => { e.preventDefault(); els.uploadArea.classList.remove('dragover'); });
  });
  els.uploadArea.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files || []).filter(f => /\.xlsx$/i.test(f.name));
    if (files.length) {
      selectedFiles = files;
      updateFileUI();
    }
  });

  els.uploadBtn.addEventListener('click', async () => {
    if (!selectedFiles.length) return;
    els.uploadBtn.disabled = true;
    els.uploadStatus.className = 'status loading';
    els.uploadStatus.style.display = 'block';
    els.uploadStatus.textContent = `${selectedFiles.length}개 파일을 순서대로 집계하는 중...`;

    const form = new FormData();
    selectedFiles.forEach(f => form.append('files', f, f.name));
    form.append('password', els.password.value || '');

    try {
      const res = await fetch(API_UPLOAD, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '업로드 실패');

      els.uploadStatus.className = 'status success';
      const totalRows = data.files.reduce((s, f) => s + f.rows, 0);
      els.uploadStatus.textContent = `저장 완료: ${data.files.length}개 파일, ${totalRows.toLocaleString()}건 (${data.months.join(', ')})`;

      selectedFiles = [];
      els.fileInput.value = '';
      updateFileUI();

      const latest = data.months.sort().slice(-1)[0];
      await loadDashboard(latest || currentMonth || thisMonthStr());
    } catch (err) {
      els.uploadStatus.className = 'status error';
      els.uploadStatus.textContent = '업로드 실패: ' + err.message;
    } finally {
      els.uploadBtn.disabled = selectedFiles.length === 0;
    }
  });

  // --- Rendering --------------------------------------------------------

  function renderSummary(d) {
    els.dashboardTitle.textContent = `${d.month} CS 대시보드`;
    els.updatedAt.textContent = `${new Date(d.updatedAt).toLocaleString('ko-KR')} 업데이트`;
    els.monthLabel.textContent = d.month;

    els.statTotalLabel.textContent = `총 문의 (${Number(d.month.split('-')[1])}월)`;
    els.statTotal.textContent = d.summary.totalCount.toLocaleString();

    els.statPrevLabel.textContent = `${d.summary.prevMonth} 총 문의`;
    els.statPrev.textContent = d.summary.prevCount.toLocaleString();

    els.statDiffLabel.textContent = `지난달(${d.summary.prevMonth}) 대비`;
    els.statDiffTile.classList.remove('cs-tile-up', 'cs-tile-down');
    els.statDiff.classList.remove('cs-up', 'cs-down');
    if (d.summary.diffPct === null) {
      els.statDiff.textContent = '데이터 없음';
    } else {
      const arrow = d.summary.diff > 0 ? '▲' : d.summary.diff < 0 ? '▼' : '-';
      const cls = d.summary.diff > 0 ? 'cs-up' : d.summary.diff < 0 ? 'cs-down' : '';
      const tileCls = d.summary.diff > 0 ? 'cs-tile-up' : d.summary.diff < 0 ? 'cs-tile-down' : '';
      if (cls) els.statDiff.classList.add(cls);
      if (tileCls) els.statDiffTile.classList.add(tileCls);
      els.statDiff.textContent = `${arrow}${Math.abs(d.summary.diff)}건 (${d.summary.diffPct >= 0 ? '+' : ''}${d.summary.diffPct.toFixed(1)}%)`;
    }
  }

  function renderTrendChart(d) {
    const ctx = document.getElementById('csTrendChart');
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: d.trend.map(t => t.month.slice(5) + '월'),
        datasets: [{
          data: d.trend.map(t => t.count),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.1)',
          fill: true,
          tension: 0.25,
          pointRadius: 4,
          pointBackgroundColor: '#6366f1',
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  function renderInsightTabs() {
    [...els.insightTabs.querySelectorAll('.cs-tab')].forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === activeTab);
    });
  }

  function renderInsightBody(d) {
    const ins = d.insights;
    let html = '';
    if (activeTab === 'repeat') {
      html += '<p class="cs-insight-desc">최근 몇 달 연속 Top3에 든 문의 유형이에요. 반복되는 문제는 FAQ화·자동응답 UX 개선 우선순위로 고려해보세요.</p>';
      if (ins.repeatProblem) {
        html += `<div class="cs-insight-card">
          <span><span class="cs-insight-badge">${ins.repeatProblem.streak}개월 연속</span>${escapeHtml(ins.repeatProblem.tag)}</span>
          <span class="cs-insight-count">${ins.repeatProblem.count}건</span>
        </div>`;
      } else {
        html += '<p class="cs-insight-empty">2개월 연속 Top3를 유지한 문의 유형이 없어요.</p>';
      }
    } else if (activeTab === 'anomaly') {
      html += '<p class="cs-insight-desc">다른 기업 대비 특정 문의 유형이 유독 몰린 기업이에요. 계정/설정 특이사항일 가능성이 있어요.</p>';
      if (ins.companyAnomalies.length) {
        ins.companyAnomalies.forEach(a => {
          html += `<div class="cs-insight-card cs-insight-danger">
            <span>기업(서브태그)/${escapeHtml(a.companyName)}<br>
              <span class="cs-muted-inline">'${escapeHtml(a.tag)}' 비중 ${a.companySharePct}% (전체 평균 ${a.globalSharePct}%)</span>
            </span>
            <span class="cs-insight-count">${a.companyCount}/${a.companyTotal}건</span>
          </div>`;
        });
      } else {
        html += '<p class="cs-insight-empty">두드러진 기업 이상치가 없어요.</p>';
      }
    } else if (activeTab === 'resolution') {
      html += `<p class="cs-insight-desc">${ins.resolutionTrend.targetTag ? escapeHtml(ins.resolutionTrend.targetTag) + ' 문의가 매달 어떤 경로로 해결되는지 추이예요.' : '집계할 대표 태그가 없어요.'}</p>`;
      ins.resolutionTrend.months.forEach(m => {
        html += `<div class="cs-insight-card">
          <span>${m.month}<br>
            <span class="cs-muted-inline">계정정보변경 ${m.change} · 비밀번호초기화 ${m.reset} · 확인만 ${m.check}</span>
          </span>
          <span class="cs-insight-count">${m.resolved}/${m.total}건 해결</span>
        </div>`;
      });
    } else if (activeTab === 'weekday') {
      html += '<p class="cs-insight-desc">특정 요일에 문의가 뚜렷하게 몰리면 인력 배치나 자동응답 강화 시점 판단에 참고하세요.</p>';
      if (ins.weekdayInsight) {
        html += `<p><b>${escapeHtml(ins.weekdayInsight.weekdays)}요일</b>에 문의가 평균(${ins.weekdayInsight.overallAvg}건)보다 뚜렷하게 많아요 (최대 ${ins.weekdayInsight.maxCount}건). 이 요일에 상담 인력을 더 배치하거나 자동응답을 강화하면 좋아요.</p>`;
      } else {
        html += '<p class="cs-insight-empty">특정 요일에 뚜렷하게 몰리는 패턴이 없어요.</p>';
      }
    } else if (activeTab === 'surge') {
      html += '<div class="cs-insight-list"><b>신규 등장</b></div>';
      if (ins.newTags.length) {
        html += ins.newTags.map(t => `<div class="cs-insight-card"><span>${escapeHtml(t.tag)}</span><span class="cs-insight-count">${t.count}건</span></div>`).join('');
      } else {
        html += '<p class="cs-insight-empty">이번 달 새로 등장한 유형이 없어요.</p>';
      }
      html += '<div class="cs-insight-list" style="margin-top:14px;"><b>급증 (전월 대비 1.5배 이상)</b></div>';
      if (ins.surgingTags.length) {
        html += ins.surgingTags.map(t => `<div class="cs-insight-card"><span>${escapeHtml(t.tag)}</span><span class="cs-insight-count">${t.from}→${t.to}건 (${t.ratio}배)</span></div>`).join('');
      } else {
        html += '<p class="cs-insight-empty">전월 대비 1.5배 이상 급증한 유형이 없어요.</p>';
      }
    }
    els.insightBody.innerHTML = html;
  }

  const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

  function renderCalendar(d) {
    const pattern = d.dailyPattern;
    els.busiestDay.textContent = pattern.length
      ? `가장 문의가 많았던 날: ${d.month}-${String(pattern.find(p => p.count === Math.max(...pattern.map(x => x.count))).day).padStart(2, '0')} (${Math.max(...pattern.map(x => x.count))}건)`
      : '';

    const maxCount = Math.max(1, ...pattern.map(p => p.count));
    let html = WEEKDAY_LABELS.map(w => `<div class="cs-cal-dow">${w}</div>`).join('');
    const leadingEmpty = pattern.length ? pattern[0].weekday : 0;
    for (let i = 0; i < leadingEmpty; i++) html += '<div class="cs-cal-cell cs-cal-empty"></div>';
    pattern.forEach(p => {
      const intensity = p.count / maxCount;
      const bg = p.count === 0 ? '' : `background: rgba(59,130,246,${0.12 + intensity * 0.7}); color:${intensity > 0.55 ? '#fff' : ''};`;
      html += `<div class="cs-cal-cell" style="${bg}"><span>${p.day}</span><span class="cs-cal-count">${p.count}</span></div>`;
    });
    els.calendar.innerHTML = html;

    // weekly aggregation (bucket by 7-day chunks starting day 1)
    const weeks = [];
    for (let i = 0; i < pattern.length; i += 7) {
      const chunk = pattern.slice(i, i + 7);
      weeks.push({ label: `${chunk[0].day}~${chunk[chunk.length - 1].day}일`, count: chunk.reduce((s, p) => s + p.count, 0) });
    }
    const maxWeek = Math.max(1, ...weeks.map(w => w.count));
    els.weekly.innerHTML = weeks.map(w => `
      <div class="cs-weekly-row">
        <div class="cs-weekly-label">${w.label}</div>
        <div class="cs-weekly-bar-wrap"><div class="cs-weekly-bar" style="width:${(w.count / maxWeek) * 100}%"></div></div>
        <div class="cs-weekly-count">${w.count}</div>
      </div>
    `).join('');
  }

  function renderTagRanking(d) {
    els.tagRankList.innerHTML = d.tagRanking.map((t, i) => `
      <li><span class="cs-rank-num">${i + 1}</span>
        <span class="cs-rank-main"><span class="cs-rank-tag">${escapeHtml(t.tag)}</span></span>
        <span class="cs-rank-count">${t.count}건</span>
      </li>
    `).join('') || '<li class="cs-insight-empty">데이터가 없어요.</li>';

    els.tagTrendRange.textContent = `${d.tagTrend.months[0]} ~ ${d.tagTrend.months[d.tagTrend.months.length - 1]} 비교`;
    els.tagOmitted.textContent = d.tagTrend.omittedCount > 0
      ? `그 외 ${d.tagTrend.omittedSum}건은 생략했어요 (상위 5개만 표시).`
      : '';

    const ctx = document.getElementById('csTagTrendChart');
    if (tagTrendChart) tagTrendChart.destroy();
    const palette = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#0ea5e9'];
    tagTrendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: d.tagTrend.months.map(m => m.slice(5) + '월'),
        datasets: d.tagTrend.series.map((s, i) => ({
          label: `${s.tag} (${s.counts[s.counts.length - 1]})`,
          data: s.counts,
          borderColor: palette[i % palette.length],
          backgroundColor: palette[i % palette.length],
          tension: 0.25,
        })),
      },
      options: {
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  function renderCompanyRanking(d) {
    els.companyRankList.innerHTML = d.companyRanking.map((c, i) => `
      <li><span class="cs-rank-num">${i + 1}</span>
        <span class="cs-rank-main">
          <span class="cs-rank-tag">기업(서브태그)/${escapeHtml(c.companyName)}</span>
          <div class="cs-company-sub">${c.topSubTags.map(t => `<span>${escapeHtml(t.tag)} ${t.count}건</span>`).join('')}</div>
        </span>
        <span class="cs-rank-count">${c.count}건</span>
      </li>
    `).join('') || '<li class="cs-insight-empty">기업 태그 데이터가 없어요.</li>';

    const ctx = document.getElementById('csCompanyTrendChart');
    if (companyTrendChart) companyTrendChart.destroy();
    const palette = ['#6366f1', '#ec4899', '#10b981', '#f59e0b'];
    companyTrendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: d.companyTrend.months.map(m => m.slice(5) + '월'),
        datasets: d.companyTrend.series.map((s, i) => ({
          label: `${s.companyName} (${s.counts[s.counts.length - 1]})`,
          data: s.counts,
          borderColor: palette[i % palette.length],
          backgroundColor: palette[i % palette.length],
          tension: 0.25,
        })),
      },
      options: {
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  function renderTop3(d) {
    els.top3List.innerHTML = d.top3.map((t, i) => `
      <li><span class="cs-rank-num">${i + 1}</span>
        <span class="cs-rank-main"><span class="cs-rank-tag">${escapeHtml(t.tag)}</span></span>
        <span class="cs-rank-count">${t.count}건</span>
      </li>
    `).join('') || '<li class="cs-insight-empty">데이터가 없어요.</li>';
  }

  function renderResolution(d) {
    const rt = d.insights.resolutionTrend;
    if (!rt.targetTag) {
      els.resolutionTitle.textContent = '문의 해결 추이';
      els.resolutionDesc.textContent = '';
      els.resolutionCurrent.innerHTML = '<span class="cs-insight-empty">집계할 대표 태그가 없어요.</span>';
      els.resolutionHistory.innerHTML = '';
      return;
    }
    els.resolutionTitle.textContent = `${rt.targetTag} → 어떻게 해결됐는지`;
    els.resolutionDesc.textContent = `${rt.targetTag} 문의 중, 계정정보 확인/변경·비밀번호초기화 태그가 같이 붙은 건수예요.`;

    const current = rt.months[rt.months.length - 1];
    els.resolutionCurrent.innerHTML = `
      <span class="cs-res-fraction">${current.resolved} / ${current.total}건</span>
      <div class="cs-res-breakdown">
        <span>계정정보 변경으로 해결<br><b>${current.change}</b></span>
        <span>비밀번호 초기화로 해결<br><b>${current.reset}</b></span>
        <span>계정정보 확인만으로 해결<br><b>${current.check}</b></span>
      </div>
    `;

    els.resolutionHistory.innerHTML = `
      <table>
        <thead><tr><th>월</th><th>해결</th><th>계정정보변경</th><th>비밀번호초기화</th><th>확인만</th></tr></thead>
        <tbody>
          ${rt.months.map(m => `<tr><td>${m.month}</td><td>${m.resolved}/${m.total}</td><td>${m.change}</td><td>${m.reset}</td><td>${m.check}</td></tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  function renderArchive(d) {
    const links = [shiftMonth(d.month, -1), shiftMonth(d.month, -2)];
    els.archiveLinks.innerHTML = links.map(m => `<button class="cs-archive-link" data-month="${m}">${m}</button>`).join('');
  }

  function render(d) {
    currentDashboard = d;
    renderSummary(d);
    renderTrendChart(d);
    renderInsightTabs();
    renderInsightBody(d);
    renderCalendar(d);
    renderTagRanking(d);
    renderCompanyRanking(d);
    renderTop3(d);
    renderResolution(d);
    renderArchive(d);

    els.calendar.style.display = patternMode === 'monthly' ? 'grid' : 'none';
    els.weekly.style.display = patternMode === 'weekly' ? 'flex' : 'none';
  }

  async function loadDashboard(month) {
    currentMonth = month;
    els.loading.style.display = 'block';
    els.errorBox.style.display = 'none';
    els.content.style.display = 'none';
    try {
      const res = await fetch(`${API_DASHBOARD}?month=${encodeURIComponent(month)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      render(data);
      els.loading.style.display = 'none';
      els.content.style.display = 'block';
    } catch (err) {
      els.loading.style.display = 'none';
      els.errorBox.textContent = '데이터를 불러오지 못했습니다: ' + err.message;
      els.errorBox.style.display = 'block';
    }
  }

  // --- Events ------------------------------------------------------------

  els.monthPrev.addEventListener('click', () => loadDashboard(shiftMonth(currentMonth, -1)));
  els.monthNext.addEventListener('click', () => loadDashboard(shiftMonth(currentMonth, 1)));

  els.insightTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.cs-tab');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    renderInsightTabs();
    renderInsightBody(currentDashboard);
  });

  document.querySelectorAll('.cs-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      patternMode = btn.dataset.mode;
      document.querySelectorAll('.cs-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
      els.calendar.style.display = patternMode === 'monthly' ? 'grid' : 'none';
      els.weekly.style.display = patternMode === 'weekly' ? 'flex' : 'none';
    });
  });

  els.archiveLinks.addEventListener('click', (e) => {
    const btn = e.target.closest('.cs-archive-link');
    if (btn) loadDashboard(btn.dataset.month);
  });

  // --- Init ---------------------------------------------------------------

  async function init() {
    try {
      const res = await fetch(API_MONTHS);
      const data = await res.json();
      const latest = (data.months || []).sort().slice(-1)[0];
      await loadDashboard(latest || thisMonthStr());
    } catch (err) {
      await loadDashboard(thisMonthStr());
    }
  }

  init();
})();
