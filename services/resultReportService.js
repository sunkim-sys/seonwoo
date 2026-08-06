const iconv = require('iconv-lite');

const WEEKDAY_ORDER = ['월', '화', '수', '목', '금', '토', '일'];
const WEEKDAY_BY_JS_DAY = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 0: '일' };
const TIME_BUCKETS = [
  { label: '00:00 - 06:00', hours: [0, 1, 2, 3, 4, 5] },
  { label: '06:00 - 09:00', hours: [6, 7, 8] },
  { label: '09:00 - 12:00', hours: [9, 10, 11] },
  { label: '12:00 - 15:00', hours: [12, 13, 14] },
  { label: '15:00 - 18:00', hours: [15, 16, 17] },
  { label: '18:00 - 21:00', hours: [18, 19, 20] },
  { label: '21:00 - 24:00', hours: [21, 22, 23] },
];

function decodeCsvBuffer(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString('utf-8');
  }
  const utf8 = buffer.toString('utf-8');
  if (!utf8.includes('�')) return utf8;
  return iconv.decode(buffer, 'cp949');
}

function parseCsv(buffer) {
  let text = decodeCsvBuffer(buffer);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // skip
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(v => v !== ''));
}

function normalizeHeader(h) {
  return String(h || '').replace(/\s+/g, '').trim();
}

function buildHeaderIndex(headerRow, required) {
  const normalized = headerRow.map(normalizeHeader);
  const index = {};
  for (const [key, candidates] of Object.entries(required)) {
    const found = candidates
      .map(c => normalized.indexOf(normalizeHeader(c)))
      .find(i => i !== -1);
    if (found === undefined) {
      throw new Error(`필수 컬럼을 찾을 수 없습니다: ${candidates[0]} (실제 헤더: ${headerRow.join(', ')})`);
    }
    index[key] = found;
  }
  return index;
}

function toNumber(v) {
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function formatDuration(totalSecondsRaw) {
  const totalSeconds = Math.round(totalSecondsRaw);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function parseKoreanDate(str) {
  const m = String(str).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function parseEnrollmentFile(buffer) {
  const rows = parseCsv(buffer);
  if (rows.length < 2) throw new Error('개인별 수강 이력 파일이 비어있습니다.');
  const [header, ...dataRows] = rows;
  const idx = buildHeaderIndex(header, {
    company: ['그룹명'],
    name: ['이름'],
    email: ['이메일'],
    position: ['직급'],
    department: ['소속부서'],
    category: ['노출카테고리1'],
    courseName: ['강의명'],
    periodSeconds: ['기간내누적수강시간(S)'],
    periodRate: ['기간내수강률(%)'],
  });

  const companyCounts = {};
  const records = dataRows.map(r => {
    const company = (r[idx.company] || '').trim();
    if (company) companyCounts[company] = (companyCounts[company] || 0) + 1;
    return {
      company,
      name: r[idx.name] || '',
      email: r[idx.email] || '',
      position: r[idx.position] || '',
      department: r[idx.department] || '',
      category: r[idx.category] || '미분류',
      courseName: r[idx.courseName] || '',
      periodSeconds: toNumber(r[idx.periodSeconds]),
      periodRate: toNumber(r[idx.periodRate]),
    };
  }).filter(r => r.email);

  const company = Object.entries(companyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  return { company, records };
}

function parseHourlyFile(buffer) {
  const rows = parseCsv(buffer);
  if (rows.length < 2) throw new Error('시간대별 표 파일이 비어있습니다.');
  const [header, ...dataRows] = rows;
  const idx = buildHeaderIndex(header, {
    hour: ['시간대'],
    accountCount: ['계정수'],
  });
  const byHour = {};
  dataRows.forEach(r => {
    const hour = Math.round(toNumber(r[idx.hour]));
    byHour[hour] = (byHour[hour] || 0) + toNumber(r[idx.accountCount]);
  });
  return byHour;
}

function parseDailyFile(buffer) {
  const rows = parseCsv(buffer);
  if (rows.length < 2) throw new Error('날짜별 표 파일이 비어있습니다.');
  const [header, ...dataRows] = rows;
  const idx = buildHeaderIndex(header, {
    date: ['기준일자'],
    accountCount: ['계정수'],
  });
  const days = dataRows.map(r => ({
    date: parseKoreanDate(r[idx.date]),
    accountCount: toNumber(r[idx.accountCount]),
  })).filter(d => d.date);
  return days;
}

function formatPeriodLabel(minDate, maxDate) {
  const sameMonth = minDate.getFullYear() === maxDate.getFullYear() && minDate.getMonth() === maxDate.getMonth();
  if (sameMonth) return `${minDate.getFullYear()}년 ${minDate.getMonth() + 1}월`;

  const quarterStarts = [0, 3, 6, 9];
  const isQuarter = quarterStarts.some(startMonth => {
    const endMonth = startMonth + 2;
    const start = new Date(minDate.getFullYear(), startMonth, 1);
    const end = new Date(minDate.getFullYear(), endMonth + 1, 0);
    return minDate.getTime() === start.getTime() && maxDate.getTime() === end.getTime();
  });
  if (isQuarter) {
    const q = Math.floor(minDate.getMonth() / 3) + 1;
    return `${minDate.getFullYear()}년 ${q}분기 (${minDate.getMonth() + 1}월~${maxDate.getMonth() + 1}월)`;
  }

  const fmt = d => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  return `${fmt(minDate)} ~ ${fmt(maxDate)}`;
}

function computeCategoryShare(records) {
  const byCategory = {};
  records.forEach(r => {
    if (!byCategory[r.category]) byCategory[r.category] = new Set();
    byCategory[r.category].add(r.email);
  });
  const grandTotal = Object.values(byCategory).reduce((sum, set) => sum + set.size, 0);
  return Object.entries(byCategory)
    .map(([category, emails]) => [category, emails.size])
    .sort((a, b) => b[1] - a[1])
    .map(([category, count], i) => ({
      no: i + 1,
      category,
      share: grandTotal > 0 ? count / grandTotal : 0,
    }));
}

function computeTopByTime(records, n = 5) {
  const byCourse = {};
  records.forEach(r => {
    if (!byCourse[r.courseName]) byCourse[r.courseName] = { category: r.category, courseName: r.courseName, seconds: 0 };
    byCourse[r.courseName].seconds += r.periodSeconds;
  });
  return Object.values(byCourse)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, n)
    .map((c, i) => ({ no: i + 1, category: c.category, courseName: c.courseName, duration: formatDuration(c.seconds) }));
}

function computeTopByHeadcount(records, n = 5) {
  const byCourse = {};
  records.forEach(r => {
    if (!byCourse[r.courseName]) byCourse[r.courseName] = { category: r.category, courseName: r.courseName, emails: new Set() };
    byCourse[r.courseName].emails.add(r.email);
  });
  return Object.values(byCourse)
    .map(c => ({ category: c.category, courseName: c.courseName, count: c.emails.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((c, i) => ({ no: i + 1, ...c }));
}

function computeEnrollmentStatus(records, totalEnrolled) {
  const byEmail = {};
  records.forEach(r => {
    if (!byEmail[r.email]) byEmail[r.email] = false;
    if (r.periodRate > 0) byEmail[r.email] = true;
  });
  const studying = Object.values(byEmail).filter(Boolean).length;
  const total = totalEnrolled;
  const notStarted = total - studying;
  return {
    total,
    studying,
    notStarted,
    ratio: total > 0 ? studying / total : 0,
  };
}

function computeTopStudents(records, n = 5) {
  const byEmail = {};
  records.forEach(r => {
    if (!byEmail[r.email]) byEmail[r.email] = { name: r.name, email: r.email, position: r.position, department: r.department, seconds: 0 };
    byEmail[r.email].seconds += r.periodSeconds;
  });
  return Object.values(byEmail)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, n)
    .map((s, i) => ({ no: i + 1, ...s, duration: formatDuration(s.seconds) }));
}

function computeWeekdayStats(days) {
  const sums = {};
  const counts = {};
  WEEKDAY_ORDER.forEach(w => { sums[w] = 0; counts[w] = 0; });
  days.forEach(d => {
    const label = WEEKDAY_BY_JS_DAY[d.date.getDay()];
    sums[label] += d.accountCount;
    counts[label] += 1;
  });
  const total = Object.values(sums).reduce((a, b) => a + b, 0);
  return WEEKDAY_ORDER.map(label => ({
    label,
    accumulated: sums[label],
    ratio: total > 0 ? sums[label] / total : 0,
    average: counts[label] > 0 ? sums[label] / counts[label] : 0,
  }));
}

function computeHourlyStats(byHour) {
  const total = Object.values(byHour).reduce((a, b) => a + b, 0);
  const buckets = TIME_BUCKETS.map(b => {
    const sum = b.hours.reduce((acc, h) => acc + (byHour[h] || 0), 0);
    return { label: b.label, accumulated: sum, ratio: total > 0 ? sum / total : 0 };
  });
  return { buckets, averagePerHour: total > 0 ? total / 24 : 0 };
}

function generateReport({ enrollmentBuffer, hourlyBuffer, dailyBuffer, totalEnrolled }) {
  const { company, records } = parseEnrollmentFile(enrollmentBuffer);
  const byHour = parseHourlyFile(hourlyBuffer);
  const days = parseDailyFile(dailyBuffer);

  if (records.length === 0) throw new Error('개인별 수강 이력 데이터가 없습니다.');
  if (days.length === 0) throw new Error('날짜별 표 데이터가 없습니다.');
  if (!Number.isFinite(totalEnrolled) || totalEnrolled <= 0) {
    throw new Error('총 입과인원을 올바르게 입력해주세요.');
  }

  const dates = days.map(d => d.date.getTime());
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));

  return {
    company,
    periodLabel: formatPeriodLabel(minDate, maxDate),
    categoryShare: computeCategoryShare(records),
    topByTime: computeTopByTime(records, 5),
    topByHeadcount: computeTopByHeadcount(records, 5),
    enrollmentStatus: computeEnrollmentStatus(records, totalEnrolled),
    topStudents: computeTopStudents(records, 5),
    weekdayStats: computeWeekdayStats(days),
    hourlyStats: computeHourlyStats(byHour),
  };
}

module.exports = { generateReport };
