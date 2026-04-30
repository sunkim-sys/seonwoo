const runBtn = document.getElementById('runBtn');
const companiesInput = document.getElementById('companiesInput');
const progressBox = document.getElementById('progressBox');
const logArea = document.getElementById('logArea');
const downloadBox = document.getElementById('downloadBox');
const dlList = document.getElementById('dlList');

function appendLog(msg) {
  const line = document.createElement('div');
  if (msg.includes('✓') || msg.includes('완료')) line.className = 'log-ok';
  else if (msg.includes('✗') || msg.includes('실패') || msg.includes('오류')) line.className = 'log-err';
  line.textContent = msg;
  logArea.appendChild(line);
  logArea.scrollTop = logArea.scrollHeight;
}

function makeDownloadLink(jobId, filename, label, isMerged) {
  const item = document.createElement('div');
  item.className = 'dl-item' + (isMerged ? ' dl-merged' : '');

  const span = document.createElement('span');
  span.textContent = label;

  const btn = document.createElement('a');
  btn.className = 'btn btn-primary';
  btn.style.fontSize = '12px';
  btn.style.padding = '6px 14px';
  btn.textContent = '다운로드';
  btn.href = `/api/members/download/${jobId}/${encodeURIComponent(filename)}`;
  btn.download = filename;

  item.appendChild(span);
  item.appendChild(btn);
  return item;
}

runBtn.addEventListener('click', async () => {
  const companies = companiesInput.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  if (companies.length === 0) {
    alert('기업명을 입력하세요.');
    return;
  }

  runBtn.disabled = true;
  runBtn.textContent = '실행 중...';
  logArea.innerHTML = '';
  dlList.innerHTML = '';
  progressBox.style.display = 'block';
  downloadBox.style.display = 'none';

  try {
    const response = await fetch('/api/members/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companies }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      appendLog('오류: ' + (err.error || response.statusText));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();

      for (const part of parts) {
        const eventMatch = part.match(/^event: (\w+)/m);
        const dataMatch = part.match(/^data: (.+)/m);
        if (!dataMatch) continue;

        const eventType = eventMatch ? eventMatch[1] : 'message';
        let payload;
        try { payload = JSON.parse(dataMatch[1]); } catch { continue; }

        if (eventType === 'progress') {
          appendLog(payload.msg);
        } else if (eventType === 'done') {
          appendLog(`완료 — 성공 ${payload.successCount}건 / 실패 ${payload.failCount}건`);
          downloadBox.style.display = 'block';

          // Individual files
          for (const f of (payload.files || [])) {
            dlList.appendChild(makeDownloadLink(payload.jobId, f.filename, f.company, false));
          }

          // Merged file
          if (payload.merged) {
            dlList.appendChild(makeDownloadLink(payload.jobId, payload.merged, '통합 파일 (전체)', true));
          }
        } else if (eventType === 'error') {
          appendLog('오류: ' + payload.msg);
        }
      }
    }
  } catch (err) {
    appendLog('연결 오류: ' + err.message);
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = '다운로드 시작';
  }
});
