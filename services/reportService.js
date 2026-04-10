const https = require('https');
const XLSX = require('xlsx');

const SHEET_ID = '1N7mUxj_q3fld1JDTOxCxs7ExcDxtIc_apXt8GKNqlGw';

let cachedReport = null;
let cacheTime = 0;
const CACHE_DURATION = 30 * 60 * 1000;

function fetchSheet() {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
    function follow(u, n) {
      if (n <= 0) return reject(new Error('Too many redirects'));
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400) {
          follow(res.headers.location, n - 1); res.resume(); return;
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    }
    follow(url, 5);
  });
}

function parseTopList(data, startRow) {
  const items = [];
  for (let i = startRow + 1; i < data.length; i++) {
    const row = data[i];
    const num = Number(row[1]);
    if (!num) break;
    items.push({
      rank: num,
      category: String(row[2] || ''),
      subCategory: String(row[3] || ''),
      name: String(row[4] || ''),
      source: String(row[11] || ''),
      count: Number(String(row[12] || '0').replace(/,/g, '')) || 0,
    });
  }
  return items;
}

function parseMonthlySheet(ws, sheetName) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const result = {
    name: sheetName,
    singleTop10: [],
    allplanTop10: [],
    categoryTops: {},
    monthlyTrend: [],
    ongoing: {},
    newClosed: {},
  };

  for (let i = 0; i < data.length; i++) {
    const text = String(data[i][1] || '');

    // TOP lists
    if (text.includes('싱글플랜 TOP 10')) {
      result.singleTop10 = parseTopList(data, i + 1);
    }
    if (text.includes('올플랜 TOP 10')) {
      result.allplanTop10 = parseTopList(data, i + 1);
    }

    // Category TOP 50s
    const catMatch = text.match(/▶\s*(.+?)\s*TOP\s*50/);
    if (catMatch) {
      const catName = catMatch[1].trim();
      result.categoryTops[catName] = parseTopList(data, i + 1);
    }

    // Monthly trend (Ongoing)
    const label = String(data[i][1] || '').replace(/\n/g, ' ').trim();
    const sub = String(data[i][2] || '').trim();

    if (label.includes('Ongoing') && sub.includes('Total')) {
      for (let m = 3; m <= 14; m++) {
        const val = Number(data[i][m]) || 0;
        if (val > 0) {
          const monthNames = ['01월','02월','03월','04월','05월','06월','07월','08월','09월','10월','11월','12월'];
          if (!result.ongoing.total) result.ongoing.total = [];
          result.ongoing.total.push(val);
        }
      }
      // Parse sub-rows
      for (let j = i + 1; j < i + 5 && j < data.length; j++) {
        const r = data[j];
        const s = String(r[2] || '').trim();
        const vals = [];
        for (let m = 3; m <= 14; m++) vals.push(Number(r[m]) || 0);
        if (s.includes('Day1')) result.ongoing.day1 = vals;
        else if (s.includes('CP')) result.ongoing.cp = vals;
        else if (s.includes('단건')) result.ongoing.single = vals;
        else if (s.includes('구독')) result.ongoing.subscription = vals;
      }
    }

    if (label.includes('신규') && sub.includes('신규 Total')) {
      result.newClosed.newTotal = [];
      for (let m = 3; m <= 14; m++) result.newClosed.newTotal.push(Number(data[i][m]) || 0);
    }
    if (sub.includes('종료 Total')) {
      result.newClosed.closedTotal = [];
      for (let m = 3; m <= 14; m++) result.newClosed.closedTotal.push(Number(data[i][m]) || 0);
    }
  }

  // Build monthly trend
  const months = ['01월','02월','03월','04월','05월','06월','07월','08월','09월','10월','11월','12월'];
  result.monthlyTrend = months.map((m, idx) => ({
    month: m,
    total: (result.ongoing.total && result.ongoing.total[idx]) || 0,
    newCount: (result.newClosed.newTotal && result.newClosed.newTotal[idx]) || 0,
    closedCount: (result.newClosed.closedTotal && result.newClosed.closedTotal[idx]) || 0,
  })).filter(m => m.total > 0 || m.newCount > 0);

  return result;
}

function parseSummary(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const result = { singleTop10: [], allplanTop10: [], categoryRank: [] };
  let section = '';

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const first = String(row[0] || '');

    if (first.includes('싱글플랜 TOP 10')) { section = 'single'; continue; }
    if (first.includes('올플랜 TOP 10')) { section = 'allplan'; continue; }
    if (first.includes('카테고리별 순위')) { section = 'category'; continue; }
    if (first === 'no.' || first === '') continue;

    const num = Number(first);
    if (!num) continue;

    if (section === 'single' || section === 'allplan') {
      const item = {
        rank: num,
        category: String(row[1] || ''),
        subCategory: String(row[2] || ''),
        name: String(row[3] || ''),
        count: Number(String(row[8] || '0').replace(/,/g, '')) || 0,
      };
      if (item.name) {
        if (section === 'single') result.singleTop10.push(item);
        else result.allplanTop10.push(item);
      }
    } else if (section === 'category') {
      result.categoryRank.push({
        rank: num,
        category: String(row[1] || ''),
        count: Number(String(row[4] || '0').replace(/,/g, '')) || 0,
        subCategory: String(row[5] || ''),
        subCount: Number(String(row[8] || '0').replace(/,/g, '')) || 0,
      });
    }
  }

  return result;
}

async function getReportData() {
  const now = Date.now();
  if (cachedReport && (now - cacheTime) < CACHE_DURATION) return cachedReport;

  console.log('[Report] Fetching report sheet...');
  const buffer = await fetchSheet();
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const report = {
    summary: parseSummary(wb.Sheets['Summary']),
    months: {},
    availableMonths: [],
  };

  wb.SheetNames.forEach(name => {
    if (name.includes('레포트')) {
      report.months[name] = parseMonthlySheet(wb.Sheets[name], name);
      report.availableMonths.push(name);
    }
  });

  cachedReport = report;
  cacheTime = now;
  console.log(`[Report] Loaded: Summary + ${report.availableMonths.length} monthly reports`);
  return report;
}

module.exports = { getReportData };
