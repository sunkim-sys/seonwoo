const SLOTS = ['enrollment', 'hourly', 'daily'];
const files = {};
let computed = null;
let charts = {};
let opImages = []; // { name, dataUrl, ext }

const statusEl = document.getElementById('status');
const generateBtn = document.getElementById('generateBtn');
const pdfBtn = document.getElementById('pdfBtn');
const xlsxBtn = document.getElementById('xlsxBtn');
const resetBtn = document.getElementById('resetBtn');
const reportEl = document.getElementById('rrReport');
const totalEnrolledInput = document.getElementById('totalEnrolledInput');
const companyNameInput = document.getElementById('companyNameInput');
const courseNameInput = document.getElementById('courseNameInput');
const periodInput = document.getElementById('periodInput');
const encourageDetail = document.getElementById('encourageDetail');

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + (type || '');
  statusEl.style.display = msg ? 'block' : 'none';
}

function updateGenerateBtn() {
  const hasFiles = SLOTS.every(slot => files[slot]);
  const hasTotal = Number(totalEnrolledInput.value) > 0;
  generateBtn.disabled = !(hasFiles && hasTotal);
}

totalEnrolledInput.addEventListener('input', updateGenerateBtn);

SLOTS.forEach(slot => {
  const area = document.getElementById(`uploadArea-${slot}`);
  const input = document.getElementById(`fileInput-${slot}`);
  const nameEl = document.getElementById(`fileName-${slot}`);

  area.addEventListener('click', () => input.click());

  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('dragover');
    if (e.dataTransfer.files[0]) setFile(slot, e.dataTransfer.files[0]);
  });

  input.addEventListener('change', () => {
    if (input.files[0]) setFile(slot, input.files[0]);
  });

  function setFile(slot, file) {
    files[slot] = file;
    nameEl.textContent = file.name;
    updateGenerateBtn();
  }
});

// ===== 입력값 자동 저장/복원 (localStorage) =====
const STORAGE_KEY = 'rrInputs_v1';
const persistIds = ['companyNameInput', 'courseNameInput', 'periodInput', 'totalEnrolledInput', 'encourageDetail'];
const persistChecks = ['chk_none', 'chk_sms', 'chk_email', 'chk_kakao'];

function saveInputs() {
  const data = {};
  persistIds.forEach(id => { data[id] = document.getElementById(id).value; });
  persistChecks.forEach(id => { data[id] = document.getElementById(id).checked; });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
}

function restoreInputs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    persistIds.forEach(id => { if (data[id] !== undefined) document.getElementById(id).value = data[id]; });
    persistChecks.forEach(id => { if (data[id] !== undefined) document.getElementById(id).checked = data[id]; });
  } catch (e) {}
}

restoreInputs();
[...persistIds, ...persistChecks].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('input', saveInputs);
  el.addEventListener('change', saveInputs);
});

resetBtn.addEventListener('click', () => {
  if (confirm('저장된 입력값을 모두 초기화할까요?')) {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
});

// ===== 독려 이미지 업로드 (드래그/클릭/붙여넣기) =====
function setupOpImgDropzone() {
  const zone = document.getElementById('dz-opimg');
  const input = document.getElementById('opImgFile');
  const nameEl = document.getElementById('opImgName');

  const readFiles = (fileList) => {
    Array.from(fileList).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const ext = file.type.includes('png') ? 'png' : file.type.includes('gif') ? 'gif' : 'jpeg';
        opImages.push({ name: file.name, dataUrl: ev.target.result, ext });
        renderOpImgPreview();
      };
      reader.readAsDataURL(file);
    });
  };

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files) readFiles(input.files); });

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files.length) readFiles(e.dataTransfer.files);
  });

  document.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    const imgItems = Array.from(items).filter(it => it.type.startsWith('image/'));
    if (!imgItems.length) return;
    e.preventDefault();
    imgItems.forEach(item => {
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const ext = item.type.includes('png') ? 'png' : item.type.includes('gif') ? 'gif' : 'jpeg';
        opImages.push({ name: `붙여넣기_${opImages.length + 1}.${ext}`, dataUrl: ev.target.result, ext });
        renderOpImgPreview();
      };
      reader.readAsDataURL(file);
    });
  });

  function renderOpImgPreview() {
    const grid = document.getElementById('opImgPreview');
    grid.innerHTML = '';
    if (opImages.length > 0) {
      zone.classList.add('has-file');
      nameEl.style.display = 'inline-block';
      nameEl.textContent = `✓ ${opImages.length}장 첨부됨`;
    } else {
      zone.classList.remove('has-file');
      nameEl.style.display = 'none';
    }
    opImages.forEach((img, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'rr-img-thumb';

      const imgEl = document.createElement('img');
      imgEl.src = img.dataUrl;
      imgEl.title = img.name;

      const nameDiv = document.createElement('div');
      nameDiv.className = 'rr-img-name';
      nameDiv.textContent = img.name;

      const delBtn = document.createElement('button');
      delBtn.className = 'rr-img-del';
      delBtn.textContent = '×';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        opImages.splice(i, 1);
        renderOpImgPreview();
      };

      wrap.appendChild(imgEl);
      wrap.appendChild(nameDiv);
      wrap.appendChild(delBtn);
      grid.appendChild(wrap);
    });
  }
}
setupOpImgDropzone();

function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function secsToHMS(totalSecondsRaw) {
  const totalSeconds = Math.round(totalSecondsRaw);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function renderReport(report) {
  const company = companyNameInput.value || report.company;
  const course = courseNameInput.value || '-';
  const period = periodInput.value || report.periodLabel;

  document.getElementById('rrTitle').textContent = `온라인 교육 결과 보고서 [${company}]`;
  document.getElementById('r_company').textContent = company;
  document.getElementById('r_course').textContent = course;
  document.getElementById('r_period').textContent = period;
  document.getElementById('r_periodDesc').textContent = `${period} 동안 진행된 운영 내용을 확인하실 수 있어요!`;

  document.getElementById('tbl-category').innerHTML = report.categoryShare.map(c =>
    `<tr><td>${c.no}</td><td>${c.category}</td><td>${pct(c.share)}</td></tr>`
  ).join('');

  document.getElementById('tbl-topByTime').innerHTML = report.topByTime.map(c =>
    `<tr><td>${c.no}</td><td>${c.category}</td><td>${c.courseName}</td><td>${c.duration}</td></tr>`
  ).join('');

  document.getElementById('tbl-topByHeadcount').innerHTML = report.topByHeadcount.map(c =>
    `<tr><td>${c.no}</td><td>${c.category}</td><td>${c.courseName}</td><td>${c.count}</td></tr>`
  ).join('');

  const s = report.enrollmentStatus;
  document.getElementById('tbl-status').innerHTML =
    `<tr><td>${s.total}</td><td>${s.studying}</td><td>${s.notStarted}</td><td>${pct(s.ratio)}</td></tr>`;

  document.getElementById('tbl-topStudents').innerHTML = report.topStudents.map(st =>
    `<tr><td>${st.no}</td><td>${st.name}</td><td>${st.email}</td><td>${st.position}</td><td>${st.department}</td><td>${st.duration}</td></tr>`
  ).join('');

  const weekdayHead = document.getElementById('thead-weekday');
  weekdayHead.innerHTML = '<th>구분</th>' + report.weekdayStats.map(w => `<th>${w.label}</th>`).join('');
  document.getElementById('tbl-weekday').innerHTML = `
    <tr><td>누적 수강 횟수</td>${report.weekdayStats.map(w => `<td>${w.accumulated}</td>`).join('')}</tr>
    <tr><td>접속률</td>${report.weekdayStats.map(w => `<td>${pct(w.ratio)}</td>`).join('')}</tr>
    <tr><td>평균 수강 유저 수</td>${report.weekdayStats.map(w => `<td>${w.average.toFixed(2)}</td>`).join('')}</tr>
  `;

  const hourlyHead = document.getElementById('thead-hourly');
  hourlyHead.innerHTML = '<th>구분</th>' + report.hourlyStats.buckets.map(b => `<th>${b.label}</th>`).join('');
  document.getElementById('tbl-hourly').innerHTML = `
    <tr><td>누적 수강 횟수</td>${report.hourlyStats.buckets.map(b => `<td>${b.accumulated}</td>`).join('')}</tr>
    <tr><td>접속률</td>${report.hourlyStats.buckets.map(b => `<td>${pct(b.ratio)}</td>`).join('')}</tr>
  `;
  document.getElementById('hourlyAverage').textContent = `시간대 평균 접속 계정수: ${report.hourlyStats.averagePerHour.toFixed(2)}`;

  // 4. 운영 사항
  const manage = [
    document.getElementById('chk_none').checked ? '독려없음 [■]' : '독려없음 [ ]',
    document.getElementById('chk_sms').checked ? 'SMS [■]' : 'SMS [ ]',
    document.getElementById('chk_email').checked ? 'E-mail [■]' : 'E-mail [ ]',
    document.getElementById('chk_kakao').checked ? '알림톡 [■]' : '알림톡 [ ]',
  ];
  document.getElementById('r_manage').textContent = manage.join(' / ');
  document.getElementById('r_encourage').textContent = encourageDetail.value;

  const opImgsSection = document.getElementById('r_opimgs');
  const opImgsContainer = document.getElementById('r_opimgs_container');
  opImgsContainer.innerHTML = '';
  if (opImages.length > 0) {
    opImgsSection.style.display = 'block';
    opImages.forEach(img => {
      const imgEl = document.createElement('img');
      imgEl.src = img.dataUrl;
      imgEl.alt = img.name;
      imgEl.style.cssText = 'display:block; max-width:100%; height:auto; margin-bottom:12px; border:1px solid var(--border); border-radius:4px;';
      opImgsContainer.appendChild(imgEl);
    });
  } else {
    opImgsSection.style.display = 'none';
  }

  renderCharts(report);

  reportEl.classList.add('show');
}

function renderCharts(report) {
  Object.values(charts).forEach(ch => ch && ch.destroy());
  charts = {};

  const baseOpt = { animation: false, responsive: true, maintainAspectRatio: false };

  charts.category = new Chart(document.getElementById('chart-category'), {
    type: 'bar',
    data: {
      labels: report.categoryShare.map(c => c.category),
      datasets: [{ label: '수강 비중(%)', data: report.categoryShare.map(c => (c.share * 100).toFixed(1)), backgroundColor: '#6366f1' }],
    },
    options: { ...baseOpt, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } },
  });

  const s = report.enrollmentStatus;
  charts.status = new Chart(document.getElementById('chart-status'), {
    type: 'bar',
    data: { labels: ['수강 중 인원', '미수강 인원'], datasets: [{ data: [s.studying, s.notStarted], backgroundColor: ['#6366f1', '#e2e8f0'] }] },
    options: { ...baseOpt, indexAxis: 'y', plugins: { legend: { display: false } } },
  });

  const dowLabels = report.weekdayStats.map(w => w.label);
  charts.weekday = new Chart(document.getElementById('chart-weekday'), {
    type: 'bar',
    data: {
      labels: dowLabels,
      datasets: [
        { label: '누적 수강 횟수', data: report.weekdayStats.map(w => w.accumulated), backgroundColor: '#6366f1', yAxisID: 'y' },
        { label: '접속률(%)', data: report.weekdayStats.map(w => (w.ratio * 100).toFixed(1)), type: 'line', borderColor: '#ec4899', yAxisID: 'y1' },
      ],
    },
    options: { ...baseOpt, scales: { y: { position: 'left' }, y1: { position: 'right', grid: { drawOnChartArea: false } } } },
  });

  const hLabels = report.hourlyStats.buckets.map(b => b.label);
  charts.hourly = new Chart(document.getElementById('chart-hourly'), {
    type: 'line',
    data: {
      labels: hLabels,
      datasets: [{ label: '접속률(%)', data: report.hourlyStats.buckets.map(b => (b.ratio * 100).toFixed(1)), fill: true, backgroundColor: 'rgba(99,102,241,0.2)', borderColor: '#6366f1', tension: 0.4 }],
    },
    options: { ...baseOpt, plugins: { legend: { display: false } } },
  });
}

generateBtn.addEventListener('click', async () => {
  generateBtn.disabled = true;
  showStatus('보고서를 생성하고 있습니다...', 'loading');

  const formData = new FormData();
  SLOTS.forEach(slot => formData.append(slot, files[slot]));
  formData.append('totalEnrolled', totalEnrolledInput.value);

  try {
    const res = await fetch('/api/result-report/generate', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '생성에 실패했습니다.');
    computed = data.report;
    if (!companyNameInput.value) companyNameInput.value = computed.company;
    if (!periodInput.value) periodInput.value = computed.periodLabel;
    renderReport(computed);
    pdfBtn.disabled = false;
    xlsxBtn.disabled = false;
    showStatus('보고서가 생성되었습니다.', 'success');
    reportEl.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    updateGenerateBtn();
  }
});

pdfBtn.addEventListener('click', async () => {
  const company = companyNameInput.value || (computed && computed.company) || 'report';
  const originalTitle = document.title;
  document.title = `온라인 교육 결과 보고서_${company}`;

  Object.values(charts).forEach(ch => ch && ch.resize());
  Object.values(charts).forEach(ch => ch && ch.update('none'));
  await new Promise(r => setTimeout(r, 300));

  window.print();

  setTimeout(() => { document.title = originalTitle; }, 1000);
});

xlsxBtn.addEventListener('click', downloadXLSX);

async function downloadXLSX() {
  if (!computed) return;
  const report = computed;
  const company = companyNameInput.value || report.company || 'report';
  const course = courseNameInput.value || '';
  const period = periodInput.value || report.periodLabel || '';

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('결과보고서');

  const NCOLS = 8;
  ws.columns = [
    { width: 22 }, { width: 26 }, { width: 42 }, { width: 18 },
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 },
  ];

  const C = {
    titleBg: 'FF4F46E5', titleFg: 'FFFFFFFF',
    secBg: 'FF6366F1', secFg: 'FFFFFFFF',
    subBg: 'FFEEF2FF', subFg: 'FF1E293B',
    headBg: 'FFEEF2FF',
    rowAlt: 'FFF8FAFC',
    accent: 'FF4F46E5',
    border: 'FFD1D5DB',
    note: 'FF64748B',
  };
  const T = (clr = C.border) => ({ style: 'thin', color: { argb: clr } });
  const M = (clr = C.accent) => ({ style: 'medium', color: { argb: clr } });
  const font = (opts = {}) => ({ name: 'Malgun Gothic', size: 10, ...opts });

  const makeSection = (ri, text) => {
    const row = ws.getRow(ri); row.height = 28;
    const cell = row.getCell(1);
    cell.value = text;
    cell.font = font({ bold: true, size: 13, color: { argb: C.secFg } });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.secBg } };
    cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.mergeCells(ri, 1, ri, NCOLS);
  };
  const makeSub = (ri, text) => {
    const row = ws.getRow(ri); row.height = 24;
    const cell = row.getCell(1);
    cell.value = text;
    cell.font = font({ bold: true, size: 11, color: { argb: C.subFg } });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.subBg } };
    cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    cell.border = { top: T(), right: T(), bottom: T(), left: M() };
    ws.mergeCells(ri, 1, ri, NCOLS);
  };
  const hCell = (cell, val) => {
    cell.value = val;
    cell.font = font({ bold: true });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headBg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: T(), left: T(), bottom: T(), right: T() };
  };
  const dCell = (cell, val, left = false, alt = false) => {
    cell.value = val;
    cell.font = font();
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: alt ? C.rowAlt : 'FFFFFFFF' } };
    cell.alignment = { horizontal: left ? 'left' : 'center', vertical: 'middle', wrapText: true, indent: left ? 1 : 0 };
    cell.border = { top: T(), left: T(), bottom: T(), right: T() };
  };
  const addImg = (canvasId, col0, row0, w, h) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    try {
      const b64 = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      ws.addImage(wb.addImage({ base64: b64, extension: 'png' }), { tl: { col: col0, row: row0 }, ext: { width: w, height: h }, editAs: 'oneCell' });
    } catch (e) { console.warn('이미지 실패:', canvasId); }
  };
  const imgEndRi = (row0, imgH, rowH = 20) => row0 + Math.ceil(imgH / rowH) + 2;
  const reserveRows = (riStart, imgH, rowH = 20) => {
    const n = Math.ceil(imgH / rowH) + 1;
    for (let i = 0; i < n; i++) ws.getRow(riStart + i).height = rowH;
    return n;
  };
  const gap = (ri, h = 10) => { ws.getRow(ri).height = h; return ri + 1; };

  let ri = 1;

  { const row = ws.getRow(ri); row.height = 40;
    const cell = row.getCell(1);
    cell.value = `온라인 교육 결과 보고서 [${company}]`;
    cell.font = font({ bold: true, size: 16, color: { argb: C.titleFg } });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.titleBg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.mergeCells(ri, 1, ri, NCOLS); ri++; }
  ri = gap(ri, 14);

  makeSection(ri, '1. 교육 과정 개요'); ri++;
  [['기업명', company], ['과정명', course], ['교육 기간', period]].forEach(([lbl, val]) => {
    const row = ws.getRow(ri); row.height = 22;
    hCell(row.getCell(1), lbl);
    const dc = row.getCell(2);
    dc.value = val; dc.font = font();
    dc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    dc.border = { top: T(), left: T(), bottom: T(), right: T() };
    ws.mergeCells(ri, 2, ri, NCOLS); ri++;
  });
  ri = gap(ri, 14);

  makeSection(ri, '2. 수강 강의 상세 현황'); ri++;
  ri = gap(ri, 8);

  makeSub(ri, '2-1. 인기 카테고리'); ri++;
  { const row = ws.getRow(ri); row.height = 22;
    ['No.', '카테고리', '수강 비중'].forEach((h, i) => hCell(row.getCell(i + 1), h)); }
  const catImg0 = ri - 1;
  ri++;
  report.categoryShare.forEach((c, i) => {
    const row = ws.getRow(ri); row.height = 22;
    dCell(row.getCell(1), c.no, false, i % 2 === 1);
    dCell(row.getCell(2), c.category, true, i % 2 === 1);
    dCell(row.getCell(3), pct(c.share), false, i % 2 === 1);
    ri++;
  });
  const catH = Math.max(240, (1 + report.categoryShare.length) * 24);
  addImg('chart-category', 4, catImg0, 340, catH);
  ri = Math.max(ri, imgEndRi(catImg0, catH));
  ri = gap(ri, 14);

  makeSub(ri, '2-2. 인기강의 top 5 (수강 시간 기준)'); ri++;
  { const row = ws.getRow(ri); row.height = 22;
    ['No.', '카테고리', '강의명', '수강 시간'].forEach((h, i) => hCell(row.getCell(i + 1), h)); ri++; }
  report.topByTime.forEach((c, i) => {
    const row = ws.getRow(ri); row.height = 22;
    dCell(row.getCell(1), c.no, false, i % 2 === 1);
    dCell(row.getCell(2), c.category, true, i % 2 === 1);
    dCell(row.getCell(3), c.courseName, true, i % 2 === 1);
    dCell(row.getCell(4), c.duration, false, i % 2 === 1);
    ri++;
  });
  ri = gap(ri, 14);

  makeSub(ri, '2-3. 인기강의 top 5 (수강 인원 기준)'); ri++;
  { const row = ws.getRow(ri); row.height = 22;
    ['No.', '카테고리', '강의명', '수강 인원'].forEach((h, i) => hCell(row.getCell(i + 1), h)); ri++; }
  report.topByHeadcount.forEach((c, i) => {
    const row = ws.getRow(ri); row.height = 22;
    dCell(row.getCell(1), c.no, false, i % 2 === 1);
    dCell(row.getCell(2), c.category, true, i % 2 === 1);
    dCell(row.getCell(3), c.courseName, true, i % 2 === 1);
    dCell(row.getCell(4), c.count, false, i % 2 === 1);
    ri++;
  });
  ri = gap(ri, 14);

  makeSection(ri, '3. 수강생 수강 현황'); ri++;
  ri = gap(ri, 8);

  makeSub(ri, '3-1. 수강 현황'); ri++;
  { const row = ws.getRow(ri); row.height = 22;
    ['총 수강인원', '수강 중 인원', '미수강 인원', '수강 비중(%)'].forEach((h, i) => hCell(row.getCell(i + 1), h)); }
  const stImg0 = ri - 1;
  ri++;
  { const s = report.enrollmentStatus;
    const row = ws.getRow(ri); row.height = 22;
    [s.total, s.studying, s.notStarted, pct(s.ratio)].forEach((v, i) => dCell(row.getCell(i + 1), v, false, false)); ri++; }
  const stH = 220;
  addImg('chart-status', 5, stImg0, 300, stH);
  ri = Math.max(ri, imgEndRi(stImg0, stH));
  ri = gap(ri, 14);

  makeSub(ri, '3-2. 주요 우수 수강생 top 5 (수강 시간 기준)'); ri++;
  { const row = ws.getRow(ri); row.height = 22;
    ['No.', '이름', '이메일', '직급', '부서', '수강시간'].forEach((h, i) => hCell(row.getCell(i + 1), h)); ri++; }
  report.topStudents.forEach((stu, i) => {
    const row = ws.getRow(ri); row.height = 22;
    dCell(row.getCell(1), stu.no, false, i % 2 === 1);
    dCell(row.getCell(2), stu.name, true, i % 2 === 1);
    dCell(row.getCell(3), stu.email, true, i % 2 === 1);
    dCell(row.getCell(4), stu.position, false, i % 2 === 1);
    dCell(row.getCell(5), stu.department, true, i % 2 === 1);
    dCell(row.getCell(6), stu.duration, false, i % 2 === 1);
    ri++;
  });
  ri = gap(ri, 14);

  makeSub(ri, '3-3. 요일별 접속 유저수'); ri++;
  const dowChart0 = ri - 1;
  const dowH = 260;
  addImg('chart-weekday', 0, dowChart0, 620, dowH);
  ri += reserveRows(ri, dowH);
  ri = gap(ri, 8);
  { const row = ws.getRow(ri); row.height = 22;
    hCell(row.getCell(1), '구분');
    report.weekdayStats.forEach((w, i) => hCell(row.getCell(i + 2), w.label)); ri++; }
  [['누적 수강 횟수', ...report.weekdayStats.map(w => w.accumulated)],
   ['접속률', ...report.weekdayStats.map(w => pct(w.ratio))]].forEach((vals, rowIdx) => {
    const row = ws.getRow(ri); row.height = 22;
    vals.forEach((v, i) => dCell(row.getCell(i + 1), v, i === 0, rowIdx % 2 === 1)); ri++;
  });
  ri = gap(ri, 14);

  makeSub(ri, '3-4. 시간대별 접속 유저수'); ri++;
  const hourChart0 = ri - 1;
  const hourH = 260;
  addImg('chart-hourly', 0, hourChart0, 620, hourH);
  ri += reserveRows(ri, hourH);
  ri = gap(ri, 8);
  { const row = ws.getRow(ri); row.height = 22;
    hCell(row.getCell(1), '구분');
    report.hourlyStats.buckets.forEach((b, i) => hCell(row.getCell(i + 2), b.label)); ri++; }
  [['누적 수강 횟수', ...report.hourlyStats.buckets.map(b => b.accumulated)],
   ['접속률', ...report.hourlyStats.buckets.map(b => pct(b.ratio))]].forEach((vals, rowIdx) => {
    const row = ws.getRow(ri); row.height = 22;
    vals.forEach((v, i) => dCell(row.getCell(i + 1), v, i === 0, rowIdx % 2 === 1)); ri++;
  });
  ri = gap(ri, 14);

  makeSection(ri, '4. 온라인 수강 운영 사항'); ri++;
  const manage = [
    document.getElementById('chk_none').checked ? '독려없음 [■]' : '독려없음 [ ]',
    document.getElementById('chk_sms').checked ? 'SMS [■]' : 'SMS [ ]',
    document.getElementById('chk_email').checked ? 'E-mail [■]' : 'E-mail [ ]',
    document.getElementById('chk_kakao').checked ? '알림톡 [■]' : '알림톡 [ ]',
  ];
  [['학습관리', manage.join(' / ')], ['독려상세', encourageDetail.value]].forEach(([lbl, val]) => {
    const row = ws.getRow(ri); row.height = 22;
    hCell(row.getCell(1), lbl);
    const dc = row.getCell(2);
    dc.value = val; dc.font = font();
    dc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
    dc.border = { top: T(), left: T(), bottom: T(), right: T() };
    ws.mergeCells(ri, 2, ri, NCOLS); ri++;
  });

  if (opImages.length > 0) {
    ri = gap(ri, 10);
    makeSub(ri, '4-2. 독려 이미지'); ri++;
    for (const imgData of opImages) {
      const imgRow0 = ri - 1;
      const dims = await new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 500, h: 350 });
        img.src = imgData.dataUrl;
      });
      const maxW = 480;
      const scale = Math.min(1, maxW / dims.w);
      const imgW = Math.round(dims.w * scale);
      const imgH = Math.round(dims.h * scale);
      try {
        const b64 = imgData.dataUrl.replace(/^data:image\/[^;]+;base64,/, '');
        ws.addImage(wb.addImage({ base64: b64, extension: imgData.ext }), { tl: { col: 0, row: imgRow0 }, ext: { width: imgW, height: imgH }, editAs: 'oneCell' });
        ri += reserveRows(ri, imgH);
        ri = gap(ri, 10);
      } catch (e) { console.warn('독려 이미지 XLSX 삽입 실패:', imgData.name, e); }
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `온라인 교육 결과 보고서_${company}.xlsx`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
