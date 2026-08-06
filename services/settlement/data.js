const db = require('../db');
const { ensureTables } = require('./schema');

async function upsertCourseMonthlyPrice(row) {
  await ensureTables();
  await db.query(
    `INSERT INTO settle_course_monthly_prices (course_id, course_name, settlement_year_month, price, marketing_cost)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (course_id, settlement_year_month)
     DO UPDATE SET course_name = EXCLUDED.course_name, price = EXCLUDED.price, marketing_cost = EXCLUDED.marketing_cost`,
    [row.course_id, row.course_name || null, row.settlement_year_month, Number(row.price || 0), Number(row.marketing_cost || 0)]
  );
}

async function upsertEnrollmentAggregate(row) {
  await ensureTables();
  await db.query(
    `INSERT INTO settle_enrollment_aggregates
       (product_id, product_name, course_id, course_name, settlement_year_month,
        total_watch_seconds, active_student_count, type5_eligible_student_count,
        completion_distribution, learner_identity_keys)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (product_id, course_id, settlement_year_month)
     DO UPDATE SET
       product_name = EXCLUDED.product_name, course_name = EXCLUDED.course_name,
       total_watch_seconds = EXCLUDED.total_watch_seconds,
       active_student_count = EXCLUDED.active_student_count,
       type5_eligible_student_count = EXCLUDED.type5_eligible_student_count,
       completion_distribution = EXCLUDED.completion_distribution,
       learner_identity_keys = EXCLUDED.learner_identity_keys`,
    [
      row.product_id, row.product_name || null, row.course_id, row.course_name || null, row.settlement_year_month,
      Math.round(Number(row.total_watch_seconds || 0)),
      Math.round(Number(row.active_student_count || 0)),
      row.type5_eligible_student_count !== undefined && row.type5_eligible_student_count !== ''
        ? Math.round(Number(row.type5_eligible_student_count)) : null,
      JSON.stringify(row.completion_distribution || {}),
      row.learner_identity_keys ? JSON.stringify(row.learner_identity_keys) : null,
    ]
  );
}

module.exports = { upsertCourseMonthlyPrice, upsertEnrollmentAggregate };
