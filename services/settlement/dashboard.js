const db = require('../db');
const { ensureTables, SETTLEMENT_TYPES } = require('./schema');

function prevMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// 계약별 최신 버전 정산 행만 추출 (합계/현황 집계는 항상 최신 버전 기준)
async function latestSettlementRows(yearMonth) {
  const { rows } = await db.query(`
    SELECT DISTINCT ON (s.contract_id) s.*, p.name AS provider_name, c.course_name
    FROM settle_settlements s
    JOIN settle_providers p ON p.id = s.provider_id
    JOIN settle_contracts c ON c.id = s.contract_id
    WHERE s.settlement_year_month = $1
    ORDER BY s.contract_id, s.version DESC
  `, [yearMonth]);
  return rows;
}

async function getSummary(yearMonth) {
  await ensureTables();
  const current = await latestSettlementRows(yearMonth);
  const previous = await latestSettlementRows(prevMonth(yearMonth));

  const totalAmount = current.reduce((s, r) => s + Number(r.amount), 0);
  const prevTotalAmount = previous.reduce((s, r) => s + Number(r.amount), 0);
  const courseCount = current.length;
  const prevCourseCount = previous.length;
  const calculatedCount = current.filter(r => r.status === '계산됨').length;
  const confirmedCount = current.filter(r => r.status === '확정').length;

  const byType = {};
  for (const r of current) {
    byType[r.settlement_type] = (byType[r.settlement_type] || 0) + Number(r.amount);
  }
  const typeBreakdown = Object.entries(SETTLEMENT_TYPES).map(([code, meta]) => ({
    code, label: meta.label, amount: byType[code] || 0,
  }));

  const byProvider = {};
  for (const r of current) {
    if (!byProvider[r.provider_name]) byProvider[r.provider_name] = { provider: r.provider_name, course_count: 0, amount: 0, calculated: 0, confirmed: 0 };
    byProvider[r.provider_name].course_count += 1;
    byProvider[r.provider_name].amount += Number(r.amount);
    if (r.status === '계산됨') byProvider[r.provider_name].calculated += 1;
    if (r.status === '확정') byProvider[r.provider_name].confirmed += 1;
  }
  const byProviderList = Object.values(byProvider).sort((a, b) => b.amount - a.amount);

  const pct = (curr, prev) => (prev > 0 ? ((curr - prev) / prev) * 100 : null);

  return {
    period: yearMonth,
    total_amount: totalAmount,
    total_amount_mom_pct: pct(totalAmount, prevTotalAmount),
    course_count: courseCount,
    course_count_mom_pct: pct(courseCount, prevCourseCount),
    calculated_count: calculatedCount,
    confirmed_count: confirmedCount,
    type_breakdown: typeBreakdown,
    by_provider: byProviderList,
  };
}

async function getTrend(startPeriod, endPeriod) {
  await ensureTables();
  const months = [];
  let [y, m] = startPeriod.split('-').map(Number);
  const [endY, endM] = endPeriod.split('-').map(Number);
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }

  const monthly = [];
  const typeMonthly = [];
  for (const period of months) {
    const rows = await latestSettlementRows(period);
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    monthly.push({ period, amount: total });

    const byType = {};
    for (const r of rows) byType[r.settlement_type] = (byType[r.settlement_type] || 0) + Number(r.amount);
    typeMonthly.push({ period, by_type: byType });
  }

  return { months, monthly, type_monthly: typeMonthly };
}

// 검토: 데이터 정합성 워크리스트 (미검증 - 원본 화면의 정확한 판정 기준은 확인 못함, 합리적 추정 규칙 적용)
async function getReview(yearMonth) {
  await ensureTables();

  const { rows: aggRows } = await db.query(
    `SELECT DISTINCT product_id, product_name, course_id, course_name, total_watch_seconds, active_student_count
     FROM settle_enrollment_aggregates WHERE settlement_year_month = $1`,
    [yearMonth]
  );

  const { rows: products } = await db.query('SELECT * FROM settle_products');
  const productMap = new Map(products.map(p => [p.product_id, p]));

  const { rows: mappings } = await db.query('SELECT DISTINCT product_id FROM settle_revenue_product_map');
  const mappedProductIds = new Set(mappings.map(m => m.product_id));

  const { rows: contracts } = await db.query('SELECT * FROM settle_contracts');
  const contractByCourse = new Map(contracts.map(c => [c.course_id, c]));

  const latest = await latestSettlementRows(yearMonth);
  const settledCourseIds = new Set(latest.map(r => r.course_id));

  let productNotRegistered = 0;
  let revenueNotMapped = 0;
  let settlementNotCreated = 0;
  const items = [];

  for (const agg of aggRows) {
    const product = productMap.get(agg.product_id);
    const contract = contractByCourse.get(agg.course_id);
    const issues = [];
    const actions = [];

    if (!product) {
      issues.push('상품 미등록');
      productNotRegistered += 1;
    } else if (product.product_type === 'subscription' && !mappedProductIds.has(agg.product_id)) {
      issues.push('매출 미매핑');
      revenueNotMapped += 1;
      actions.push('매출 매핑');
    }

    if (!contract || contract.settlement_type === 'TURNKEY') {
      // 턴키/계약 미등록은 정산 대상이 아니므로 미생성으로 세지 않음
    } else if (!settledCourseIds.has(agg.course_id)) {
      issues.push('정산 미생성');
      settlementNotCreated += 1;
      actions.push('정산 제외');
    }

    if (issues.length) {
      items.push({
        product_id: agg.product_id,
        product_name: agg.product_name || product?.product_name || agg.product_id,
        product_type: product?.product_type || '-',
        course_count: 1,
        total_watch_seconds: Number(agg.total_watch_seconds),
        issues,
        actions,
      });
    }
  }

  return {
    period: yearMonth,
    review_needed_count: items.length,
    product_not_registered_count: productNotRegistered,
    revenue_not_mapped_count: revenueNotMapped,
    settlement_not_created_count: settlementNotCreated,
    items,
  };
}

module.exports = { getSummary, getTrend, getReview, latestSettlementRows, prevMonth };
