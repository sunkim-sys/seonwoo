const db = require('../db');
const { ensureTables } = require('./schema');

const MS_PER_DAY = 86400000;

function toDate(d) {
  return d instanceof Date ? d : new Date(`${d}T00:00:00Z`);
}

function monthRange(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // last day of month
  return { start, end };
}

// 두 구간의 겹치는 일수 (양끝 포함)
function overlapDays(aStart, aEnd, bStart, bEnd) {
  const start = new Date(Math.max(toDate(aStart), toDate(bStart)));
  const end = new Date(Math.min(toDate(aEnd), toDate(bEnd)));
  if (start > end) return 0;
  return Math.round((end - start) / MS_PER_DAY) + 1;
}

function inclusiveDayCount(start, end) {
  return Math.round((toDate(end) - toDate(start)) / MS_PER_DAY) + 1;
}

// ---- TYPE2: 매출-수강시간 (확인된 공식) ----
async function calcRevenueHourRatio(contract, yearMonth) {
  const { start: monthStart, end: monthEnd } = monthRange(yearMonth);

  const { rows: aggRows } = await db.query(
    `SELECT * FROM settle_enrollment_aggregates WHERE course_id = $1 AND settlement_year_month = $2`,
    [contract.course_id, yearMonth]
  );
  if (!aggRows.length) {
    return { amount: 0, detail: { products: [], note: '수강 데이터 집계 없음' } };
  }

  let total = 0;
  const productDetails = [];

  for (const agg of aggRows) {
    const { rows: productRows } = await db.query(
      'SELECT * FROM settle_products WHERE product_id = $1', [agg.product_id]
    );
    const product = productRows[0];
    if (!product || product.settlement_excluded) continue;

    const { rows: totalRows } = await db.query(
      `SELECT COALESCE(SUM(total_watch_seconds), 0) AS total
       FROM settle_enrollment_aggregates WHERE product_id = $1 AND settlement_year_month = $2`,
      [agg.product_id, yearMonth]
    );
    const productTotalWatchSeconds = Number(totalRows[0].total);

    const { rows: revenueRows } = await db.query(
      `SELECT r.* FROM settle_revenues r
       JOIN settle_revenue_product_map m ON m.revenue_id = r.revenue_id
       WHERE m.product_id = $1`,
      [agg.product_id]
    );

    const revenueDetails = [];
    let productContribution = 0;

    for (const rev of revenueRows) {
      // 매출 계약기간 ∩ 상품 활성기간 ∩ 정산 대상월, 세 구간이 모두 겹치는 일수
      const revenueProductOverlapStart = new Date(Math.max(toDate(rev.contract_start_date), toDate(product.start_date)));
      const revenueProductOverlapEnd = new Date(Math.min(toDate(rev.contract_end_date), toDate(product.end_date)));
      const effectiveDays = revenueProductOverlapStart > revenueProductOverlapEnd
        ? 0
        : overlapDays(revenueProductOverlapStart, revenueProductOverlapEnd, monthStart, monthEnd);
      if (!effectiveDays) continue;

      const contractPeriodDays = inclusiveDayCount(rev.contract_start_date, rev.contract_end_date);
      const dailyAmount = Number(rev.contract_amount) / contractPeriodDays;
      const proratedRevenue = dailyAmount * effectiveDays;
      const hourRatio = productTotalWatchSeconds > 0 ? Number(agg.total_watch_seconds) / productTotalWatchSeconds : 0;
      const rate = Number(contract.rate || 0);
      const contribution = proratedRevenue * hourRatio * rate;
      productContribution += contribution;

      revenueDetails.push({
        revenue_id: rev.revenue_id,
        contract_amount: Number(rev.contract_amount),
        contract_period_days: contractPeriodDays,
        effective_days: effectiveDays,
        daily_amount: dailyAmount,
        prorated_revenue: proratedRevenue,
        course_watch_seconds: Number(agg.total_watch_seconds),
        product_total_watch_seconds: productTotalWatchSeconds,
        hour_ratio: hourRatio,
        rate,
        contribution,
      });
    }

    total += productContribution;
    productDetails.push({
      product_id: agg.product_id,
      product_start_date: product.start_date,
      product_end_date: product.end_date,
      overlapping_revenue_count: revenueDetails.length,
      revenues: revenueDetails,
    });
  }

  return { amount: total, detail: { products: productDetails } };
}

// ---- TYPE1: 판매가 기준 (미검증 - CSV 스키마 기반 추정) ----
async function calcCoursePrice(contract, yearMonth) {
  const { rows } = await db.query(
    `SELECT * FROM settle_course_monthly_prices WHERE course_id = $1 AND settlement_year_month = $2`,
    [contract.course_id, yearMonth]
  );
  const priceRow = rows[0];
  if (!priceRow) return { amount: 0, detail: { note: '코스 월별 판매가 데이터 없음', verified: false } };

  const rate = Number(contract.rate || 0);
  const amount = Number(priceRow.price) * rate;
  return { amount, detail: { price: Number(priceRow.price), rate, verified: false } };
}

// ---- TYPE3: 마케팅비 차감 (미검증 - 마케팅비 출처 불명, course_monthly_prices.marketing_cost로 가정) ----
async function calcPriceMinusMarketing(contract, yearMonth) {
  const { rows } = await db.query(
    `SELECT * FROM settle_course_monthly_prices WHERE course_id = $1 AND settlement_year_month = $2`,
    [contract.course_id, yearMonth]
  );
  const priceRow = rows[0];
  if (!priceRow) return { amount: 0, detail: { note: '코스 월별 판매가/마케팅비 데이터 없음', verified: false } };

  const rate = Number(contract.rate || 0);
  const base = Number(priceRow.price) - Number(priceRow.marketing_cost || 0);
  const amount = Math.max(0, base) * rate;
  return {
    amount,
    detail: { price: Number(priceRow.price), marketing_cost: Number(priceRow.marketing_cost || 0), rate, verified: false },
  };
}

// ---- TYPE4: 수강률 구간 (미검증 - 구간 매칭 로직 추정) ----
async function calcCompletionTier(contract, yearMonth) {
  const { rows: aggRows } = await db.query(
    `SELECT * FROM settle_enrollment_aggregates WHERE course_id = $1 AND settlement_year_month = $2`,
    [contract.course_id, yearMonth]
  );
  const tiers = Array.isArray(contract.completion_tiers) ? contract.completion_tiers : [];
  if (!aggRows.length || !tiers.length) {
    return { amount: 0, detail: { note: '수강 데이터 집계 또는 구간 설정 없음', verified: false } };
  }

  let total = 0;
  const tierDetails = [];
  for (const agg of aggRows) {
    const dist = agg.completion_distribution || {};
    for (const tier of tiers) {
      const count = Number(dist[tier.bucket] || 0);
      if (!count) continue;
      const contribution = count * Number(tier.amount_per_student || 0);
      total += contribution;
      tierDetails.push({ product_id: agg.product_id, bucket: tier.bucket, student_count: count, amount_per_student: Number(tier.amount_per_student || 0), contribution });
    }
  }
  return { amount: total, detail: { completion_tier_details: tierDetails, verified: false } };
}

// ---- TYPE5: 수강생 고정금액 (미검증 - 스키마 기반 추정) ----
async function calcFixedPerStudent(contract, yearMonth) {
  const { rows: aggRows } = await db.query(
    `SELECT * FROM settle_enrollment_aggregates WHERE course_id = $1 AND settlement_year_month = $2`,
    [contract.course_id, yearMonth]
  );
  const perStudent = Number(contract.fixed_amount_per_student || 0);
  let studentCount = 0;
  for (const agg of aggRows) {
    studentCount += Number(agg.type5_eligible_student_count || 0);
  }
  return { amount: studentCount * perStudent, detail: { eligible_student_count: studentCount, amount_per_student: perStudent, verified: false } };
}

const CALCULATORS = {
  RATE_BY_COURSE_PRICE: calcCoursePrice,
  RATE_BY_REVENUE_HOUR_RATIO: calcRevenueHourRatio,
  RATE_BY_PRICE_MINUS_MARKETING: calcPriceMinusMarketing,
  RATE_BY_COMPLETION_TIER: calcCompletionTier,
  FIXED_PER_STUDENT: calcFixedPerStudent,
  // TURNKEY: 정산 불필요 - 계산 대상에서 제외
};

async function runSettlementCalculation(yearMonth) {
  await ensureTables();
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw new Error('정산 대상월 형식이 올바르지 않습니다 (YYYY-MM).');

  const { rows: contracts } = await db.query(`
    SELECT c.*, p.name AS provider_name FROM settle_contracts c
    JOIN settle_providers p ON p.id = c.provider_id
  `);

  const results = [];
  for (const contract of contracts) {
    if (contract.settlement_type === 'TURNKEY') continue;
    const calculator = CALCULATORS[contract.settlement_type];
    if (!calculator) continue;

    const { amount, detail } = await calculator(contract, yearMonth);

    const { rows: versionRows } = await db.query(
      `SELECT COALESCE(MAX(version), 0) AS max_version FROM settle_settlements
       WHERE contract_id = $1 AND settlement_year_month = $2`,
      [contract.id, yearMonth]
    );
    const nextVersion = Number(versionRows[0].max_version) + 1;

    const { rows: inserted } = await db.query(
      `INSERT INTO settle_settlements
         (provider_id, contract_id, course_id, settlement_year_month, settlement_type, amount, version, status, calculation_detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '계산됨', $8)
       RETURNING *`,
      [contract.provider_id, contract.id, contract.course_id, yearMonth, contract.settlement_type, amount, nextVersion, JSON.stringify(detail)]
    );
    results.push(inserted[0]);
  }

  return results;
}

async function listSettlements(yearMonth) {
  await ensureTables();
  const { rows } = await db.query(`
    SELECT s.*, p.name AS provider_name, c.course_name, c.product_type
    FROM settle_settlements s
    JOIN settle_providers p ON p.id = s.provider_id
    JOIN settle_contracts c ON c.id = s.contract_id
    WHERE s.settlement_year_month = $1
    ORDER BY s.provider_id, s.course_id, s.version DESC
  `, [yearMonth]);
  return rows;
}

async function getSettlement(id) {
  await ensureTables();
  const { rows } = await db.query(`
    SELECT s.*, p.name AS provider_name, c.course_name, c.product_type
    FROM settle_settlements s
    JOIN settle_providers p ON p.id = s.provider_id
    JOIN settle_contracts c ON c.id = s.contract_id
    WHERE s.id = $1
  `, [id]);
  return rows[0] || null;
}

async function confirmSettlement(id) {
  await ensureTables();
  const { rows } = await db.query(
    `UPDATE settle_settlements SET status = '확정' WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { runSettlementCalculation, listSettlements, getSettlement, confirmSettlement };
