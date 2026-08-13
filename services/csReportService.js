const XLSX = require('xlsx');
const db = require('./db');

const TABLE = 'cs_report_chats';
const COMPANY_PREFIX = '기업(서브태그)/';
const RESOLUTION_TAGS = {
  change: '회원정보/계정정보변경',
  reset: '회원정보/비밀번호초기화',
  check: '회원정보/계정정보확인',
};
const SURGE_RATIO = 1.5;
const ANOMALY_RATIO = 1.3;
const ANOMALY_MIN_COUNT = 5;
const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      chat_id TEXT PRIMARY KEY,
      created_at TIMESTAMP NOT NULL,
      tags TEXT[] NOT NULL DEFAULT '{}',
      state TEXT,
      source_file TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_${TABLE}_created_at ON ${TABLE} (created_at);`);
}

// --- Parsing -----------------------------------------------------------

function parseChathubBuffer(buffer, password) {
  const readOpts = { type: 'buffer' };
  if (password) readOpts.password = password;
  const wb = XLSX.read(buffer, readOpts);
  const sheetName = wb.SheetNames.find(n => n === 'UserChat') || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('UserChat 시트를 찾을 수 없습니다.');
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const chats = [];
  for (const r of rows) {
    const id = (r.id || '').toString().trim();
    const createdAt = (r.createdAt || '').toString().trim();
    if (!id || !createdAt) continue;
    const tags = (r.tags || '').toString().split(',').map(s => s.trim()).filter(Boolean);
    chats.push({
      chatId: id,
      createdAt,
      tags,
      state: (r.state || '').toString().trim(),
    });
  }
  return chats;
}

async function upsertChats(chats, sourceFile) {
  await ensureTable();
  const CHUNK = 200;
  let count = 0;
  for (let i = 0; i < chats.length; i += CHUNK) {
    const chunk = chats.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    chunk.forEach((c, idx) => {
      const base = idx * 5;
      values.push(`($${base + 1}, $${base + 2}::timestamp, $${base + 3}::text[], $${base + 4}, $${base + 5})`);
      params.push(c.chatId, c.createdAt, c.tags, c.state, sourceFile);
    });
    await db.query(
      `INSERT INTO ${TABLE} (chat_id, created_at, tags, state, source_file)
       VALUES ${values.join(', ')}
       ON CONFLICT (chat_id) DO UPDATE SET
         created_at = EXCLUDED.created_at,
         tags = EXCLUDED.tags,
         state = EXCLUDED.state,
         source_file = EXCLUDED.source_file,
         uploaded_at = now()`,
      params
    );
    count += chunk.length;
  }
  return count;
}

async function importFile(buffer, filename, password) {
  let chats;
  try {
    chats = parseChathubBuffer(buffer, password);
  } catch (err) {
    if (/password/i.test(err.message)) {
      throw new Error(`${filename}: 비밀번호가 걸린 파일입니다. 파일 비밀번호를 확인해주세요.`);
    }
    throw new Error(`${filename}: 파일을 읽을 수 없습니다 (${err.message})`);
  }
  if (!chats.length) throw new Error(`${filename}: UserChat 시트에서 유효한 데이터를 찾지 못했습니다.`);
  const saved = await upsertChats(chats, filename);
  const months = new Set(chats.map(c => c.createdAt.slice(0, 7)));
  return { filename, rows: saved, months: [...months].sort() };
}

// --- Reading -------------------------------------------------------------

async function getRowsBetween(startMonth, endMonthExclusive) {
  await ensureTable();
  const { rows } = await db.query(
    `SELECT chat_id, tags, state,
            to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at
     FROM ${TABLE}
     WHERE created_at >= $1::timestamp AND created_at < $2::timestamp`,
    [`${startMonth}-01`, `${endMonthExclusive}-01`]
  );
  return rows;
}

async function getAvailableMonths() {
  await ensureTable();
  const { rows } = await db.query(
    `SELECT DISTINCT to_char(created_at, 'YYYY-MM') AS m FROM ${TABLE} ORDER BY m ASC`
  );
  return rows.map(r => r.m);
}

// --- Date helpers ---------------------------------------------------------

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function lastNMonths(endMonth, n) {
  const arr = [];
  for (let i = n - 1; i >= 0; i--) arr.push(shiftMonth(endMonth, -i));
  return arr;
}

// --- Aggregation helpers ---------------------------------------------------

function monthKey(createdAt) {
  return createdAt.slice(0, 7);
}

function tagCounts(rows) {
  const counts = new Map();
  for (const r of rows) {
    const uniq = new Set(r.tags);
    for (const t of uniq) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return counts;
}

function sortedEntries(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function isCompanyTag(tag) {
  return tag.startsWith(COMPANY_PREFIX);
}

// --- Dashboard --------------------------------------------------------------

async function getDashboard(month) {
  await ensureTable();

  const windowStart = shiftMonth(month, -5); // up to 6 months for the overview trend
  const allRows = await getRowsBetween(windowStart, shiftMonth(month, 1));
  const byMonth = new Map();
  for (const r of allRows) {
    const mk = monthKey(r.created_at);
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk).push(r);
  }

  const monthRows = byMonth.get(month) || [];
  const prevMonth = shiftMonth(month, -1);
  const prevRows = byMonth.get(prevMonth) || [];

  const totalCount = monthRows.length;
  const prevCount = prevRows.length;
  const diff = totalCount - prevCount;
  const diffPct = prevCount > 0 ? (diff / prevCount) * 100 : null;

  // 6-month trend
  const trendMonths = lastNMonths(month, 6);
  const trend = trendMonths.map(m => ({ month: m, count: (byMonth.get(m) || []).length }));

  // Tag ranking (top 9) — company tags (기업(서브태그)/*) are tracked separately
  // in the company-ranking section below and excluded from this leaderboard.
  const monthTagCounts = tagCounts(monthRows);
  const nonMetaTags = [...monthTagCounts.entries()].filter(([t]) => t !== '내부확인중' && !isCompanyTag(t));
  const tagRanking = sortedEntries(new Map(nonMetaTags)).slice(0, 9)
    .map(([tag, count]) => ({ tag, count }));

  // 3-month tag trend (top 5 by current month)
  const trend3Months = lastNMonths(month, 3);
  const top5Tags = tagRanking.slice(0, 5).map(t => t.tag);
  const tagTrend = top5Tags.map(tag => ({
    tag,
    counts: trend3Months.map(m => (tagCounts(byMonth.get(m) || []).get(tag) || 0)),
  }));
  const tagTrendOmittedCount = Math.max(0, nonMetaTags.length - 5);
  const tagTrendOmittedSum = sortedEntries(new Map(nonMetaTags)).slice(5)
    .reduce((s, [, c]) => s + c, 0);

  // Company ranking (top 4)
  const companyEntries = sortedEntries(monthTagCounts).filter(([t]) => isCompanyTag(t));
  const companyRanking = companyEntries.slice(0, 4).map(([company, count]) => {
    const companyName = company.slice(COMPANY_PREFIX.length);
    const companyRows = monthRows.filter(r => r.tags.includes(company));
    const subTagCounts = tagCounts(companyRows);
    const topSubTags = sortedEntries(subTagCounts)
      .filter(([t]) => t !== company && !isCompanyTag(t) && t !== '내부확인중')
      .slice(0, 3)
      .map(([tag, count]) => ({ tag, count }));
    return { company, companyName, count, topSubTags };
  });

  const companyTrend = companyRanking.map(({ company, companyName }) => ({
    company, companyName,
    counts: trend3Months.map(m => (tagCounts(byMonth.get(m) || []).get(company) || 0)),
  }));

  // Top 3 overall
  const top3 = tagRanking.slice(0, 3);

  // Auth-resolution style tracking: target = current month's #1 tag
  const targetTag = tagRanking[0] ? tagRanking[0].tag : null;
  const resolutionTrend = targetTag ? trend3Months.map(m => {
    const rows = (byMonth.get(m) || []).filter(r => r.tags.includes(targetTag));
    const changeCount = rows.filter(r => r.tags.includes(RESOLUTION_TAGS.change)).length;
    const resetCount = rows.filter(r => r.tags.includes(RESOLUTION_TAGS.reset)).length;
    const checkCount = rows.filter(r => r.tags.includes(RESOLUTION_TAGS.check)).length;
    const resolvedChats = new Set(
      rows.filter(r => r.tags.includes(RESOLUTION_TAGS.change) || r.tags.includes(RESOLUTION_TAGS.reset) || r.tags.includes(RESOLUTION_TAGS.check))
        .map(r => r.chat_id)
    );
    return {
      month: m,
      total: rows.length,
      resolved: resolvedChats.size,
      change: changeCount,
      reset: resetCount,
      check: checkCount,
    };
  }) : [];

  // 반복 문제: how many consecutive months (ending at `month`) has targetTag stayed in top 3
  let repeatStreak = 0;
  if (targetTag) {
    for (let i = 0; i < 12; i++) {
      const m = shiftMonth(month, -i);
      const rows = byMonth.has(m) ? byMonth.get(m) : (i <= 5 ? [] : null);
      if (rows === null) break; // outside fetched window
      const ranking = sortedEntries(tagCounts(rows)).filter(([t]) => t !== '내부확인중' && !isCompanyTag(t)).slice(0, 3).map(([t]) => t);
      if (ranking.includes(targetTag)) repeatStreak++;
      else break;
    }
  }

  // 기업 이상치: for each company this month, find their standout tag vs global share
  const companyAnomalies = [];
  for (const [company, companyTotal] of companyEntries) {
    if (companyTotal < ANOMALY_MIN_COUNT) continue;
    const companyRows = monthRows.filter(r => r.tags.includes(company));
    const subCounts = sortedEntries(tagCounts(companyRows)).filter(([t]) => t !== company && !isCompanyTag(t) && t !== '내부확인중');
    if (!subCounts.length) continue;
    const [topTag, topCount] = subCounts[0];
    const companyShare = topCount / companyTotal;
    const globalTagCount = monthTagCounts.get(topTag) || 0;
    const globalShare = totalCount > 0 ? globalTagCount / totalCount : 0;
    if (globalShare > 0 && companyShare >= globalShare * ANOMALY_RATIO) {
      companyAnomalies.push({
        company, companyName: company.slice(COMPANY_PREFIX.length),
        tag: topTag, companyCount: topCount, companyTotal,
        companySharePct: Math.round(companyShare * 1000) / 10,
        globalSharePct: Math.round(globalShare * 1000) / 10,
      });
    }
  }
  companyAnomalies.sort((a, b) => b.companySharePct - a.companySharePct);

  // Daily pattern for the month
  const dim = daysInMonth(month);
  const dayCounts = new Array(dim + 1).fill(0);
  const dayWeekday = new Array(dim + 1).fill(0);
  for (let d = 1; d <= dim; d++) {
    dayWeekday[d] = new Date(`${month}-${String(d).padStart(2, '0')}T00:00:00`).getDay();
  }
  for (const r of monthRows) {
    const day = Number(r.created_at.slice(8, 10));
    if (day >= 1 && day <= dim) dayCounts[day]++;
  }
  let busiestDay = 1, busiestCount = 0;
  for (let d = 1; d <= dim; d++) {
    if (dayCounts[d] > busiestCount) { busiestCount = dayCounts[d]; busiestDay = d; }
  }
  const dailyPattern = [];
  for (let d = 1; d <= dim; d++) {
    dailyPattern.push({ day: d, weekday: dayWeekday[d], count: dayCounts[d] });
  }

  // 요일별 제안: average count per weekday (this month) vs overall average
  const weekdaySums = new Array(7).fill(0);
  const weekdayOccurrences = new Array(7).fill(0);
  for (let d = 1; d <= dim; d++) {
    weekdaySums[dayWeekday[d]] += dayCounts[d];
    weekdayOccurrences[dayWeekday[d]]++;
  }
  const overallDailyAvg = totalCount / dim;
  const weekdayStats = WEEKDAY_NAMES.map((name, idx) => ({
    name,
    avg: weekdayOccurrences[idx] > 0 ? weekdaySums[idx] / weekdayOccurrences[idx] : 0,
  }));
  const busyWeekdays = weekdayStats.filter(w => overallDailyAvg > 0 && w.avg >= overallDailyAvg * ANOMALY_RATIO);
  let weekdayInsight = null;
  if (busyWeekdays.length) {
    const names = busyWeekdays.map(w => w.name).join(', ');
    const busyIdx = new Set(busyWeekdays.map(w => WEEKDAY_NAMES.indexOf(w.name)));
    const maxOnBusy = Math.max(0, ...dailyPattern.filter(d => busyIdx.has(d.weekday)).map(d => d.count));
    weekdayInsight = {
      weekdays: names,
      overallAvg: Math.round(overallDailyAvg * 10) / 10,
      maxCount: maxOnBusy,
    };
  }

  // 신규/급증 유형
  const prevTagCounts = tagCounts(prevRows);
  const newTags = [];
  const surgingTags = [];
  for (const [tag, count] of monthTagCounts.entries()) {
    if (tag === '내부확인중' || isCompanyTag(tag)) continue;
    const prevCount2 = prevTagCounts.get(tag) || 0;
    if (prevCount2 === 0) {
      if (prevMonth >= windowStart) newTags.push({ tag, count });
    } else if (count / prevCount2 >= SURGE_RATIO) {
      surgingTags.push({ tag, from: prevCount2, to: count, ratio: Math.round((count / prevCount2) * 10) / 10 });
    }
  }
  newTags.sort((a, b) => b.count - a.count);
  surgingTags.sort((a, b) => b.ratio - a.ratio);

  return {
    month,
    updatedAt: new Date().toISOString(),
    summary: { totalCount, prevMonth, prevCount, diff, diffPct },
    trend,
    tagRanking,
    tagTrend: { months: trend3Months, series: tagTrend, omittedCount: tagTrendOmittedCount, omittedSum: tagTrendOmittedSum },
    companyRanking,
    companyTrend: { months: trend3Months, series: companyTrend },
    top3,
    dailyPattern,
    insights: {
      repeatProblem: targetTag && repeatStreak >= 2 ? { tag: targetTag, streak: repeatStreak, count: monthTagCounts.get(targetTag) || 0 } : null,
      companyAnomalies,
      resolutionTrend: { targetTag, months: resolutionTrend },
      weekdayInsight,
      newTags: newTags.slice(0, 10),
      surgingTags: surgingTags.slice(0, 10),
    },
  };
}

module.exports = {
  ensureTable,
  importFile,
  getAvailableMonths,
  getDashboard,
};
