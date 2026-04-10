const status = document.getElementById('status');

function showStatus(msg, type) {
  status.textContent = msg;
  status.className = 'status ' + type;
}

document.getElementById('searchBtn').addEventListener('click', async () => {
  const names = document.getElementById('lectureNames').value.trim();
  if (!names) {
    showStatus('강의명을 입력해주세요.', 'error');
    return;
  }

  const btn = document.getElementById('searchBtn');
  btn.disabled = true;
  btn.textContent = 'AI 요약 중...';
  showStatus('구글 스프레드시트에서 데이터를 가져오고 AI가 요약하고 있습니다. 잠시 기다려주세요...', 'loading');

  try {
    const res = await fetch('/api/lecture-info/by-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '강의 정보 정리.xlsx';
    a.click();
    URL.revokeObjectURL(url);

    showStatus('다운로드 완료!', 'success');
  } catch (err) {
    showStatus('오류: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'AI 요약 및 엑셀 다운로드';
  }
});
