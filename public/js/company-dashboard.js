(function () {
  const API = '/api/company-list/stats/csm';

  const loadingEl = document.getElementById('loading');
  const errorBox = document.getElementById('errorBox');
  const content = document.getElementById('content');

  const statTotal = document.getElementById('statTotal');
  const statOngoing = document.getElementById('statOngoing');
  const statClosed = document.getElementById('statClosed');
  const statOther = document.getElementById('statOther');
  const statOtherTile = document.getElementById('statOtherTile');
  const csmChart = document.getElementById('csmChart');
  const statsTableBody = document.getElementById('statsTableBody');

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function renderChart(rows) {
    const maxTotal = Math.max(...rows.map(r => r.total), 1);

    csmChart.innerHTML = rows.map(r => {
      const barWidthPct = (r.total / maxTotal) * 100;
      const segs = [];
      const segOrder = [
        { key: 'ongoing', cls: 'seg-ongoing', label: 'Ongoing' },
        { key: 'closed', cls: 'seg-closed', label: 'Closed' },
        { key: 'other', cls: 'seg-other', label: '기타' },
      ].filter(s => r[s.key] > 0);

      segOrder.forEach((s, i) => {
        const isLast = i === segOrder.length - 1;
        segs.push(`<div class="csm-seg ${s.cls} ${isLast ? 'seg-rounded-end' : 'seg-square'}" style="flex:${r[s.key]}" title="${s.label} ${r[s.key]}"></div>`);
        if (!isLast) segs.push(`<div class="csm-seg-gap"></div>`);
      });
      if (r.total === 0) {
        segs.push(`<div class="csm-seg seg-closed seg-square seg-rounded-end" style="flex:1; opacity:0;"></div>`);
      }

      return `
        <div class="csm-row">
          <div class="csm-row-label" title="${escapeHtml(r.csm)}">${escapeHtml(r.csm)}</div>
          <div class="csm-bar-wrap">
            <div class="csm-bar" style="width:${barWidthPct}%">${segs.join('')}</div>
            <span class="csm-row-total">${r.total}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderTable(rows) {
    statsTableBody.innerHTML = rows.map(r => `
      <tr>
        <td>${escapeHtml(r.csm)}</td>
        <td>${r.ongoing}</td>
        <td>${r.closed}</td>
        <td>${r.other}</td>
        <td>${r.total}</td>
      </tr>
    `).join('');
  }

  async function load() {
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error((await res.json()).error || '조회 실패');
      const rows = await res.json();

      const totalAll = rows.reduce((s, r) => s + r.total, 0);
      const ongoingAll = rows.reduce((s, r) => s + r.ongoing, 0);
      const closedAll = rows.reduce((s, r) => s + r.closed, 0);
      const otherAll = rows.reduce((s, r) => s + r.other, 0);

      statTotal.textContent = totalAll.toLocaleString();
      statOngoing.textContent = ongoingAll.toLocaleString();
      statClosed.textContent = closedAll.toLocaleString();
      statOther.textContent = otherAll.toLocaleString();
      statOtherTile.style.display = otherAll > 0 ? '' : 'none';

      renderChart(rows);
      renderTable(rows);

      loadingEl.style.display = 'none';
      content.style.display = 'block';
    } catch (err) {
      loadingEl.style.display = 'none';
      errorBox.textContent = '데이터를 불러오지 못했습니다: ' + err.message;
      errorBox.style.display = 'block';
    }
  }

  load();
})();
