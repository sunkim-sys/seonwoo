const XLSX = require('xlsx');

const HEADER_ALIASES = {
  name:    ['이름', '성명', '회원명', '수강생명', '이름(한글)'],
  phone:   ['휴대폰', '휴대폰번호', '휴대폰 번호', '연락처', '전화번호', '핸드폰', '핸드폰번호', '핸드폰 번호', '모바일'],
  email:   ['이메일', 'e-mail', 'email', '메일', '이메일주소', '이메일 주소'],
  dept:    ['소속', '소속부서', '부서', '부서명', '소속/부서', '소속 부서', '팀', '팀명'],
  rank:    ['직급', '직위'],
  job:     ['직무', '직책', '담당업무', '업무'],
  empId:   ['사번', '사원번호'],
};

function normalizeHeader(h) {
  return String(h || '').replace(/\s+/g, '').toLowerCase();
}

function buildHeaderIndex(headerRow) {
  const normalized = headerRow.map(normalizeHeader);
  const index = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const normAliases = aliases.map(normalizeHeader);
    const pos = normalized.findIndex(h => normAliases.includes(h));
    if (pos !== -1) index[field] = pos;
  }
  return index;
}

function cleanName(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim().replace(/\s+/g, ' ');
}

function cleanEmail(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim().toLowerCase().replace(/\s+/g, '');
}

function cleanPhone(v) {
  if (v === null || v === undefined) return '';
  // Extract digits only
  let digits = String(v).replace(/\D/g, '');
  // Korean mobile: 010xxxxxxxx (11 digits) → 010-xxxx-xxxx
  if (digits.startsWith('82') && digits.length >= 12) {
    // +82 form: drop 82, prepend 0
    digits = '0' + digits.slice(2);
  }
  if (/^010\d{8}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (/^01[1-9]\d{7,8}$/.test(digits)) {
    const mid = digits.length === 10 ? 3 : 4;
    return `${digits.slice(0, 3)}-${digits.slice(3, 3 + mid)}-${digits.slice(3 + mid)}`;
  }
  // Fallback: return cleaned digits joined with original-ish format
  return digits || String(v).trim();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(v) { return v && EMAIL_RE.test(v); }
function isValidPhone(v) { return v && /^01\d-\d{3,4}-\d{4}$/.test(v); }

function processBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (data.length < 2) throw new Error('헤더와 최소 1건의 데이터가 필요합니다.');

  const rawHeaders = data[0].map(h => String(h || ''));
  const headerIndex = buildHeaderIndex(rawHeaders);

  const recognized = Object.keys(headerIndex);
  if (recognized.length === 0) throw new Error('인식 가능한 컬럼(이름/이메일/전화번호 등)이 없습니다.');

  const rows = data.slice(1).filter(r => r.some(v => v !== '' && v !== null && v !== undefined));

  const cleanedRows = rows.map((row, i) => {
    const out = [...row];
    if (headerIndex.name !== undefined) out[headerIndex.name] = cleanName(row[headerIndex.name]);
    if (headerIndex.email !== undefined) out[headerIndex.email] = cleanEmail(row[headerIndex.email]);
    if (headerIndex.phone !== undefined) out[headerIndex.phone] = cleanPhone(row[headerIndex.phone]);
    if (headerIndex.dept !== undefined) out[headerIndex.dept] = cleanName(row[headerIndex.dept]);
    return out;
  });

  // Track changes per row
  const changes = cleanedRows.map((cleaned, i) => {
    const orig = rows[i];
    const diffs = [];
    Object.entries(headerIndex).forEach(([field, idx]) => {
      const o = orig[idx];
      const c = cleaned[idx];
      if (String(o ?? '') !== String(c ?? '')) {
        diffs.push({ field, before: String(o ?? ''), after: String(c ?? '') });
      }
    });
    return diffs;
  });

  // Detect issues
  const issues = [];
  cleanedRows.forEach((row, i) => {
    const rowNumber = i + 2;
    const name = headerIndex.name !== undefined ? row[headerIndex.name] : '';
    if (headerIndex.email !== undefined) {
      const v = row[headerIndex.email];
      if (v && !isValidEmail(v)) {
        issues.push({ rowNumber, name, field: '이메일', value: v, reason: '이메일 형식 오류' });
      }
    }
    if (headerIndex.phone !== undefined) {
      const v = row[headerIndex.phone];
      if (v && !isValidPhone(v)) {
        issues.push({ rowNumber, name, field: '휴대폰', value: v, reason: '전화번호 형식 오류' });
      }
    }
  });

  // Detect duplicates
  const dupIssues = [];
  function findDups(field, label) {
    if (headerIndex[field] === undefined) return;
    const map = new Map();
    cleanedRows.forEach((row, i) => {
      const v = String(row[headerIndex[field]] || '').trim().toLowerCase();
      if (!v) return;
      if (!map.has(v)) map.set(v, []);
      map.get(v).push(i);
    });
    for (const [val, idxs] of map.entries()) {
      if (idxs.length > 1) {
        idxs.forEach(i => {
          dupIssues.push({
            rowNumber: i + 2,
            name: headerIndex.name !== undefined ? cleanedRows[i][headerIndex.name] : '',
            field: label,
            value: val,
            reason: `중복 (${idxs.length}건: ${idxs.map(j => j + 2).join(', ')}행)`,
          });
        });
      }
    }
  }
  findDups('email', '이메일');
  findDups('phone', '휴대폰');

  // Build preview rows (limited fields for display)
  const fieldOrder = ['name', 'email', 'phone', 'dept', 'rank', 'job', 'empId'];
  const previewHeaders = [];
  const previewIdx = [];
  fieldOrder.forEach(f => {
    if (headerIndex[f] !== undefined) {
      previewHeaders.push({ name: '', email: '이메일', phone: '휴대폰', dept: '부서', rank: '직급', job: '직무', empId: '사번' }[f] || f);
      if (f === 'name') previewHeaders[previewHeaders.length - 1] = '이름';
      previewIdx.push(headerIndex[f]);
    }
  });

  const previewRows = cleanedRows.map((row, i) => ({
    rowNumber: i + 2,
    cells: previewIdx.map(idx => String(row[idx] ?? '')),
    diffs: changes[i],
  }));

  return {
    rawHeaders,
    headerIndex,
    rows: cleanedRows,
    recognized,
    summary: {
      totalRows: cleanedRows.length,
      changedRows: changes.filter(d => d.length > 0).length,
      formatIssues: issues.length,
      duplicateIssues: dupIssues.length,
    },
    issues,
    duplicates: dupIssues,
    preview: { headers: previewHeaders, rows: previewRows },
  };
}

function buildCleanedXlsx(rawHeaders, rows, summary) {
  const aoa = [rawHeaders, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = rawHeaders.map(h => ({ wch: Math.max(String(h).length * 2, 12) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '클렌징 결과');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { processBuffer, buildCleanedXlsx };
