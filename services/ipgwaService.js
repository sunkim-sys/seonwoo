const XLSX = require('xlsx');

// 입력 시트의 컬럼 순서는 고정이 아님 - 헤더 이름으로 매핑.
// 아래 HEADER_ALIASES에 등록된 이름 중 하나로 헤더가 들어오면 해당 필드로 인식.

const HEADER_ALIASES = {
  name:    ['이름', '성명', '회원명'],
  phone:   ['휴대폰', '휴대폰번호', '휴대폰 번호', '연락처', '전화번호', '핸드폰', '핸드폰번호', '핸드폰 번호', '모바일'],
  email:   ['이메일', 'e-mail', 'email', '메일', '이메일주소', '이메일 주소'],
  job:     ['직무', '직책', '담당업무', '업무'],
  rank:    ['직급', '직위'],
  dept:    ['소속', '소속부서', '부서', '부서명', '소속/부서', '소속 부서', '팀', '팀명', '소속 부서/팀'],
  product: ['상품명', '상품'],
  empId:   ['사번', '사원번호', '연동ID', '고객사연동계정ID', '고객사연동계정ID(사번)'],
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

function get(row, headerIndex, field) {
  const pos = headerIndex[field];
  if (pos === undefined) return '';
  const v = row[pos];
  return v === undefined || v === null ? '' : v;
}

const SHEET_CONFIGS = [
  {
    id: 'backoffice-member',
    name: '백오피스_멤버 일괄등록',
    headers: ['ID', '이메일', '이름', '연락용이메일', '휴대폰번호', '소속회사', '부서', '직무', '직급', '연동ID'],
    mapRow: (row, extras, h) => [
      '',                          // ID
      get(row, h, 'email'),        // 이메일
      get(row, h, 'name'),         // 이름
      extras.contactEmail || '',   // 연락용이메일
      get(row, h, 'phone'),        // 휴대폰번호
      '',                          // 소속회사
      get(row, h, 'dept'),         // 부서
      get(row, h, 'job'),          // 직무
      get(row, h, 'rank'),         // 직급
      get(row, h, 'empId'),        // 연동ID
    ],
  },
  {
    id: 'backoffice-lecture',
    name: '백오피스_필수강의등록',
    headers: ['이메일', '상품ID', '코스ID', '학습시작일', '학습종료일', '학습시간(출석)'],
    mapRow: (row, extras, h) => [
      get(row, h, 'email'),
      extras.productId || '',
      extras.courseId || '',
      extras.startDate || '',
      extras.endDate || '',
      '',
    ],
  },
  {
    id: 'backoffice-product',
    name: '백오피스_상품연결',
    headers: ['ID/Email'],
    mapRow: (row, extras, h) => [
      get(row, h, 'email'),
    ],
  },
  {
    id: 'simple-member',
    name: '간편입과_멤버일괄등록',
    headers: ['유형', '이름', '휴대폰 번호', '이메일', '연락용이메일', '직무', '직급', '소속 부서/팀', '고객사연동계정ID(사번)', '상품ID'],
    mapRow: (row, extras, h) => [
      '',
      get(row, h, 'name'),
      get(row, h, 'phone'),
      get(row, h, 'email'),
      extras.contactEmail || '',
      get(row, h, 'job'),
      get(row, h, 'rank'),
      get(row, h, 'dept'),
      get(row, h, 'empId'),
      extras.productId || '',
    ],
  },
  {
    id: 'alimtalk-general',
    name: '알림톡_수강안내일반',
    headers: ['recipient_no', '이름', '수강 시작일', '수강 종료일'],
    mapRow: (row, extras, h) => [
      get(row, h, 'phone'),
      get(row, h, 'name'),
      extras.startDate || '',
      extras.endDate || '',
    ],
  },
  {
    id: 'alimtalk-required',
    name: '알림톡_수강안내필수',
    headers: ['recipient_no', '이름', '필수 시작일', '필수 종료일', '복습 시작일', '복습 종료일', '수료기준'],
    mapRow: (row, extras, h) => [
      get(row, h, 'phone'),
      get(row, h, 'name'),
      '',
      '',
      '',
      '',
      '',
    ],
  },
];

function validateEmail(value) {
  const v = String(value).trim();
  if (!v) return null;
  if (/\s/.test(v)) return '공백이 포함돼 있음';
  if ((v.match(/@/g) || []).length !== 1) return '@ 기호가 없거나 여러 개임';
  const [local, domain] = v.split('@');
  if (!local) return '@ 앞부분이 비어있음';
  if (!domain) return '@ 뒷부분이 비어있음';
  if (v.includes('..')) return '점(.)이 연속으로 있음';
  if (v.startsWith('.') || v.endsWith('.')) return '점(.)으로 시작하거나 끝남';
  if (!domain.includes('.')) return '도메인에 점(.)이 없음 (예: .com)';
  if (domain.startsWith('.') || domain.endsWith('.')) return '도메인이 점(.)으로 시작/끝남';
  if (!/^[A-Za-z0-9._%+\-]+$/.test(local)) return '사용할 수 없는 문자가 포함됨';
  if (!/^[A-Za-z0-9.\-]+$/.test(domain)) return '도메인에 사용할 수 없는 문자가 포함됨';
  return null;
}

function validatePhone(value) {
  const raw = String(value).trim();
  if (!raw) return null;
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return '숫자/하이픈/공백 외 문자가 포함됨';
  if (!digits.startsWith('010')) return '010으로 시작하지 않음';
  if (digits.length !== 11) return `자릿수가 ${digits.length}자리 (11자리여야 함)`;
  // Allowed formats: 01012345678 or 010-1234-5678
  if (!/^010\d{8}$/.test(digits)) return '형식 오류';
  if (raw.includes('-') && !/^010-\d{4}-\d{4}$/.test(raw)) return '하이픈 위치가 010-XXXX-XXXX 형식과 다름';
  return null;
}

function validateRows(parsed) {
  const { rows, headerIndex } = parsed;
  const issues = [];
  rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for header, +1 for 1-based
    const name = get(row, headerIndex, 'name');

    if (headerIndex.email !== undefined) {
      const email = get(row, headerIndex, 'email');
      const err = validateEmail(email);
      if (err) {
        issues.push({ rowNumber, field: '이메일', name, value: email, reason: err });
      }
    }

    if (headerIndex.phone !== undefined) {
      const phone = get(row, headerIndex, 'phone');
      const err = validatePhone(phone);
      if (err) {
        issues.push({ rowNumber, field: '휴대폰', name, value: phone, reason: err });
      }
    }
  });
  return issues;
}

function parseMainSheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets['Main'] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    throw new Error('시트를 찾을 수 없습니다.');
  }
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (data.length === 0) {
    throw new Error('빈 시트입니다.');
  }

  const headerRow = data[0];
  const headerIndex = buildHeaderIndex(headerRow);

  if (headerIndex.name === undefined && headerIndex.email === undefined && headerIndex.phone === undefined) {
    throw new Error('헤더에서 이름/이메일/휴대폰 컬럼을 찾지 못했습니다. 첫 행을 확인해 주세요.');
  }

  const rows = data.slice(1).filter(row => row.some(cell => cell !== '' && cell !== null && cell !== undefined));
  return { rows, headerIndex, rawHeaders: headerRow };
}

function generatePreview(parsed, config, extras = {}) {
  const { rows, headerIndex } = parsed;
  return {
    headers: config.headers,
    rows: rows.map(row => config.mapRow(row, extras, headerIndex)),
  };
}

function generateSheet(parsed, config, extras = {}) {
  const { rows, headerIndex } = parsed;
  const wb = XLSX.utils.book_new();
  const sheetData = [config.headers, ...rows.map(row => config.mapRow(row, extras, headerIndex))];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  ws['!cols'] = config.headers.map(h => ({ wch: Math.max(h.length * 2, 12) }));

  XLSX.utils.book_append_sheet(wb, ws, config.name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { SHEET_CONFIGS, parseMainSheet, generateSheet, generatePreview, validateRows };
