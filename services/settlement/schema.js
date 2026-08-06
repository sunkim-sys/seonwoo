const db = require('../db');

let ensured = false;

// 정산 타입 6종 (계약 관리 화면에서 관측된 코드)
const SETTLEMENT_TYPES = {
  RATE_BY_COURSE_PRICE: { label: 'TYPE1: 판매가 기준', verified: false },
  RATE_BY_REVENUE_HOUR_RATIO: { label: 'TYPE2: 매출-수강시간', verified: true },
  RATE_BY_PRICE_MINUS_MARKETING: { label: 'TYPE3: 마케팅비 차감', verified: false },
  RATE_BY_COMPLETION_TIER: { label: 'TYPE4: 수강률 구간', verified: false },
  FIXED_PER_STUDENT: { label: 'TYPE5: 수강생 고정금액', verified: false },
  TURNKEY: { label: 'TYPE6: 턴키 (정산 불필요)', verified: true },
};

async function ensureTables() {
  if (ensured) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS settle_providers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'individual', -- company | individual
      contact_email TEXT,
      contact_phone TEXT,
      course_ids JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS settle_contracts (
      id SERIAL PRIMARY KEY,
      provider_id INTEGER NOT NULL REFERENCES settle_providers(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL,
      course_name TEXT,
      product_type TEXT NOT NULL DEFAULT 'single', -- single | subscription
      settlement_type TEXT NOT NULL,
      rate NUMERIC,
      fixed_amount_per_student NUMERIC,
      completion_tiers JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS settle_products (
      product_id TEXT PRIMARY KEY,
      product_name TEXT NOT NULL,
      product_type TEXT NOT NULL DEFAULT 'single', -- single | subscription
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      settlement_excluded BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS settle_revenues (
      revenue_id TEXT PRIMARY KEY,
      revenue_name TEXT NOT NULL,
      contract_amount NUMERIC NOT NULL,
      contract_start_date DATE NOT NULL,
      contract_end_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS settle_revenue_product_map (
      revenue_id TEXT NOT NULL REFERENCES settle_revenues(revenue_id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES settle_products(product_id) ON DELETE CASCADE,
      PRIMARY KEY (revenue_id, product_id)
    );
  `);

  // TYPE1/TYPE3 용: 코스 월별 판매가 (+ 마케팅비. 원본 시스템에 출처 화면이 없어 이 테이블에 함께 관리 - 미검증)
  await db.query(`
    CREATE TABLE IF NOT EXISTS settle_course_monthly_prices (
      course_id TEXT NOT NULL,
      course_name TEXT,
      settlement_year_month TEXT NOT NULL, -- 'YYYY-MM'
      price NUMERIC NOT NULL DEFAULT 0,
      marketing_cost NUMERIC NOT NULL DEFAULT 0,
      PRIMARY KEY (course_id, settlement_year_month)
    );
  `);

  // 수강 데이터 집계 (원본 raw 또는 미리 집계된 CSV로부터 채워짐)
  await db.query(`
    CREATE TABLE IF NOT EXISTS settle_enrollment_aggregates (
      product_id TEXT NOT NULL,
      product_name TEXT,
      course_id TEXT NOT NULL,
      course_name TEXT,
      settlement_year_month TEXT NOT NULL,
      total_watch_seconds BIGINT NOT NULL DEFAULT 0,
      active_student_count INTEGER NOT NULL DEFAULT 0,
      type5_eligible_student_count INTEGER,
      completion_distribution JSONB NOT NULL DEFAULT '{}',
      learner_identity_keys JSONB,
      PRIMARY KEY (product_id, course_id, settlement_year_month)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS settle_settlements (
      id SERIAL PRIMARY KEY,
      provider_id INTEGER NOT NULL REFERENCES settle_providers(id) ON DELETE CASCADE,
      contract_id INTEGER NOT NULL REFERENCES settle_contracts(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL,
      settlement_year_month TEXT NOT NULL,
      settlement_type TEXT NOT NULL,
      amount NUMERIC NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT '계산됨', -- 계산됨 | 확정
      calculation_detail JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS settle_users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'accountant', -- accountant | admin
      login_id TEXT NOT NULL UNIQUE,
      email TEXT,
      password_hash TEXT,
      status TEXT NOT NULL DEFAULT 'active', -- active | inactive
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  ensured = true;
}

module.exports = { ensureTables, SETTLEMENT_TYPES };
