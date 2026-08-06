(function () {
  let file = null;
  let charts = {};

  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const fileNameEl = document.getElementById('fileName');
  const companyInput = document.getElementById('companyInput');
  const periodInput = document.getElementById('periodInput');
  const generateBtn = document.getElementById('generateBtn');
  const statusEl = document.getElementById('status');
  const erReport = document.getElementById('erReport');

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + (type || '');
    statusEl.style.display = msg ? 'block' : 'none';
  }

  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });
  function setFile(f) {
    file = f;
    fileNameEl.textContent = f.name;
    generateBtn.disabled = false;
  }

  function fmtHours(h) { return `${h.toLocaleString('ko-KR')}h`; }

  function renderBarList(container, items, valueFn, maxOverride) {
    const max = maxOverride || Math.max(...items.map(valueFn), 1);
    container.innerHTML = items.map(item => `
      <div class="er-bar-row">
        <div class="er-bar-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <div class="er-bar-track"><div class="er-bar-fill" style="width:${Math.round((valueFn(item) / max) * 100)}%"></div></div>
        <div class="er-bar-val">${item._label}</div>
      </div>
    `).join('');
  }

  function renderReport(report) {
    document.getElementById('erTitle').textContent = `${report.company} 수강 리포트`;
    document.getElementById('erMeta').textContent = report.periodLabel || '';

    // 01 KPI
    const k = report.kpis;
    document.getElementById('kpiActiveUsers').textContent = `${k.activeUsers.toLocaleString('ko-KR')}명`;
    document.getElementById('kpiActiveUsersSub').textContent = `학습과정 ${k.courseGroupCount}개에서 학습`;
    document.getElementById('kpiTotalHours').textContent = fmtHours(k.totalHours);
    document.getElementById('kpiAvgHours').textContent = fmtHours(k.avgHoursPerUser);
    document.getElementById('kpiCompleted').textContent = `${k.completedCount.toLocaleString('ko-KR')}명`;
    document.getElementById('kpiCompletedSub').textContent = `수료율 ${k.completionRate}%`;

    // 02 학습과정별 비교
    if (charts.courseGroup) charts.courseGroup.destroy();
    charts.courseGroup = new Chart(document.getElementById('courseGroupChart'), {
      type: 'bar',
      data: {
        labels: report.courseGroups.map(g => g.name),
        datasets: [{ label: '학습자 수', data: report.courseGroups.map(g => g.activeUsers), backgroundColor: '#6366f1' }],
      },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } },
    });
    document.getElementById('courseGroupBody').innerHTML = report.courseGroups.map(g => `
      <tr>
        <td>${escapeHtml(g.name)}</td>
        <td>${g.activeUsers}명</td>
        <td>${g.share}%</td>
        <td>${g.courseCount}개</td>
        <td>${fmtHours(g.totalHours)}</td>
        <td>${fmtHours(g.avgHours)}</td>
        <td>${g.completedCount}명</td>
        <td>${g.completionRate}%</td>
      </tr>
    `).join('');

    // 03 카테고리별 시청시간
    document.getElementById('categorySub').textContent = `전체 ${fmtHours(report.categoryStats.totalHours)} · ${report.categoryStats.categoryCount}개 카테고리 (상위 ${report.categoryStats.categories.length}개)`;
    renderBarList(
      document.getElementById('categoryBarList'),
      report.categoryStats.categories.map(c => ({ ...c, _label: `${fmtHours(c.hours)} · ${c.pct}% · ${c.headcount}명` })),
      c => c.hours
    );

    // 04 수강 진도 분포
    if (charts.progress) charts.progress.destroy();
    document.getElementById('progressSub').textContent = `총 ${report.progressDistribution.total.toLocaleString('ko-KR')}개의 (학습자 × 강의) 행 분포`;
    charts.progress = new Chart(document.getElementById('progressChart'), {
      type: 'bar',
      data: {
        labels: report.progressDistribution.buckets.map(b => b.label),
        datasets: [{ label: '건수', data: report.progressDistribution.buckets.map(b => b.count), backgroundColor: ['#94a3b8', '#94a3b8', '#94a3b8', '#818cf8', '#6366f1'] }],
      },
      options: { plugins: { legend: { display: false } } },
    });

    // 05 부서별 분포
    renderBarList(
      document.getElementById('deptBarList'),
      report.departmentDistribution.groups.map(g => ({ ...g, _label: `${g.headcount}명 · ${fmtHours(g.hours)}` })),
      g => g.headcount
    );
    document.getElementById('deptOtherNote').textContent = report.departmentDistribution.otherGroupCount
      ? `외 ${report.departmentDistribution.otherGroupCount}개 부서 (${report.departmentDistribution.otherCount}명)` : '';

    // 06 직급별 분포
    if (charts.position) charts.position.destroy();
    charts.position = new Chart(document.getElementById('positionChart'), {
      type: 'bar',
      data: {
        labels: report.positionDistribution.groups.map(g => g.name),
        datasets: [{ label: '학습자 수', data: report.positionDistribution.groups.map(g => g.headcount), backgroundColor: '#ec4899' }],
      },
      options: { plugins: { legend: { display: false } } },
    });

    // 07 Top 20 학습자
    document.getElementById('topLearnersBody').innerHTML = report.topLearners.map(l => `
      <tr>
        <td>${l.no}</td>
        <td>${escapeHtml(l.name)}</td>
        <td>${escapeHtml(l.email)}</td>
        <td>${escapeHtml(l.department)}</td>
        <td>${escapeHtml(l.position)}</td>
        <td>${fmtHours(l.hours)}</td>
        <td>${l.courseCount}개</td>
        <td>${l.completedCount}개</td>
        <td>${l.topCourse ? `${escapeHtml(l.topCourse.name)} (${l.topCourse.pct}%)` : '-'}</td>
      </tr>
    `).join('');

    // 08 학습과정별 심층 분석
    document.getElementById('deepDiveContainer').innerHTML = report.courseGroupDeepDive.map((g, i) => `
      <div class="er-group-card">
        <h3>${escapeHtml(g.name)}</h3>
        <div class="er-group-kpis">
          <span>Active Users <strong>${g.activeUsers}명</strong></span>
          <span>강의 수 <strong>${g.courseCount}개</strong></span>
          <span>총 학습시간 <strong>${fmtHours(g.totalHours)}</strong></span>
          <span>수료율 <strong>${g.completionRate}%</strong></span>
        </div>
        <div class="data-table-wrap" style="margin-bottom:14px;">
          <table class="data-table">
            <thead><tr><th>No.</th><th>강의명</th><th>학습자</th><th>평균 진도</th><th>시청시간</th></tr></thead>
            <tbody>
              ${g.topCourses.map((c, ci) => `<tr><td>${ci + 1}</td><td>${escapeHtml(c.name)}</td><td>${c.headcount}명</td><td>${c.avgProgress}%</td><td>${fmtHours(c.hours)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="data-table-wrap" style="margin-bottom:10px;">
          <table class="data-table">
            <thead><tr><th>No.</th><th>이름</th><th>이메일</th><th>소속</th><th>학습시간</th><th>수료</th></tr></thead>
            <tbody>
              ${g.topLearners.map(l => `<tr><td>${l.no}</td><td>${escapeHtml(l.name)}</td><td>${escapeHtml(l.email)}</td><td>${escapeHtml(l.department)}</td><td>${fmtHours(l.hours)}</td><td>${l.completedCount}/${l.courseCount}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="er-comment-box" id="commentGroup${i}"></div>
      </div>
    `).join('');

    erReport.style.display = 'block';
  }

  function renderComments(report, comments) {
    if (comments.error) {
      const msg = `AI 코멘트 생성에 실패했습니다: ${comments.error}`;
      ['commentOverall', 'commentKpi', 'commentCourseGroup', 'commentCategory', 'commentProgress', 'commentDept', 'commentPosition', 'commentTopLearners'].forEach(id => {
        document.getElementById(id).innerHTML = `<div class="er-comment-label">💬 코멘트</div>${escapeHtml(msg)}`;
      });
      return;
    }
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="er-comment-label">💬 코멘트</div>${escapeHtml(text || '')}`;
    };
    set('commentOverall', comments.overallSummary);
    set('commentKpi', comments.kpiComment);
    set('commentCourseGroup', comments.courseGroupComment);
    set('commentCategory', comments.categoryComment);
    set('commentProgress', comments.progressComment);
    set('commentDept', comments.departmentComment);
    set('commentPosition', comments.positionComment);
    set('commentTopLearners', comments.topLearnersComment);
    report.courseGroupDeepDive.forEach((g, i) => {
      set(`commentGroup${i}`, comments.courseGroupComments ? comments.courseGroupComments[g.name] : '');
    });
  }

  generateBtn.addEventListener('click', async () => {
    if (!file) return;
    generateBtn.disabled = true;
    showStatus('리포트를 생성하고 있습니다...', 'loading');
    erReport.style.display = 'none';

    const formData = new FormData();
    formData.append('file', file);
    if (companyInput.value.trim()) formData.append('company', companyInput.value.trim());
    if (periodInput.value.trim()) formData.append('period', periodInput.value.trim());

    try {
      const res = await fetch('/api/enrollment-report/generate', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성에 실패했습니다.');
      renderReport(data.report);
      showStatus('리포트가 생성되었습니다. AI 코멘트를 작성하고 있습니다...', 'loading');
      erReport.scrollIntoView({ behavior: 'smooth' });

      const commentsRes = await fetch('/api/enrollment-report/comments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: data.report }),
      });
      const commentsData = await commentsRes.json();
      renderComments(data.report, commentsData.comments || { error: '응답 없음' });
      showStatus('리포트가 생성되었습니다.', 'success');
    } catch (err) {
      showStatus(err.message, 'error');
    } finally {
      generateBtn.disabled = false;
    }
  });
})();
