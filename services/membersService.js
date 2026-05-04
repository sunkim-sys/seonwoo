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
  await page.waitForTimeout(800);

  // 2. 팝업 input (우측 상단) 찾아 클릭
  const popupInput = await page.evaluate(() => {
    const W = window.innerWidth;
    const inp = Array.from(document.querySelectorAll('input')).find(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.x > W * 0.4 && r.y < 100;
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

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // 5. 구성원 관리 href 가져와서 이동
  const href = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === '구성원 관리');
    return a ? a.href : null;
  });
  if (href) await page.goto(href);
  else await page.locator('a').filter({ hasText: '구성원 관리' }).first().click({ timeout: 5000 });

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  // 6. 엑셀 다운로드
  let dlEl = null;
  for (const text of ['엑셀로 내려받기', '엑셀 내려받기', '엑셀 다운로드']) {
    const el = page.getByText(text, { exact: true }).first();
    if (await el.count() > 0 && await el.isVisible()) { dlEl = el; break; }
  }
  if (!dlEl) dlEl = page.locator('a, button').filter({ hasText: '엑셀' }).first();
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
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // webdriver 감지 우회
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // 로그인
    onProgress('로그인 중...');
    await page.goto('https://partner.skillflo.io/auth/signin');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // 페이지 내 input 현황 디버깅
    const inputInfo = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(el => ({
        type: el.type, name: el.name, id: el.id,
        placeholder: el.placeholder, visible: el.offsetWidth > 0,
      }))
    );
    onProgress(`입력 필드: ${JSON.stringify(inputInfo)}`);

    // React 네이티브 이벤트로 이메일/비밀번호 설정
    const fillResult = await page.evaluate(([email, pw]) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const inputs = Array.from(document.querySelectorAll('input'));

      const emailEl = inputs.find(el =>
        el.type === 'email' || el.type === 'text' ||
        (el.placeholder || '').includes('이메일') ||
        (el.placeholder || '').includes('아이디') ||
        (el.name || '').toLowerCase().includes('email') ||
        (el.id || '').toLowerCase().includes('email')
      );
      const pwEl = inputs.find(el => el.type === 'password');

      const setVal = (el, val) => {
        if (!el) return false;
        el.focus();
        nativeSetter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
        return true;
      };

      return {
        email: setVal(emailEl, email) ? 'ok' : 'not_found',
        pw: setVal(pwEl, pw) ? 'ok' : 'not_found',
      };
    }, [credentials.email, credentials.password]);
    onProgress(`입력 결과: 이메일=${fillResult.email}, 비밀번호=${fillResult.pw}`);
    await page.waitForTimeout(500);

    // 로그인 버튼 클릭
    const btnInfo = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.textContent.trim().slice(0, 20), type: b.type, visible: b.offsetWidth > 0,
      }))
    );
    onProgress(`버튼: ${JSON.stringify(btnInfo)}`);

    const loginBtn = page.locator('button[type="submit"], button').filter({ hasText: /로그인|signin|login/i }).first();
    if (await loginBtn.count() > 0) {
      await loginBtn.click();
    } else {
      await page.locator('input[type="password"]').first().press('Enter');
    }

    // URL 변경 대기 (최대 15초)
    try {
      await page.waitForURL(url => !url.includes('signin') && !url.includes('login'), { timeout: 15000 });
    } catch (_) {}
    await page.waitForTimeout(2000);

    const url = page.url();
    onProgress(`현재 URL: ${url}`);
    if (url.includes('login') || url.includes('signin')) {
      throw new Error('로그인 실패 — 이메일/비밀번호를 확인하세요.');
    }
    onProgress('로그인 완료!');

    // 구성원 관리 페이지
    await page.goto('https://partner.skillflo.io/members');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const results = [];
    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      onProgress(`[${i + 1}/${companies.length}] ${company} 처리 중...`);
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
