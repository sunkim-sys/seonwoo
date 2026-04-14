const XLSX = require('xlsx-js-style');

const BORDER = { style: 'thin', color: { rgb: 'FFE2E8F0' } };
const THICK = { style: 'medium', color: { rgb: 'FF6366F1' } };

function borderAll(color = 'FFE2E8F0') {
  const b = { style: 'thin', color: { rgb: color } };
  return { top: b, bottom: b, left: b, right: b };
}

function styleHeader(cell) {
  cell.s = {
    font: { name: 'Pretendard', sz: 12, bold: true, color: { rgb: 'FFFFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FF4F46E5' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: borderAll('FF4338CA'),
  };
}

function styleTitle(cell) {
  cell.s = {
    font: { name: 'Pretendard', sz: 16, bold: true, color: { rgb: 'FF1E293B' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FFEEF2FF' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  };
}

function styleSub(cell) {
  cell.s = {
    font: { name: 'Pretendard', sz: 10, color: { rgb: 'FF64748B' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FFF8FAFC' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  };
}

function styleBody(cell, zebra) {
  cell.s = {
    font: { name: 'Pretendard', sz: 11, color: { rgb: 'FF0F172A' } },
    fill: zebra ? { patternType: 'solid', fgColor: { rgb: 'FFF8FAFC' } } : undefined,
    alignment: { vertical: 'center', wrapText: true },
    border: borderAll('FFE2E8F0'),
  };
}

function styleUrl(cell) {
  cell.s = {
    font: { name: 'Pretendard', sz: 10, color: { rgb: 'FF4F46E5' }, underline: true },
    alignment: { vertical: 'center' },
    border: borderAll('FFE2E8F0'),
  };
}

/**
 * Build styled xlsx buffer.
 * @param {Object} opts
 * @param {string} opts.sheetName
 * @param {string} opts.title
 * @param {string} [opts.subtitle]
 * @param {string[]} opts.headers
 * @param {Array<Array<string|number>>} opts.rows
 * @param {Array<{wch:number}>} [opts.widths]
 * @param {number[]} [opts.urlCols]  0-based column indices treated as URL
 */
function buildStyledWorkbook(opts) {
  const {
    sheetName = 'Sheet1',
    title,
    subtitle,
    headers,
    rows,
    widths,
    urlCols = [],
  } = opts;

  const aoa = [];
  const titleRow = 0;
  const subtitleRow = subtitle ? 1 : -1;
  const headerRow = subtitle ? 2 : 1;

  aoa.push([title, ...Array(headers.length - 1).fill('')]);
  if (subtitle) aoa.push([subtitle, ...Array(headers.length - 1).fill('')]);
  aoa.push(headers);
  rows.forEach(r => aoa.push(r));

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Merge title / subtitle across all columns
  ws['!merges'] = ws['!merges'] || [];
  ws['!merges'].push({ s: { r: titleRow, c: 0 }, e: { r: titleRow, c: headers.length - 1 } });
  if (subtitle) ws['!merges'].push({ s: { r: subtitleRow, c: 0 }, e: { r: subtitleRow, c: headers.length - 1 } });

  // Row heights
  ws['!rows'] = [];
  ws['!rows'][titleRow] = { hpt: 30 };
  if (subtitle) ws['!rows'][subtitleRow] = { hpt: 20 };
  ws['!rows'][headerRow] = { hpt: 28 };

  // Column widths
  ws['!cols'] = widths || headers.map(h => ({ wch: Math.max(String(h).length * 2.5, 14) }));

  // Freeze below header
  ws['!freeze'] = { xSplit: 0, ySplit: headerRow + 1 };
  ws['!panes'] = [{ state: 'frozen', topLeftCell: XLSX.utils.encode_cell({ r: headerRow + 1, c: 0 }) }];

  // Auto filter on header
  const lastCol = XLSX.utils.encode_col(headers.length - 1);
  const lastRow = headerRow + rows.length + 1;
  ws['!autofilter'] = { ref: `A${headerRow + 1}:${lastCol}${lastRow}` };

  // Apply cell styles
  for (let r = 0; r < aoa.length; r++) {
    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;

      if (r === titleRow) styleTitle(cell);
      else if (r === subtitleRow) styleSub(cell);
      else if (r === headerRow) styleHeader(cell);
      else {
        const zebra = (r - headerRow) % 2 === 0;
        if (urlCols.includes(c) && cell.v) {
          styleUrl(cell);
          cell.l = { Target: String(cell.v), Tooltip: String(cell.v) };
        } else {
          styleBody(cell, zebra);
        }
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { buildStyledWorkbook };
