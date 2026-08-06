const iconv = require('iconv-lite');
const { createProvider } = require('./providers');
const { createContract } = require('./contracts');
const { createProduct } = require('./products');
const { createRevenue, addMapping } = require('./revenues');
const { upsertCourseMonthlyPrice, upsertEnrollmentAggregate } = require('./data');

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

function toObjects(buffer) {
  const rows = parseCsv(buffer);
  if (rows.length < 2) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
    return obj;
  });
}

function parseJsonField(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

// 1. CP사/강사
async function importProviders(buffer) {
  const rows = toObjects(buffer);
  let count = 0;
  for (const r of rows) {
    await createProvider({
      name: r.name,
      type: r.type === 'company' ? 'company' : 'individual',
      contact_email: r.contact_email,
      contact_phone: r.contact_phone,
      course_ids: parseJsonField(r.course_ids_json, []),
    });
    count++;
  }
  return { imported: count };
}

// 2. 코스 월별 판매가
async function importCourseMonthlyPrices(buffer) {
  const rows = toObjects(buffer);
  let count = 0;
  for (const r of rows) {
    await upsertCourseMonthlyPrice({
      course_id: r.course_id,
      course_name: r.course_name,
      settlement_year_month: r.settlement_year_month,
      price: r.price,
      marketing_cost: r.marketing_cost,
    });
    count++;
  }
  return { imported: count };
}

// 3. 매출
async function importRevenues(buffer) {
  const rows = toObjects(buffer);
  let count = 0;
  for (const r of rows) {
    await createRevenue({
      revenue_id: r.revenue_id,
      revenue_name: r.revenue_name,
      contract_amount: r.contract_amount,
      contract_start_date: r.contract_start_date,
      contract_end_date: r.contract_end_date,
    });
    count++;
  }
  return { imported: count };
}

// 4. 수강 데이터 (원본) - LMS raw export를 월 단위로 집계 (베스트 에포트 - 원본 컬럼 스펙 미확인)
// 기대 컬럼: product_id, course_id, course_name, product_name, learner_id, watch_seconds, completion_rate
async function importRawEnrollment(buffer, settlementYearMonth) {
  if (!settlementYearMonth) throw new Error('정산 대상월을 선택해주세요.');
  const rows = toObjects(buffer);

  const groups = new Map(); // key: product_id|course_id
  for (const r of rows) {
    const productId = r.product_id || r.상품ID || r['상품 ID'];
    const courseId = r.course_id || r.코스ID || r['코스 ID'];
    if (!productId || !courseId) continue;
    const key = `${productId}|${courseId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        product_id: productId,
        product_name: r.product_name || r.상품명 || '',
        course_id: courseId,
        course_name: r.course_name || r.강의명 || r.코스명 || '',
        total_watch_seconds: 0,
        learners: new Map(), // learner_id -> { seconds, completion_rate }
      });
    }
    const g = groups.get(key);
    const learnerId = r.learner_id || r.이메일 || r.email || `${Math.random()}`;
    const seconds = Number(r.watch_seconds || r['기간내누적수강시간(S)'] || 0);
    const rate = Number(r.completion_rate || r['기간내수강률(%)'] || 0);
    g.total_watch_seconds += seconds;
    const prev = g.learners.get(learnerId) || { seconds: 0, rate: 0 };
    g.learners.set(learnerId, { seconds: prev.seconds + seconds, rate: Math.max(prev.rate, rate) });
  }

  let count = 0;
  for (const g of groups.values()) {
    const learners = [...g.learners.values()];
    const activeCount = learners.filter(l => l.seconds > 0).length;
    const type5EligibleCount = learners.filter(l => l.rate >= 100).length;

    const distribution = { '0-25': 0, '25-50': 0, '50-75': 0, '75-100': 0 };
    for (const l of learners) {
      if (l.rate < 25) distribution['0-25']++;
      else if (l.rate < 50) distribution['25-50']++;
      else if (l.rate < 75) distribution['50-75']++;
      else distribution['75-100']++;
    }

    await upsertEnrollmentAggregate({
      product_id: g.product_id,
      product_name: g.product_name,
      course_id: g.course_id,
      course_name: g.course_name,
      settlement_year_month: settlementYearMonth,
      total_watch_seconds: g.total_watch_seconds,
      active_student_count: activeCount,
      type5_eligible_student_count: type5EligibleCount,
      completion_distribution: distribution,
    });
    count++;
  }
  return { imported: count, note: '원본 수강데이터 자동 집계 (베스트 에포트 - 컬럼 스펙 미검증)' };
}

// 5. 수강 데이터 (집계) - 컬럼 스펙 그대로
async function importAggregatedEnrollment(buffer) {
  const rows = toObjects(buffer);
  let count = 0;
  for (const r of rows) {
    await upsertEnrollmentAggregate({
      product_id: r.product_id,
      product_name: r.product_name,
      course_id: r.course_id,
      course_name: r.course_name,
      settlement_year_month: r.settlement_year_month,
      total_watch_seconds: r.total_watch_seconds,
      active_student_count: r.active_student_count,
      type5_eligible_student_count: r.type5_eligible_student_count,
      completion_distribution: parseJsonField(r.completion_distribution_json, {}),
      learner_identity_keys: parseJsonField(r.learner_identity_keys_json, null),
    });
    count++;
  }
  return { imported: count };
}

// 6. 코스 계약
async function importContracts(buffer) {
  const rows = toObjects(buffer);
  let count = 0;
  for (const r of rows) {
    await createContract({
      provider_id: r.provider_id,
      course_id: r.course_id,
      course_name: r.course_name,
      product_type: r.product_type,
      settlement_type: r.settlement_type_code,
      rate: r.rate,
      fixed_amount_per_student: r.fixed_amount_per_student,
      completion_tiers: parseJsonField(r.completion_tiers_json, []),
    });
    count++;
  }
  return { imported: count };
}

// 7. 상품
async function importProducts(buffer) {
  const rows = toObjects(buffer);
  let count = 0;
  for (const r of rows) {
    await createProduct({
      product_id: r.product_id,
      product_name: r.product_name,
      product_type: r.product_type,
      start_date: r.start_date,
      end_date: r.end_date,
    });
    count++;
  }
  return { imported: count };
}

// 8. 매출-상품 매핑
async function importRevenueProductMappings(buffer) {
  const rows = toObjects(buffer);
  let count = 0;
  const errors = [];
  for (const r of rows) {
    try {
      await addMapping(r.revenue_id, r.product_id);
      count++;
    } catch (err) {
      errors.push(`${r.revenue_id} - ${r.product_id}: ${err.message}`);
    }
  }
  return { imported: count, errors };
}

const IMPORT_TYPES = {
  providers: { label: 'CP사/강사', handler: importProviders, needsPeriod: false },
  course_prices: { label: '코스 월별 판매가', handler: importCourseMonthlyPrices, needsPeriod: false },
  revenues: { label: '매출', handler: importRevenues, needsPeriod: false },
  raw_enrollment: { label: '수강 데이터 (원본)', handler: importRawEnrollment, needsPeriod: true },
  aggregated_enrollment: { label: '수강 데이터 (집계)', handler: importAggregatedEnrollment, needsPeriod: false },
  contracts: { label: '코스 계약', handler: importContracts, needsPeriod: false },
  products: { label: '상품', handler: importProducts, needsPeriod: false },
  revenue_product_mappings: { label: '매출-상품 매핑', handler: importRevenueProductMappings, needsPeriod: false },
};

const TEMPLATES = {
  providers: 'name,type,contact_email,contact_phone,course_ids_json,memo\n홍길동 아카데미,individual,hong@example.com,010-0000-0000,"[""COURSE001"",""COURSE002""]",\n',
  course_prices: 'course_id,course_name,settlement_year_month,price\nCOURSE001,Python 기초,2026-08,150000\n',
  revenues: 'revenue_id,revenue_name,contract_amount,contract_start_date,contract_end_date\nREV-00001,ABC 기업 올플랜,24000000,2026-01-01,2026-12-31\n',
  raw_enrollment: 'product_id,product_name,course_id,course_name,learner_id,watch_seconds,completion_rate\n19097,올 플랜,COURSE001,Python 기초,user@example.com,3600,80\n',
  aggregated_enrollment: 'product_id,product_name,course_id,course_name,settlement_year_month,total_watch_seconds,active_student_count,type5_eligible_student_count,completion_distribution_json,learner_identity_keys_json\n19097,올 플랜,COURSE001,Python 기초,2026-08,8012,4,2,"{""0-25"":1,""25-50"":1,""50-75"":0,""75-100"":2}",\n',
  contracts: 'provider_id,course_id,course_name,product_type,settlement_type_code,rate,fixed_amount_per_student,completion_tiers_json\n1,COURSE001,Python 기초,subscription,RATE_BY_REVENUE_HOUR_RATIO,0.5,,\n',
  products: 'product_id,product_name,product_type,start_date,end_date\n19097,올 플랜 - 26년 8월,subscription,2026-08-01,2027-07-31\n',
  revenue_product_mappings: 'revenue_id,product_id\nREV-00001,19097\n',
};

module.exports = { IMPORT_TYPES, TEMPLATES, parseCsv, toObjects };
