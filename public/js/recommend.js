const status = document.getElementById('status');
const salesFile = document.getElementById('salesFile');
const salesFileName = document.getElementById('salesFileName');

salesFile.addEventListener('change', (e) => {
  if (e.target.files.length) {
    salesFileName.textContent = e.target.files[0].name;
  }
});

let lastResults = [];

function renderSalesSummary(s) {
  const box = document.getElementById('salesSummary');
  if (!s) { box.style.display = 'none'; return; }
  const period = s.firstDate && s.lastDate
    ? `${s.firstDate} ~ ${s.lastDate}`
    : '기간 정보 없음';
  box.innerHTML = `
    <div class="sales-title">판매 데이터 요약</div>
    <div class="sales-grid">
      <div><div class="sales-k">상품 수</div><div class="sales-v">${s.productCount.toLocaleString()}개</div></div>
      <div><div class="sales-k">결제 건수</div><div class="sales-v">${s.txnCount.toLocaleString()}건</div></div>
      <div><div class="sales-k">총 매출</div><div class="sales-v">${s.totalRevenue.toLocaleString()}원</div></div>
      <div><div class="sales-k">기간</div><div class="sales-v sales-period">${period}</div></div>
    </div>`;
  box.style.display = 'block';
}

function toCsv(results) {
  const headers = ['순위', '강의명', '카테고리', '판매가', '판매건수', '매출', '점수', '추천근거', '키워드', 'URL'];
  const rows = results.map(r => [
    r.rank,
    r.name,
    r.category || '',
    r.price || 0,
    r.count,
    r.revenue || 0,
    r.score,
    r.reason || '',
    (r.keywords || []).join(' '),
    r.url || '',
  ]);
  const esc = v => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
}

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (!lastResults.length) return;
  const blob = new Blob([toCsv(lastResults)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `강의추천_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

function showStatus(msg, type) {
  if (type === 'loading') {
    status.innerHTML = `<span class="spinner"></span><span>${msg}</span>`;
  } else {
    status.textContent = msg;
  }
  status.className = 'status ' + type;
}

document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const names = document.getElementById('lectureNames').value.trim();
  const topN = document.getElementById('topN').value;
  const file = salesFile.files[0];

  if (!file) {
    showStatus('판매 데이터 파일을 첨부해주세요.', 'error');
    return;
  }
  if (!names) {
    showStatus('강의명을 입력해주세요.', 'error');
    return;
  }

  const btn = document.getElementById('analyzeBtn');
  btn.disabled = true;
  btn.textContent = '분석 중...';
  showStatus('판매 데이터를 분석하고 있습니다...', 'loading');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('names', names);
  formData.append('topN', topN);

  try {
    const res = await fetch('/api/recommend/analyze', {
      method: 'POST',
      body: formData,
    });

    const raw = await res.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (e) {
      const preview = raw ? raw.slice(0, 200) : '(빈 응답)';
      throw new Error(`서버 응답이 JSON이 아닙니다 (HTTP ${res.status}). 본문 일부: ${preview}`);
    }

    if (!res.ok) throw new Error((data && data.error) || `서버 오류 (HTTP ${res.status})`);
    if (!data) throw new Error('서버가 빈 응답을 반환했습니다.');

    lastResults = data.results || [];
    renderSalesSummary(data.salesSummary);
    renderResults(data);
    showStatus(`${data.total}개 강의 중 ${data.recommended}개를 추천합니다.`, 'success');
  } catch (err) {
    showStatus('오류: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '추천 분석';
  }
});

function renderResults(data) {
  const container = document.getElementById('resultList');
  document.getElementById('resultSummary').textContent = `(${data.total}개 중 ${data.recommended}개 선정)`;

  container.innerHTML = data.results.map(r => {
    const rankClass = r.rank <= 3 ? `rank-${r.rank}` : 'rank-default';
    const introHtml = r.intro ? `<div class="result-intro">${r.intro}</div>` : '';
    const urlHtml = r.url ? `<div class="result-url"><a href="${r.url}" target="_blank">${r.url}</a></div>` : '';

    return `
      <div class="result-card">
        <div class="result-card-header">
          <div style="display:flex;align-items:center;flex:1;">
            <div class="result-rank ${rankClass}">${r.rank}</div>
            <div class="result-name">${r.name}</div>
          </div>
          <div class="result-score">${r.score}점</div>
        </div>
        <div class="result-meta">
          <div class="result-meta-item">카테고리: <strong>${r.category || '-'}</strong></div>
          <div class="result-meta-item">판매가: <strong>${r.price ? r.price.toLocaleString() + '원' : '-'}</strong></div>
          <div class="result-meta-item">판매건수: <strong>${r.count}건</strong></div>
          <div class="result-meta-item">매출: <strong>${r.revenue ? r.revenue.toLocaleString() + '원' : '-'}</strong></div>
        </div>
        ${r.keywords && r.keywords.length ? `<div class="result-keywords">${r.keywords.map(k => `<span class="keyword-tag">${k}</span>`).join('')}</div>` : ''}
        <div class="result-reason">${r.reason}</div>
        ${introHtml}
        ${urlHtml}
      </div>
    `;
  }).join('');

  document.getElementById('results').style.display = 'block';
}
