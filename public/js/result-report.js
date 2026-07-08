const SLOTS = ['enrollment', 'hourly', 'daily'];
const files = {};

const statusEl = document.getElementById('status');
const generateBtn = document.getElementById('generateBtn');
const resultsEl = document.getElementById('rrResults');
const downloadBtn = document.getElementById('downloadBtn');
const totalEnrolledInput = document.getElementById('totalEnrolledInput');

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

function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function renderReport(report) {
  document.getElementById('rrTitle').textContent = `${report.company} 운영 레포트 (${report.periodLabel})`;

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

  resultsEl.style.display = 'block';
  resultsEl.classList.add('show');
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
    renderReport(data.report);
    showStatus('보고서가 생성되었습니다.', 'success');
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    updateGenerateBtn();
  }
});

downloadBtn.addEventListener('click', () => {
  window.location.href = '/api/result-report/export';
});
