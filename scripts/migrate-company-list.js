// One-off migration: import the '기업 리스트' sheet from the CSM master
// xlsx export into the company_list Postgres table.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/migrate-company-list.js "C:\path\to\file.xlsx" [--reset]
//
// --reset truncates company_list before inserting (safe to re-run).

const path = require('path');
const XLSX = require('xlsx');
const db = require('../services/db');
const { ensureTable } = require('../services/companyListService');

const SHEET_NAME = '기업 리스트';

function excelSerialToISODate(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const utcDays = Math.floor(serial - 25569);
  const utcMs = utcDays * 86400 * 1000;
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function main() {
  const filePath = process.argv[2];
  const reset = process.argv.includes('--reset');

  if (!filePath) {
    console.error('사용법: node scripts/migrate-company-list.js <xlsx 경로> [--reset]');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL 환경변수가 필요합니다.');
    process.exit(1);
  }

  console.log(`[Migrate] Reading ${path.resolve(filePath)}...`);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) throw new Error(`시트를 찾을 수 없습니다: ${SHEET_NAME}`);

  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const rows = data.slice(2).filter(r => String(r[3] || '').trim()); // 멤버그룹명 있는 행만

  console.log(`[Migrate] ${rows.length}개 행 발견`);

  await ensureTable();

  if (reset) {
    console.log('[Migrate] --reset: 기존 데이터 삭제');
    await db.query('TRUNCATE TABLE company_list RESTART IDENTITY');
  }

  let inserted = 0;
  for (const r of rows) {
    const record = {
      member_group_name: String(r[3] || '').trim(),
      member_group_ext_id: r[4] ? String(r[4]) : null,
      csm: String(r[5] || '').trim() || null,
      ae: String(r[6] || '').trim() || null,
      plan: String(r[8] || '').trim() || null,
      enroll_type: String(r[9] || '').trim() || null,
      status: String(r[14] || '').trim() || null,
      completion_criteria: String(r[15] || '').trim() || null,
      first_enroll_date: excelSerialToISODate(r[17]),
      lecture_start_date: excelSerialToISODate(r[18]),
      lecture_end_date: excelSerialToISODate(r[19]),
      edu_manager_name: String(r[22] || '').trim() || null,
      edu_manager_email: String(r[23] || '').trim() || null,
      edu_manager_phone: String(r[24] || '').trim() || null,
    };

    const cols = Object.keys(record);
    const values = Object.values(record);
    const placeholders = cols.map((_, i) => `$${i + 1}`);

    await db.query(
      `INSERT INTO company_list (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
      values
    );
    inserted++;
  }

  console.log(`[Migrate] 완료: ${inserted}개 행 삽입`);
  process.exit(0);
}

main().catch(err => {
  console.error('[Migrate] 실패:', err);
  process.exit(1);
});
