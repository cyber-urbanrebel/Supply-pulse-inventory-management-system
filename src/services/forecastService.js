function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

function averageDailyDemand(productId, sales, lookbackDays = 14) {
  const now = Date.now();
  const cutoff = now - lookbackDays * 24 * 60 * 60 * 1000;
  const relevant = sales.filter((s) => s.productId === productId && s.createdAt >= cutoff);

  const byDay = new Map();
  for (const sale of relevant) {
    const key = dayKey(sale.createdAt);
    byDay.set(key, (byDay.get(key) || 0) + sale.quantity);
  }

  const total = Array.from(byDay.values()).reduce((sum, qty) => sum + qty, 0);
  return total / lookbackDays;
}

function forecastForProducts(products, sales) {
  return products.map((p) => {
    const avgDemand = averageDailyDemand(p.id, sales);
    const leadTime = p.leadTimeDays || 7;
    const safety = p.safetyStock || 0;

    const reorderPoint = Math.ceil(avgDemand * leadTime + safety);
    const currentStock = p.stockOnHand || 0;
    const daysUntilStockout = avgDemand > 0 ? Number((currentStock / avgDemand).toFixed(1)) : null;

    const suggestedOrderQty = Math.max(0, reorderPoint + Math.ceil(avgDemand * 14) - currentStock);

    return {
      productId: p.id,
      sku: p.sku,
      name: p.name,
      averageDailyDemand: Number(avgDemand.toFixed(2)),
      currentStock,
      leadTimeDays: leadTime,
      safetyStock: safety,
      reorderPoint,
      daysUntilStockout,
      suggestedOrderQty,
      needsRestock: currentStock <= reorderPoint,
    };
  });
}

module.exports = {
  forecastForProducts,
};
