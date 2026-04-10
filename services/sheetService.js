const https = require('https');

const SHEET_ID = '1A82erZFIPkpgrM3JHV9fktfwqfsBFYrA3uZ5zAoyw7I';
const GID = '633723179';

function parseCSV(text) {
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(current);
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(current);
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
      current = '';
    } else {
      current += ch;
    }
  }
  row.push(current);
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

let cachedData = null;
let cacheTime = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

function fetchSheet() {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

    function followRedirects(targetUrl, maxRedirects) {
      if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

      https.get(targetUrl, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301 || res.statusCode === 307) {
          followRedirects(res.headers.location, maxRedirects - 1);
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    }

    followRedirects(url, 5);
  });
}

async function getSheetData() {
  const now = Date.now();
  if (cachedData && (now - cacheTime) < CACHE_DURATION) {
    return cachedData;
  }

  console.log('[Sheet] Fetching Google Sheet...');
  const buffer = await fetchSheet();
  const csvText = buffer.toString('utf-8');

  // Parse CSV with proper quote handling
  const data = parseCSV(csvText);

  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < 20; i++) {
    const row = data[i] || [];
    if (row.some(c => String(c).includes('교육명')) && row.some(c => String(c).includes('카테고리'))) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) throw new Error('헤더를 찾을 수 없습니다.');

  // Find column indices dynamically from header
  const headerRow = data[headerIdx];
  const colIdx = {};
  headerRow.forEach((cell, i) => {
    const val = String(cell).replace(/\s+/g, '');
    if (val.includes('카테고리') && !val.includes('서브')) colIdx.category = i;
    if (val.includes('서브')) colIdx.subCategory = i;
    if (val === '교육명') colIdx.name = i;
    if (val === '난이도') colIdx.level = i;
    if (val === '과정소개') colIdx.intro = i;
    if (val === '학습목표') colIdx.goals = i;
    if (val === '학습대상') colIdx.target = i;
    if (val === '학습목차') colIdx.curriculum = i;
    if (val.includes('강의소개URL') || val.includes('URL')) colIdx.url = i;
  });
  console.log('[Sheet] Column indices:', JSON.stringify(colIdx));

  const lectures = {};
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i];
    const name = String(row[colIdx.name] || '').trim();
    if (!name) continue;
    lectures[name] = {
      category: String(row[colIdx.category] || ''),
      subCategory: String(row[colIdx.subCategory] || ''),
      name: name,
      level: String(row[colIdx.level] || ''),
      intro: String(row[colIdx.intro] || ''),
      goals: String(row[colIdx.goals] || ''),
      target: String(row[colIdx.target] || ''),
      curriculum: String(row[colIdx.curriculum] || ''),
      url: String(row[colIdx.url] || ''),
    };
  }

  cachedData = lectures;
  cacheTime = now;
  console.log(`[Sheet] Loaded ${Object.keys(lectures).length} courses`);
  return lectures;
}

async function findLectures(names) {
  const allData = await getSheetData();
  const results = [];
  const allNames = Object.keys(allData);

  for (const inputName of names) {
    const trimmed = inputName.trim();
    if (!trimmed) continue;

    // Exact match first
    if (allData[trimmed]) {
      results.push(allData[trimmed]);
      continue;
    }

    // Partial match (contains)
    const found = allNames.find(n => n.includes(trimmed) || trimmed.includes(n));
    if (found) {
      results.push(allData[found]);
    } else {
      results.push({ name: trimmed, notFound: true });
    }
  }

  return results;
}

async function getCatalogData() {
  const allData = await getSheetData();
  const lectures = Object.values(allData);

  // Build category list
  const categories = [...new Set(lectures.map(l => l.category).filter(Boolean))].sort();
  const subCategories = [...new Set(lectures.map(l => l.subCategory).filter(Boolean))].sort();
  const levels = [...new Set(lectures.map(l => l.level).filter(Boolean))].sort();

  return {
    total: lectures.length,
    categories,
    subCategories,
    levels,
    lectures: lectures.map(l => ({
      name: l.name,
      category: l.category,
      subCategory: l.subCategory,
      level: l.level,
      intro: l.intro,
      url: l.url,
    })),
  };
}

module.exports = { findLectures, getCatalogData };
