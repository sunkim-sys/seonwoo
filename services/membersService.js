const { chromium } = require('playwright');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const os = require('os');

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return phone;
  if (digits.length === 11) return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
  if (digits.length === 10 && digits.startsWith('02')) return `${digits.slice(0,2)}-${digits.slice(2,6)}-${digits.slice(6)}`;
  if (digits.length === 10) return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  return phone;
}

function parseCSV(buffer) {
  const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
  return text.split('\n').filter(l => l.trim()).map(line => {
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQ = !inQ; }
      else if (line[i] === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
      else cur += line[i];
    }
    cells.push(cur.trim());
    return cells;
  });
}

async function downloadCompanyMembers(page, company, tmpDir) {
  // 1. 회사 선택기 위치 찾기 (다양한 전략 시도)
  const selectorInfo = await page.evaluate(() => {
    const W = window.innerWidth;

    // 전략 1: '관리자' 텍스트 기준으로 좌측 형제 탐색 (조건 완화)
    for (const el of document.querySelectorAll('*')) {
      const text = el.textContent.trim();
      if (!text.includes('관리자')) continue;
      if (el.children.length > 5) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || rect.y > 100) continue;
      if (rect.x < W * 0.4) continue;
      let p = el.parentElement;
      for (let i = 0; i < 8; i++) {
        if (p && p.previousElementSibling) {
          const prev = p.previousElementSibling;
          const r = prev.getBoundingClientRect();
          if (r.width > 30 && r.height > 0 && r.y < 100 && r.x > W * 0.2) {
            return { x: r.x + r.width / 2, y: r.y + r.height / 2, strategy: 1 };
          }
        }
        p = p ? p.parentElement : null;
      }
    }

    // 전략 2: React-Select 컨테이너 직접 탐색
    for (const sel of ['[class*="select__control"]', '[class*="Select__control"]', '[class*="select-container"]']) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width > 50 && r.height > 0 && r.y < 100 && r.x > W * 0.2) {
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, strategy: 2 };
        }
      }
    }

    // 전략 3: 헤더/네비 영역에서 pointer cursor를 가진 요소 탐색
    for (const el of document.querySelectorAll('header *, nav *, [class*="header"] *, [class*="gnb"] *')) {
      const r = el.getBoundingClientRect();
      if (r.width < 60 || r.height < 20 || r.height > 60 || r.y > 80) continue;
      if (r.x < W * 0.2 || r.x > W * 0.9) continue;
      if (window.getComputedStyle(el).cursor === 'pointer') {
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, strategy: 3 };
      }
    }

    return null;
  });
  if (!selectorInfo) throw new Error('회사 선택기 없음');

  await page.mouse.click(selectorInfo.x, selectorInfo.y);

  // 드롭다운 검색 input이 나타날 때까지 대기 (최대 4초)
  try {
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('input')).some(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.y < 200;
      });
    }, { timeout: 4000 });
  } catch (_) {
    await page.waitForTimeout(1000);
  }

  // 2. 팝업 input 찾아 클릭 (y 조건 완화: 100 → 200)
  const popupInput = await page.evaluate(() => {
    const W = window.innerWidth;
    const inp = Array.from(document.querySelectorAll('input')).find(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.x > W * 0.3 && r.y < 200;
    });
    if (inp) {
      inp.focus();
      const r = inp.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }
    return null;
  });
  if (!popupInput) throw new Error('검색 input 없음');

  await page.mouse.click(popupInput.x, popupInput.y);
  await page.waitForTimeout(300);

  // 3. 검색어 입력
  const keyword = company.split('/')[0];
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type(keyword, { delay: 100 });
  await page.waitForTimeout(1500);

  // 4. 드롭다운에서 정확히 일치하는 항목 클릭
  const clicked = await page.evaluate((company) => {
    const W = window.innerWidth;
    let exact = null, partial = null;
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length > 0) continue;
      const text = el.textContent.trim();
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.x < W * 0.4 || r.y > 300) continue;
      if (text === company && !exact) exact = el;
      if (!partial && text.includes(company.split('/')[0])) partial = el;
    }
    const hit = exact || partial;
    if (!hit) return 'not_found';
    hit.click();
    return (exact ? 'exact' : 'partial') + ':' + hit.textContent.trim().slice(0, 20);
  }, company);

  if (clicked === 'not_found') await page.keyboard.press('Enter');

  await page.waitForTimeout(2500);

  // 5. 구성원 관리 href 가져와서 이동
  const href = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === '구성원 관리');
    return a ? a.href : null;
  });
  if (href) await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  else await page.locator('a').filter({ hasText: '구성원 관리' }).first().click({ timeout: 5000 });

  await page.waitForTimeout(2500);

  // 6. 엑셀 다운로드 버튼 탐색 (텍스트 여러 패턴 시도)
  let dlEl = null;
  const excelTexts = ['엑셀로 내려받기', '엑셀 내려받기', '엑셀 다운로드', '엑셀로 받기', 'Excel 다운로드'];
  for (const text of excelTexts) {
    const el = page.getByText(text, { exact: true }).first();
    if (await el.count() > 0 && await el.isVisible()) { dlEl = el; break; }
  }
  // 텍스트 부분 일치 폴백
  if (!dlEl) {
    const candidates = page.locator('a, button').filter({ hasText: /엑셀|Excel|xlsx/i });
    if (await candidates.count() > 0) dlEl = candidates.first();
  }
  if (!dlEl || await dlEl.count() === 0) throw new Error('엑셀 버튼 없음');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    dlEl.click(),
  ]);

  const safe = company.replace(/[/\\:*?"<>|]/g, '_');
  const ext = path.extname(download.suggestedFilename()) || '.csv';
  const filePath = path.join(tmpDir, `${safe}_구성원${ext}`);
  await download.saveAs(filePath);
  return filePath;
}

function buildMergedExcel(results, tmpDir) {
  const allRows = [];
  let headers = null;
  let phoneIdx = -1;

  for (const r of results) {
    if (!r.success || !r.filePath || !fs.existsSync(r.filePath)) continue;
    try {
      const rows = parseCSV(fs.readFileSync(r.filePath));
      if (rows.length === 0) continue;
      if (!headers) {
        headers = rows[0];
        phoneIdx = headers.findIndex(h => h.includes('연락처') || h.includes('전화'));
        allRows.push(['기업명', ...headers]);
      }
      for (const row of rows.slice(1)) {
        const newRow = [r.company, ...row];
        if (phoneIdx >= 0 && phoneIdx + 1 < newRow.length) {
          newRow[phoneIdx + 1] = formatPhone(newRow[phoneIdx + 1]);
        }
        allRows.push(newRow);
      }
    } catch (e) { console.error('merge err:', e.message); }
  }

  const ws = XLSX.utils.aoa_to_sheet(allRows);
  // 열 너비
  if (allRows[0]) {
    ws['!cols'] = allRows[0].map((_, i) => {
      const maxLen = allRows.reduce((m, r) => Math.max(m, String(r[i] || '').length), 0);
      return { wch: Math.min(maxLen + 2, 40) };
    });
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '구성원 전체');
  const outPath = path.join(tmpDir, '구성원_전체.xlsx');
  XLSX.writeFile(wb, outPath);
  return outPath;
}

async function runMembersDownload(companies, credentials, onProgress) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'members-'));

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    // 로그인은 기본 viewport(1280×720)로 — 큰 viewport에서 로그인 폼이 오작동함
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    // 로그인
    onProgress('로그인 중... (페이지 이동)');
    await page.goto('https://partner.skillflo.io', { waitUntil: 'domcontentloaded', timeout: 30000 });

    onProgress('로그인 중... (입력 대기)');
    const emailInput = page.locator('input[placeholder*="이메일"]').first();
    const pwInput = page.locator('input[type="password"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });

    onProgress('로그인 중... (입력)');
    await emailInput.click();
    await emailInput.pressSequentially(credentials.email, { delay: 60 });
    await page.waitForTimeout(300);
    await pwInput.click();
    await pwInput.pressSequentially(credentials.password, { delay: 60 });
    await page.waitForTimeout(300);

    // 입력값 실제 확인
    const emailVal = await emailInput.inputValue();
    const pwVal = await pwInput.inputValue();
    onProgress(`입력 확인: 이메일=${emailVal ? emailVal.slice(0, 4) + '...' : '비어있음'}, PW=${pwVal ? '입력됨' : '비어있음'}`);

    onProgress('로그인 중... (버튼 클릭)');
    const loginBtn = page.locator('button').filter({ hasText: '로그인하기' }).first();
    if (await loginBtn.count() > 0) {
      await loginBtn.click();
    } else {
      await pwInput.press('Enter');
    }

    onProgress('로그인 중... (이동 대기)');
    // 페이지 이동을 waitForURL로 감지 (최대 15초), 실패해도 계속
    try {
      await page.waitForURL(u => !u.includes('signin') && !u.includes('login'), { timeout: 15000 });
    } catch (_) {}
    await page.waitForTimeout(1500);

    const url = page.url();
    onProgress(`현재 URL: ${url}`);
    if (url.includes('login') || url.includes('signin')) {
      // 페이지에 표시된 에러 메시지 수집
      const pageMsg = await page.evaluate(() => {
        const errEls = document.querySelectorAll('[class*="error"], [class*="Error"], [class*="alert"], [role="alert"]');
        const msgs = Array.from(errEls).map(el => el.textContent.trim()).filter(t => t).join(' | ');
        return msgs || document.body.innerText.slice(0, 200);
      });
      throw new Error(`로그인 실패 (페이지: ${pageMsg.slice(0, 100)})`);
    }
    onProgress('로그인 완료!');

    // 로그인 후 viewport를 1920×1080으로 확장 (회사 선택기 탐색에 필요)
    await page.setViewportSize({ width: 1920, height: 1080 });

    // 구성원 관리 페이지
    onProgress('구성원 페이지 이동 중...');
    await page.goto('https://partner.skillflo.io/members', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const results = [];
    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      onProgress(`[${i + 1}/${companies.length}] ${company} 처리 중...`);

      // 매 회사마다 /members로 복귀 — 이전 회사 처리 후 페이지가 바뀌어도 선택기가 있는 상태에서 시작
      await page.goto('https://partner.skillflo.io/members', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      try {
        const filePath = await downloadCompanyMembers(page, company, tmpDir);
        results.push({ company, filePath, success: true });
        onProgress(`[${i + 1}/${companies.length}] ${company} ✓`);
      } catch (err) {
        results.push({ company, success: false, error: err.message });
        onProgress(`[${i + 1}/${companies.length}] ${company} ✗ ${err.message}`);
      }
    }

    // 통합 파일
    onProgress('통합 Excel 파일 생성 중...');
    const mergedPath = buildMergedExcel(results, tmpDir);
    onProgress('완료!');

    return { results, mergedPath, tmpDir };
  } finally {
    await browser.close();
  }
}

module.exports = { runMembersDownload };
