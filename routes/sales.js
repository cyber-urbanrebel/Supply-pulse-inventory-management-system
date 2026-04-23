const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const store = require('../lib/store');

router.get('/:businessId', (req, res) => {
  const business = store.getBusiness(req.params.businessId);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  res.json(business.sales);
});

router.post('/:businessId', (req, res) => {
  const business = store.getBusiness(req.params.businessId);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  const { productId } = req.body;
  const quantity = Number(req.body.quantity);
  if (!productId || isNaN(quantity) || quantity < 1 || !Number.isInteger(quantity)) {
    return res.status(400).json({ error: 'productId and a positive integer quantity are required' });
  }
  const product = business.products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.quantity < quantity) {
    return res.status(400).json({ error: 'Insufficient stock' });
  }
  product.quantity -= quantity;
  const revenue = quantity * product.price;
  const sale = {
    id: uuidv4(),
    productId,
    quantity: Number(quantity),
    revenue,
    date: new Date().toISOString()
  };
  business.sales.push(sale);
  store.saveBusiness(business);
  res.status(201).json(sale);
});

router.get('/:businessId/analytics', (req, res) => {
  const business = store.getBusiness(req.params.businessId);
  if (!business) return res.status(404).json({ error: 'Business not found' });

  const totalRevenue = business.sales.reduce((sum, s) => sum + s.revenue, 0);
  const totalSales = business.sales.length;

  // Top products by revenue
  const revenueByProduct = {};
  const unitsByProduct = {};
  business.sales.forEach(s => {
    revenueByProduct[s.productId] = (revenueByProduct[s.productId] || 0) + s.revenue;
    unitsByProduct[s.productId] = (unitsByProduct[s.productId] || 0) + s.quantity;
  });
  const productMap = Object.fromEntries(business.products.map(p => [p.id, p.name]));
  const topProducts = Object.entries(revenueByProduct)
    .map(([productId, revenue]) => ({
      productId,
      name: productMap[productId] || productId,
      revenue,
      unitsSold: unitsByProduct[productId] || 0
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Sales by day (last 30 days)
  const now = new Date();
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const revenueByDay = {};
  days.forEach(d => { revenueByDay[d] = 0; });
  business.sales.forEach(s => {
    const day = s.date.slice(0, 10);
    if (revenueByDay[day] !== undefined) {
      revenueByDay[day] += s.revenue;
    }
  });
  const salesByDay = days.map(date => ({ date, revenue: revenueByDay[date] }));

  res.json({ totalRevenue, totalSales, topProducts, salesByDay });
});

router.get('/:businessId/forecast/:productId', (req, res) => {
  const business = store.getBusiness(req.params.businessId);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  const product = business.products.find(p => p.id === req.params.productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const now = new Date();
  const dailySales = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dailySales[d.toISOString().slice(0, 10)] = 0;
  }
  business.sales
    .filter(s => s.productId === req.params.productId)
    .forEach(s => {
      const day = s.date.slice(0, 10);
      if (dailySales[day] !== undefined) {
        dailySales[day] += s.quantity;
      }
    });

  const days = Object.keys(dailySales).sort();
  // Weighted moving average: oldest window weight=1, middle=2, recent=3
  const WEIGHT_OLDEST = 1;
  const WEIGHT_MIDDLE = 2;
  const WEIGHT_RECENT = 3;
  const WEIGHT_SUM = WEIGHT_OLDEST + WEIGHT_MIDDLE + WEIGHT_RECENT;
  const w1 = days.slice(0, 10).reduce((sum, d) => sum + dailySales[d], 0) / 10;
  const w2 = days.slice(10, 20).reduce((sum, d) => sum + dailySales[d], 0) / 10;
  const w3 = days.slice(20, 30).reduce((sum, d) => sum + dailySales[d], 0) / 10;
  const weightedAvgDaily = (w1 * WEIGHT_OLDEST + w2 * WEIGHT_MIDDLE + w3 * WEIGHT_RECENT) / WEIGHT_SUM;
  const forecastedDemand = weightedAvgDaily * 7;
  const recommendedRestock = Math.max(0, Math.ceil(forecastedDemand - product.quantity));

  res.json({ productId: product.id, name: product.name, forecastedDemand, recommendedRestock });
});

module.exports = router;
