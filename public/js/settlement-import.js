(function () {
  const TYPES = [
    { key: 'providers', label: 'CP사/강사', cols: 'name, type, contact_email, contact_phone, course_ids_json, memo', needsPeriod: false },
    { key: 'course_prices', label: '코스 월별 판매가', cols: 'course_id, course_name, settlement_year_month, price, marketing_cost', needsPeriod: false },
    { key: 'revenues', label: '매출', cols: 'revenue_id, revenue_name, contract_amount, contract_start_date, contract_end_date', needsPeriod: false },
    { key: 'raw_enrollment', label: '수강 데이터 (원본)', cols: 'product_id, product_name, course_id, course_name, learner_id, watch_seconds, completion_rate', needsPeriod: true },
    { key: 'aggregated_enrollment', label: '수강 데이터 (집계)', cols: 'product_id, product_name, course_id, course_name, settlement_year_month, total_watch_seconds, active_student_count, type5_eligible_student_count, completion_distribution_json, learner_identity_keys_json', needsPeriod: false },
    { key: 'contracts', label: '코스 계약', cols: 'provider_id, course_id, course_name, product_type, settlement_type_code, rate, fixed_amount_per_student, completion_tiers_json', needsPeriod: false },
    { key: 'products', label: '상품', cols: 'product_id, product_name, product_type, start_date, end_date', needsPeriod: false },
    { key: 'revenue_product_mappings', label: '매출-상품 매핑', cols: 'revenue_id, product_id (구독 상품만 가능)', needsPeriod: false },
  ];

  const grid = document.getElementById('importGrid');

  grid.innerHTML = TYPES.map(t => `
    <div class="import-card" data-key="${t.key}">
      <h4>${t.label}</h4>
      <div class="cols">필요 컬럼: ${t.cols}</div>
      ${t.needsPeriod ? `<input type="month" class="period-input" placeholder="정산 대상월">` : ''}
      <input type="file" accept=".csv" class="file-input">
      <div class="import-actions">
        <button type="button" class="btn-small template-btn">템플릿 다운로드</button>
        <button type="button" class="btn-small primary upload-btn">업로드</button>
      </div>
      <div class="import-result"></div>
    </div>
  `).join('');

  grid.addEventListener('click', async (e) => {
    const card = e.target.closest('.import-card');
    if (!card) return;
    const key = card.dataset.key;
    const resultEl = card.querySelector('.import-result');

    if (e.target.classList.contains('template-btn')) {
      window.location.href = `/api/settlement/import/${key}/template`;
      return;
    }

    if (e.target.classList.contains('upload-btn')) {
      const fileInput = card.querySelector('.file-input');
      const periodInput = card.querySelector('.period-input');
      const file = fileInput.files[0];
      if (!file) { resultEl.textContent = 'CSV 파일을 선택해주세요.'; resultEl.className = 'import-result err'; return; }
      if (periodInput && !periodInput.value) { resultEl.textContent = '정산 대상월을 선택해주세요.'; resultEl.className = 'import-result err'; return; }

      const formData = new FormData();
      formData.append('file', file);
      if (periodInput) formData.append('settlement_year_month', periodInput.value);

      resultEl.textContent = '업로드 중...';
      resultEl.className = 'import-result';
      try {
        const res = await fetch(`/api/settlement/import/${key}`, { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '업로드 실패');
        resultEl.textContent = `${data.imported}건 가져오기 완료${data.errors?.length ? ` (오류 ${data.errors.length}건)` : ''}`;
        resultEl.className = 'import-result ok';
      } catch (err) {
        resultEl.textContent = '오류: ' + err.message;
        resultEl.className = 'import-result err';
      }
    }
  });
})();
