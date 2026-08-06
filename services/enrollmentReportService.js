const iconv = require('iconv-lite');
const { callGroqCustom } = require('./aiService');

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
      row.push(field); field = '';
    } else if (c === '\r') {
      // skip
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v !== ''));
}

function normalizeHeader(h) {
  return String(h || '').replace(/\s+/g, '').trim();
}

function buildHeaderIndex(headerRow, required) {
  const normalized = headerRow.map(normalizeHeader);
  const index = {};
  for (const [key, candidates] of Object.entries(required)) {
    const found = candidates.map(c => normalized.indexOf(normalizeHeader(c))).find(i => i !== -1);
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

function formatHours(seconds) {
  return Math.round((seconds / 3600) * 10) / 10;
}

function maskEmail(email) {
  const at = String(email || '').indexOf('@');
  if (at <= 0) return email || '';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, 3)}***@${domain}`;
}

// 원본 raw CSV 파싱. "학습과정"(상품/그룹) 컬럼은 원본 관리자 도구 스펙을 확인할 수 없어
// 이 컬럼명으로 가정함 (미검증 - 실제 컬럼명이 다르면 헤더를 맞춰주세요).
function parseRawFile(buffer) {
  const rows = parseCsv(buffer);
  if (rows.length < 2) throw new Error('업로드한 파일에 데이터가 없습니다.');
  const [header, ...dataRows] = rows;
  const idx = buildHeaderIndex(header, {
    company: ['그룹명'],
    courseGroup: ['학습과정', '상품명'],
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
      courseGroup: (r[idx.courseGroup] || '미지정').trim() || '미지정',
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

function computeKPIs(records) {
  const byEmail = new Map();
  for (const r of records) {
    if (!byEmail.has(r.email)) byEmail.set(r.email, { seconds: 0, completed: false });
    const acc = byEmail.get(r.email);
    acc.seconds += r.periodSeconds;
    if (r.periodRate >= 100) acc.completed = true;
  }
  const activeUsers = byEmail.size;
  const totalSeconds = [...byEmail.values()].reduce((s, v) => s + v.seconds, 0);
  const completedCount = [...byEmail.values()].filter(v => v.completed).length;
  const courseGroups = new Set(records.map(r => r.courseGroup));

  return {
    activeUsers,
    courseGroupCount: courseGroups.size,
    totalHours: formatHours(totalSeconds),
    avgHoursPerUser: activeUsers > 0 ? formatHours(totalSeconds / activeUsers) : 0,
    completedCount,
    completionRate: activeUsers > 0 ? Math.round((completedCount / activeUsers) * 1000) / 10 : 0,
  };
}

function computeCourseGroupComparison(records) {
  const groups = new Map();
  for (const r of records) {
    if (!groups.has(r.courseGroup)) groups.set(r.courseGroup, { name: r.courseGroup, emails: new Map(), courses: new Set() });
    const g = groups.get(r.courseGroup);
    g.courses.add(r.courseName);
    if (!g.emails.has(r.email)) g.emails.set(r.email, { seconds: 0, completed: false });
    const acc = g.emails.get(r.email);
    acc.seconds += r.periodSeconds;
    if (r.periodRate >= 100) acc.completed = true;
  }
  const totalUsers = new Set(records.map(r => r.email)).size;

  return [...groups.values()].map(g => {
    const users = [...g.emails.values()];
    const totalSeconds = users.reduce((s, v) => s + v.seconds, 0);
    const completed = users.filter(v => v.completed).length;
    return {
      name: g.name,
      activeUsers: g.emails.size,
      share: totalUsers > 0 ? Math.round((g.emails.size / totalUsers) * 1000) / 10 : 0,
      courseCount: g.courses.size,
      totalHours: formatHours(totalSeconds),
      avgHours: g.emails.size > 0 ? formatHours(totalSeconds / g.emails.size) : 0,
      completedCount: completed,
      completionRate: g.emails.size > 0 ? Math.round((completed / g.emails.size) * 1000) / 10 : 0,
    };
  }).sort((a, b) => b.activeUsers - a.activeUsers);
}

function computeCategoryStats(records, topN = 8) {
  const cats = new Map();
  for (const r of records) {
    if (!cats.has(r.category)) cats.set(r.category, { name: r.category, seconds: 0, emails: new Set() });
    const c = cats.get(r.category);
    c.seconds += r.periodSeconds;
    c.emails.add(r.email);
  }
  const totalSeconds = [...cats.values()].reduce((s, c) => s + c.seconds, 0);
  const all = [...cats.values()]
    .map(c => ({ name: c.name, hours: formatHours(c.seconds), pct: totalSeconds > 0 ? Math.round((c.seconds / totalSeconds) * 1000) / 10 : 0, headcount: c.emails.size }))
    .sort((a, b) => b.hours - a.hours);
  return { totalHours: formatHours(totalSeconds), categoryCount: all.length, categories: all.slice(0, topN) };
}

const PROGRESS_BUCKETS = [
  { key: '0-25%', min: 0, max: 25 },
  { key: '25-50%', min: 25, max: 50 },
  { key: '50-75%', min: 50, max: 75 },
  { key: '75-99%', min: 75, max: 100 },
  { key: '100% (수료)', min: 100, max: Infinity },
];

function computeProgressDistribution(records) {
  const counts = PROGRESS_BUCKETS.map(b => ({ ...b, count: 0 }));
  for (const r of records) {
    const bucket = counts.find(b => r.periodRate >= b.min && r.periodRate < b.max) || counts[counts.length - 1];
    bucket.count++;
  }
  const total = records.length;
  return { total, buckets: counts.map(b => ({ label: b.key, count: b.count, pct: total > 0 ? Math.round((b.count / total) * 1000) / 10 : 0 })) };
}

function computeGroupDistribution(records, field, topN) {
  const groups = new Map();
  for (const r of records) {
    const key = r[field] || '미지정';
    if (!groups.has(key)) groups.set(key, { name: key, emails: new Map() });
    const g = groups.get(key);
    if (!g.emails.has(r.email)) g.emails.set(r.email, 0);
    g.emails.set(r.email, g.emails.get(r.email) + r.periodSeconds);
  }
  const all = [...groups.values()]
    .map(g => ({ name: g.name, headcount: g.emails.size, hours: formatHours([...g.emails.values()].reduce((s, v) => s + v, 0)) }))
    .sort((a, b) => b.headcount - a.headcount);
  if (!topN) return { groups: all, otherCount: 0 };
  const top = all.slice(0, topN);
  const otherCount = all.slice(topN).reduce((s, g) => s + g.headcount, 0);
  const otherGroupCount = Math.max(0, all.length - topN);
  return { groups: top, otherCount, otherGroupCount };
}

function computeTopLearners(records, n = 20) {
  const byEmail = new Map();
  for (const r of records) {
    if (!byEmail.has(r.email)) {
      byEmail.set(r.email, {
        name: r.name, email: r.email, department: r.department, position: r.position,
        seconds: 0, courseSeconds: new Map(), completed: 0, total: 0,
      });
    }
    const acc = byEmail.get(r.email);
    acc.seconds += r.periodSeconds;
    acc.total += 1;
    if (r.periodRate >= 100) acc.completed += 1;
    acc.courseSeconds.set(r.courseName, (acc.courseSeconds.get(r.courseName) || 0) + r.periodSeconds);
  }
  return [...byEmail.values()]
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, n)
    .map((a, i) => {
      const topCourse = [...a.courseSeconds.entries()].sort((x, y) => y[1] - x[1])[0];
      return {
        no: i + 1, name: a.name, email: maskEmail(a.email), department: a.department, position: a.position,
        hours: formatHours(a.seconds), courseCount: a.total, completedCount: a.completed,
        topCourse: topCourse ? { name: topCourse[0], pct: a.seconds > 0 ? Math.round((topCourse[1] / a.seconds) * 100) : 0 } : null,
      };
    });
}

function computeCourseGroupDeepDive(records) {
  const groups = new Map();
  for (const r of records) {
    if (!groups.has(r.courseGroup)) groups.set(r.courseGroup, []);
    groups.get(r.courseGroup).push(r);
  }

  return [...groups.entries()].map(([name, groupRecords]) => {
    const kpi = computeCourseGroupComparison(groupRecords)[0] || { activeUsers: 0, courseCount: 0, totalHours: 0, completionRate: 0 };

    const byCourse = new Map();
    for (const r of groupRecords) {
      if (!byCourse.has(r.courseName)) byCourse.set(r.courseName, { name: r.courseName, seconds: 0, emails: new Map() });
      const c = byCourse.get(r.courseName);
      c.seconds += r.periodSeconds;
      c.emails.set(r.email, Math.max(c.emails.get(r.email) || 0, r.periodRate));
    }
    const topCourses = [...byCourse.values()]
      .map(c => ({
        name: c.name, headcount: c.emails.size, hours: formatHours(c.seconds),
        avgProgress: c.emails.size > 0 ? Math.round([...c.emails.values()].reduce((s, v) => s + v, 0) / c.emails.size) : 0,
      }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);

    const categoryStats = computeCategoryStats(groupRecords, 20);
    const topLearners = computeTopLearners(groupRecords, 5);

    return {
      name,
      activeUsers: kpi.activeUsers,
      courseCount: kpi.courseCount,
      totalHours: kpi.totalHours,
      completionRate: kpi.completionRate,
      topCourses,
      categoryStats,
      topLearners,
    };
  }).sort((a, b) => b.activeUsers - a.activeUsers);
}

function generateReport({ buffer, companyLabel, periodLabel }) {
  const { company, records } = parseRawFile(buffer);
  if (records.length === 0) throw new Error('유효한 수강 데이터가 없습니다.');

  return {
    company: companyLabel || company,
    periodLabel: periodLabel || '',
    kpis: computeKPIs(records),
    courseGroups: computeCourseGroupComparison(records),
    categoryStats: computeCategoryStats(records),
    progressDistribution: computeProgressDistribution(records),
    departmentDistribution: computeGroupDistribution(records, 'department', 15),
    positionDistribution: computeGroupDistribution(records, 'position', null),
    topLearners: computeTopLearners(records, 20),
    courseGroupDeepDive: computeCourseGroupDeepDive(records),
  };
}

// LLM이 JSON 문자열 값 내부에 이스케이프 없는 개행을 그대로 넣는 경우가 있어
// 문자열 리터럴 내부의 raw \n, \r만 골라 \\n, \\r로 치환한다.
function sanitizeJsonStringNewlines(jsonText) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of jsonText) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === '\\') {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        out += ch;
        inString = false;
      } else if (ch === '\n') {
        out += '\\n';
      } else if (ch === '\r') {
        out += '\\r';
      } else {
        out += ch;
      }
    } else {
      out += ch;
      if (ch === '"') inString = true;
    }
  }
  return out;
}

// ---- AI 코멘트 생성 (Groq, 1회 호출로 전 섹션 코멘트 일괄 생성) ----
async function generateComments(report) {
  const compact = {
    company: report.company,
    period: report.periodLabel,
    kpis: report.kpis,
    courseGroups: report.courseGroups.map(g => ({ name: g.name, activeUsers: g.activeUsers, share: g.share, totalHours: g.totalHours, avgHours: g.avgHours, completionRate: g.completionRate })),
    topCategories: report.categoryStats.categories.slice(0, 5),
    progressDistribution: report.progressDistribution.buckets,
    topDepartments: report.departmentDistribution.groups.slice(0, 5),
    topPositions: report.positionDistribution.groups.slice(0, 3),
    topLearners: report.topLearners.slice(0, 5).map(l => ({ name: l.name, department: l.department, hours: l.hours, courseCount: l.courseCount })),
    courseGroupNames: report.courseGroupDeepDive.map(g => g.name),
  };

  const systemPrompt = `당신은 기업교육 데이터를 분석해 월간 수강 리포트 코멘트를 작성하는 전문 에디터입니다.
아래 규칙을 반드시 지키세요:
- 반드시 한국어로만 작성합니다. 한자, 베트남어 등 다른 언어의 문자가 절대 섞이면 안 됩니다.
- "▶ 소제목" 형식의 불릿 포인트 스타일을 사용합니다 (예: "▶ 학습 참여").
- 숫자는 제공된 데이터를 그대로 인용하고 새로운 숫자를 지어내지 않습니다.
- 간결하고 인사이트 중심으로 작성하며, 과장하지 않습니다.
- 반드시 JSON 형식으로만 응답하고 다른 텍스트는 포함하지 않습니다.`;

  const userPrompt = `다음 데이터를 바탕으로 리포트 코멘트를 작성해주세요. courseGroupComments는 courseGroupNames 각 항목에 대해 하나씩 작성합니다.

${JSON.stringify(compact, null, 2)}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "overallSummary": "전체 요약 코멘트 (여러 문단, ▶ 소제목 여러 개 포함)",
  "kpiComment": "KPI 섹션 코멘트",
  "courseGroupComment": "학습과정별 비교 코멘트",
  "categoryComment": "카테고리별 시청시간 코멘트",
  "progressComment": "수강 진도 분포 코멘트",
  "departmentComment": "부서별 분포 코멘트",
  "positionComment": "직급별 분포 코멘트",
  "topLearnersComment": "최다 학습자 코멘트",
  "courseGroupComments": { "학습과정명": "해당 과정 코멘트", ... }
}`;

  try {
    const result = await callGroqCustom(systemPrompt, userPrompt, 4000);
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON not found in AI response');
    return JSON.parse(sanitizeJsonStringNewlines(jsonMatch[0]));
  } catch (err) {
    console.log('[AI] 수강 리포트 코멘트 생성 실패:', err.message);
    return { error: err.message };
  }
}

module.exports = { generateReport, generateComments };
