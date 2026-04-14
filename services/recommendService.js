const XLSX = require('xlsx');

function parseSalesFromBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const stats = {};
  let totalTxns = 0;
  let totalRevenue = 0;
  const dates = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const type = String(row[3] || '');
    const status = String(row[4] || '');
    const amount = Number(row[10]) || 0;
    const productName = String(row[39] || '').trim();
    const category = String(row[46] || '').trim();
    const price = Number(row[41]) || 0;
    const dateRaw = row[1]; // 결제일시 (likely column B)

    if (type !== '결제' || status !== '완료') continue;
    if (!productName) continue;

    if (!stats[productName]) {
      stats[productName] = {
        name: productName,
        category: category,
        price: price,
        count: 0,
        totalRevenue: 0,
      };
    }
    stats[productName].count++;
    stats[productName].totalRevenue += amount;
    totalTxns++;
    totalRevenue += amount;

    if (dateRaw) {
      const parsed = typeof dateRaw === 'number'
        ? XLSX.SSF.format('yyyy-mm-dd', dateRaw)
        : String(dateRaw).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}/.test(parsed)) dates.push(parsed);
    }
  }

  dates.sort();
  const summary = {
    productCount: Object.keys(stats).length,
    txnCount: totalTxns,
    totalRevenue,
    firstDate: dates[0] || null,
    lastDate: dates[dates.length - 1] || null,
  };

  console.log(`[Sales] Parsed ${summary.productCount} products, ${totalTxns} txns`);
  return { stats, summary };
}

function recommendFromBuffer(buffer, candidateNames) {
  const { stats, summary } = parseSalesFromBuffer(buffer);
  const allProducts = Object.values(stats);

  const candidates = [];
  for (const inputName of candidateNames) {
    const trimmed = inputName.trim();
    if (!trimmed) continue;

    const exact = stats[trimmed];
    if (exact) {
      candidates.push(exact);
      continue;
    }

    const found = allProducts.find(p =>
      p.name.includes(trimmed) || trimmed.includes(p.name)
    );
    if (found) {
      candidates.push(found);
    } else {
      candidates.push({
        name: trimmed,
        category: '',
        price: 0,
        count: 0,
        totalRevenue: 0,
        notFound: true,
      });
    }
  }

  const maxCount = Math.max(...candidates.map(c => c.count), 1);
  const maxRevenue = Math.max(...candidates.map(c => c.totalRevenue), 1);

  const scored = candidates.map(c => {
    const countScore = c.count / maxCount;
    const revenueScore = c.totalRevenue / maxRevenue;
    const score = (countScore * 0.6) + (revenueScore * 0.4);
    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return { ranked: scored, summary };
}

module.exports = { recommendFromBuffer };
