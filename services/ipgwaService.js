const XLSX = require('xlsx');

// Main 시트 컬럼: 번호(0), 이름(1), 휴대폰(2), 이메일(3), 직무(4), 직급(5), 소속/부서(6), 상품명(7)
// 매핑: A=이름, B=휴대폰, C=이메일, D=직무, E=직급, F=소속/부서

const SHEET_CONFIGS = [
  {
    id: 'backoffice-member',
    name: '백오피스_멤버 일괄등록',
    headers: ['ID', '이메일', '이름', '연락용이메일', '휴대폰번호', '소속회사', '부서', '직무', '직급', '연동ID'],
    mapRow: (row, extras) => [
      '',           // ID
      row[3] || '', // 이메일 ← C
      row[1] || '', // 이름 ← A
      extras.contactEmail || '', // 연락용이메일
      row[2] || '',              // 휴대폰번호 ← B
      '',           // 소속회사
      row[6] || '', // 부서 ← F
      row[4] || '', // 직무 ← D
      row[5] || '', // 직급 ← E
      '',           // 연동ID
    ],
  },
  {
    id: 'backoffice-lecture',
    name: '백오피스_필수강의등록',
    headers: ['이메일', '상품ID', '코스ID', '학습시작일', '학습종료일', '학습시간(출석)'],
    mapRow: (row, extras) => [
      row[3] || '',              // 이메일 ← C
      extras.productId || '',    // 상품ID
      extras.courseId || '',     // 코스ID
      extras.startDate || '',   // 학습시작일
      extras.endDate || '',     // 학습종료일
      '',                        // 학습시간(출석)
    ],
  },
  {
    id: 'backoffice-product',
    name: '백오피스_상품연결',
    headers: ['ID/Email'],
    mapRow: (row) => [
      row[3] || '', // ID/Email ← C
    ],
  },
  {
    id: 'simple-member',
    name: '간편입과_멤버일괄등록',
    headers: ['유형', '이름', '휴대폰 번호', '이메일', '연락용이메일', '직무', '직급', '소속 부서/팀', '고객사연동계정ID(사번)', '상품ID'],
    mapRow: (row, extras) => [
      '',                        // 유형
      row[1] || '',              // 이름 ← A
      row[2] || '',              // 휴대폰 번호 ← B
      row[3] || '',              // 이메일 ← C
      extras.contactEmail || '', // 연락용이메일
      row[4] || '',              // 직무 ← D
      row[5] || '',              // 직급 ← E
      row[6] || '',              // 소속 부서/팀 ← F
      '',                        // 고객사연동계정ID(사번)
      extras.productId || '',    // 상품ID
    ],
  },
  {
    id: 'alimtalk-general',
    name: '알림톡_수강안내일반',
    headers: ['recipient_no', '이름', '수강 시작일', '수강 종료일'],
    mapRow: (row, extras) => [
      row[2] || '',             // recipient_no ← 휴대폰 번호
      row[1] || '',             // 이름
      extras.startDate || '',   // 수강 시작일
      extras.endDate || '',     // 수강 종료일
    ],
  },
  {
    id: 'alimtalk-required',
    name: '알림톡_수강안내필수',
    headers: ['recipient_no', '이름', '필수 시작일', '필수 종료일', '복습 시작일', '복습 종료일', '수료기준'],
    mapRow: (row) => [
      row[2] || '', // recipient_no ← 휴대폰 번호
      row[1] || '', // 이름
      '',           // 필수 시작일
      '',           // 필수 종료일
      '',           // 복습 시작일
      '',           // 복습 종료일
      '',           // 수료기준
    ],
  },
];

function parseMainSheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  // Main 시트가 있으면 사용, 없으면 첫 번째 시트 사용
  const ws = wb.Sheets['Main'] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    throw new Error('시트를 찾을 수 없습니다.');
  }
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // Skip header row
  return data.slice(1).filter(row => row.some(cell => cell !== ''));
}

function generateSheet(rows, config, extras = {}) {
  const wb = XLSX.utils.book_new();
  const sheetData = [config.headers, ...rows.map(row => config.mapRow(row, extras))];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Set column widths
  ws['!cols'] = config.headers.map(h => ({ wch: Math.max(h.length * 2, 12) }));

  XLSX.utils.book_append_sheet(wb, ws, config.name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { SHEET_CONFIGS, parseMainSheet, generateSheet };
