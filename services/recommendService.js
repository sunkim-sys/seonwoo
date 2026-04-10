const XLSX = require('xlsx');

function parseSalesFromBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const stats = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const type = String(row[3] || '');   // 유형
    const status = String(row[4] || ''); // 상태
    const amount = Number(row[10]) || 0; // 결제 금액
    const productName = String(row[39] || '').trim(); // 상품명
    const category = String(row[46] || '').trim();    // 상품카테고리
    const price = Number(row[41]) || 0;  // 판매가

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
  }

  console.log(`[Sales] Parsed ${Object.keys(stats).length} products from upload`);
  return stats;
}

function recommendFromBuffer(buffer, candidateNames) {
  const stats = parseSalesFromBuffer(buffer);
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
  return scored;
}

module.exports = { recommendFromBuffer };
