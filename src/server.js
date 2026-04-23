'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const app = express();
const PORT = 4100;
const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(limiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Multer Setup ──────────────────────────────────────────────────────────────
const upload = multer({
  dest: path.join(DATA_DIR, 'uploads'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// ─── Data Helpers ──────────────────────────────────────────────────────────────

// Validates that an ID from URL params only contains safe characters,
// preventing path traversal when IDs are used in filenames.
const SAFE_ID_RE = /^[a-z0-9_-]+$/i;
function assertSafeId(id) {
  if (!id || !SAFE_ID_RE.test(id)) {
    const err = new Error('Invalid ID format.');
    err.status = 400;
    throw err;
  }
}

function dataFile(filename) {
  // Filename is always constructed internally from validated IDs or fixed strings,
  // but we resolve it and ensure it stays within DATA_DIR.
  const resolved = path.resolve(DATA_DIR, filename);
  if (!resolved.startsWith(path.resolve(DATA_DIR) + path.sep) && resolved !== path.resolve(DATA_DIR)) {
    const err = new Error('Invalid file path.');
    err.status = 400;
    throw err;
  }
  return resolved;
}

function readData(filename) {
  const file = dataFile(filename);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function writeData(filename, data) {
  fs.writeFileSync(dataFile(filename), JSON.stringify(data, null, 2));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function generateSku(name) {
  return name.slice(0, 3).toUpperCase().replace(/\s/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
}

// ─── Businesses ────────────────────────────────────────────────────────────────
app.get('/api/businesses', (req, res) => {
  const businesses = readData('businesses.json');
  res.json(businesses);
});

app.post('/api/businesses', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Business name is required.' });
  }
  if (name.trim().length > 100) {
    return res.status(400).json({ error: 'Business name must be 100 characters or fewer.' });
  }
  const businesses = readData('businesses.json');
  const business = { id: generateId(), name: name.trim(), createdAt: new Date().toISOString() };
  businesses.push(business);
  writeData('businesses.json', businesses);
  res.status(201).json(business);
});

app.put('/api/businesses/:id', (req, res) => {
  assertSafeId(req.params.id);
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Business name is required.' });
  }
  if (name.trim().length > 100) {
    return res.status(400).json({ error: 'Business name must be 100 characters or fewer.' });
  }
  const businesses = readData('businesses.json');
  const idx = businesses.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Business not found.' });
  businesses[idx].name = name.trim();
  writeData('businesses.json', businesses);
  res.json(businesses[idx]);
});

app.delete('/api/businesses/:id', (req, res) => {
  assertSafeId(req.params.id);
  const businesses = readData('businesses.json');
  const idx = businesses.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Business not found.' });
  businesses.splice(idx, 1);
  writeData('businesses.json', businesses);
  // Clean up related data
  const id = req.params.id;
  ['products', 'sales', 'stock_log'].forEach(prefix => {
    const file = dataFile(`${prefix}_${id}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
  res.json({ success: true });
});

// ─── Products ──────────────────────────────────────────────────────────────────
app.get('/api/businesses/:bizId/products', (req, res) => {
  assertSafeId(req.params.bizId);
  const businesses = readData('businesses.json');
  if (!businesses.find(b => b.id === req.params.bizId)) {
    return res.status(404).json({ error: 'Business not found.' });
  }
  let products = readData(`products_${req.params.bizId}.json`);
  const { category, search } = req.query;
  if (category) {
    products = products.filter(p => p.category && p.category.toLowerCase() === category.toLowerCase());
  }
  if (search) {
    const q = search.toLowerCase();
    products = products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }
  res.json(products);
});

app.post('/api/businesses/:bizId/products', (req, res) => {
  assertSafeId(req.params.bizId);
  const businesses = readData('businesses.json');
  if (!businesses.find(b => b.id === req.params.bizId)) {
    return res.status(404).json({ error: 'Business not found.' });
  }
  const { name, sku, category, quantity, price, costPrice, lowStockThreshold, expiryDate, description } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Product name is required.' });
  }
  if (quantity === undefined || quantity === null || isNaN(Number(quantity)) || Number(quantity) < 0) {
    return res.status(400).json({ error: 'Quantity must be a number >= 0.' });
  }
  if (!price || isNaN(Number(price)) || Number(price) <= 0) {
    return res.status(400).json({ error: 'Price must be a number > 0.' });
  }
  const products = readData(`products_${req.params.bizId}.json`);
  const product = {
    id: generateId(),
    name: name.trim(),
    sku: sku && sku.trim() ? sku.trim() : generateSku(name.trim()),
    category: category && category.trim() ? category.trim() : 'General',
    quantity: Number(quantity),
    price: Number(price),
    costPrice: costPrice !== undefined ? Number(costPrice) : 0,
    lowStockThreshold: lowStockThreshold !== undefined ? Number(lowStockThreshold) : 10,
    expiryDate: expiryDate || null,
    description: description || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  products.push(product);
  writeData(`products_${req.params.bizId}.json`, products);
  res.status(201).json(product);
});

app.put('/api/businesses/:bizId/products/:productId', (req, res) => {
  assertSafeId(req.params.bizId);
  assertSafeId(req.params.productId);
  const products = readData(`products_${req.params.bizId}.json`);
  const idx = products.findIndex(p => p.id === req.params.productId);
  if (idx === -1) return res.status(404).json({ error: 'Product not found.' });
  const { name, sku, category, quantity, price, costPrice, lowStockThreshold, expiryDate, description } = req.body;
  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    return res.status(400).json({ error: 'Product name cannot be empty.' });
  }
  if (quantity !== undefined && (isNaN(Number(quantity)) || Number(quantity) < 0)) {
    return res.status(400).json({ error: 'Quantity must be a number >= 0.' });
  }
  if (price !== undefined && (isNaN(Number(price)) || Number(price) <= 0)) {
    return res.status(400).json({ error: 'Price must be a number > 0.' });
  }
  const updated = { ...products[idx] };
  if (name !== undefined) updated.name = name.trim();
  if (sku !== undefined) updated.sku = sku.trim() || generateSku(updated.name);
  if (category !== undefined) updated.category = category.trim() || 'General';
  if (quantity !== undefined) updated.quantity = Number(quantity);
  if (price !== undefined) updated.price = Number(price);
  if (costPrice !== undefined) updated.costPrice = Number(costPrice);
  if (lowStockThreshold !== undefined) updated.lowStockThreshold = Number(lowStockThreshold);
  if (expiryDate !== undefined) updated.expiryDate = expiryDate || null;
  if (description !== undefined) updated.description = description;
  updated.updatedAt = new Date().toISOString();
  products[idx] = updated;
  writeData(`products_${req.params.bizId}.json`, products);
  res.json(updated);
});

app.delete('/api/businesses/:bizId/products/:productId', (req, res) => {
  assertSafeId(req.params.bizId);
  assertSafeId(req.params.productId);
  const products = readData(`products_${req.params.bizId}.json`);
  const idx = products.findIndex(p => p.id === req.params.productId);
  if (idx === -1) return res.status(404).json({ error: 'Product not found.' });
  products.splice(idx, 1);
  writeData(`products_${req.params.bizId}.json`, products);
  res.json({ success: true });
});

app.post('/api/businesses/:bizId/products/:productId/adjust-stock', (req, res) => {
  assertSafeId(req.params.bizId);
  assertSafeId(req.params.productId);
  const products = readData(`products_${req.params.bizId}.json`);
  const idx = products.findIndex(p => p.id === req.params.productId);
  if (idx === -1) return res.status(404).json({ error: 'Product not found.' });
  const { adjustment, reason } = req.body;
  if (adjustment === undefined || isNaN(Number(adjustment))) {
    return res.status(400).json({ error: 'Adjustment must be a number.' });
  }
  const adj = Number(adjustment);
  const newQty = products[idx].quantity + adj;
  if (newQty < 0) return res.status(400).json({ error: 'Stock cannot go below 0.' });
  products[idx].quantity = newQty;
  products[idx].updatedAt = new Date().toISOString();
  writeData(`products_${req.params.bizId}.json`, products);
  const log = readData(`stock_log_${req.params.bizId}.json`);
  log.push({
    id: generateId(),
    productId: req.params.productId,
    productName: products[idx].name,
    adjustment: adj,
    newQuantity: newQty,
    reason: reason || '',
    timestamp: new Date().toISOString()
  });
  writeData(`stock_log_${req.params.bizId}.json`, log);
  res.json(products[idx]);
});

app.get('/api/businesses/:bizId/stock-log', (req, res) => {
  assertSafeId(req.params.bizId);
  const log = readData(`stock_log_${req.params.bizId}.json`);
  res.json(log.slice().reverse());
});

// CSV Import
app.post('/api/businesses/:bizId/products/import-csv', upload.single('file'), (req, res) => {
  assertSafeId(req.params.bizId);
  if (!req.file) return res.status(400).json({ error: 'CSV file is required.' });
  const businesses = readData('businesses.json');
  if (!businesses.find(b => b.id === req.params.bizId)) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Business not found.' });
  }
  try {
    const content = fs.readFileSync(req.file.path, 'utf8');
    fs.unlinkSync(req.file.path);
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'CSV must have header and at least one row.' });
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const products = readData(`products_${req.params.bizId}.json`);
    const imported = [];
    const errors = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
      if (!row.name) { errors.push(`Row ${i + 1}: name is required`); continue; }
      if (!row.quantity || isNaN(Number(row.quantity)) || Number(row.quantity) < 0) { errors.push(`Row ${i + 1}: invalid quantity`); continue; }
      if (!row.price || isNaN(Number(row.price)) || Number(row.price) <= 0) { errors.push(`Row ${i + 1}: invalid price`); continue; }
      const product = {
        id: generateId(),
        name: row.name,
        sku: row.sku || generateSku(row.name),
        category: row.category || 'General',
        quantity: Number(row.quantity),
        price: Number(row.price),
        costPrice: row.costprice ? Number(row.costprice) : 0,
        lowStockThreshold: row.lowstockthreshold ? Number(row.lowstockthreshold) : 10,
        expiryDate: row.expirydate || null,
        description: row.description || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      products.push(product);
      imported.push(product);
    }
    writeData(`products_${req.params.bizId}.json`, products);
    res.json({ imported: imported.length, errors });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    throw err;
  }
});

// ─── Sales ─────────────────────────────────────────────────────────────────────
app.get('/api/businesses/:bizId/sales', (req, res) => {
  assertSafeId(req.params.bizId);
  let sales = readData(`sales_${req.params.bizId}.json`);
  const { from, to, period } = req.query;
  if (from) {
    const fromDate = new Date(from);
    sales = sales.filter(s => new Date(s.soldAt) >= fromDate);
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    sales = sales.filter(s => new Date(s.soldAt) <= toDate);
  }
  if (period === 'daily') {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 1);
    sales = sales.filter(s => new Date(s.soldAt) >= cutoff);
  } else if (period === 'weekly') {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
    sales = sales.filter(s => new Date(s.soldAt) >= cutoff);
  } else if (period === 'monthly') {
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 1);
    sales = sales.filter(s => new Date(s.soldAt) >= cutoff);
  }
  res.json(sales.slice().reverse());
});

app.post('/api/businesses/:bizId/sales', (req, res) => {
  assertSafeId(req.params.bizId);
  const businesses = readData('businesses.json');
  if (!businesses.find(b => b.id === req.params.bizId)) {
    return res.status(404).json({ error: 'Business not found.' });
  }
  const { productId, quantity, note } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId is required.' });
  if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) {
    return res.status(400).json({ error: 'Quantity must be > 0.' });
  }
  const products = readData(`products_${req.params.bizId}.json`);
  const productIdx = products.findIndex(p => p.id === productId);
  if (productIdx === -1) return res.status(404).json({ error: 'Product not found.' });
  const product = products[productIdx];
  const qty = Number(quantity);
  if (product.quantity < qty) return res.status(400).json({ error: `Insufficient stock. Available: ${product.quantity}` });
  products[productIdx].quantity -= qty;
  products[productIdx].updatedAt = new Date().toISOString();
  writeData(`products_${req.params.bizId}.json`, products);
  const revenue = product.price * qty;
  const profit = (product.price - product.costPrice) * qty;
  const sales = readData(`sales_${req.params.bizId}.json`);
  const sale = {
    id: generateId(),
    productId,
    productName: product.name,
    productSku: product.sku,
    category: product.category,
    quantity: qty,
    pricePerUnit: product.price,
    costPerUnit: product.costPrice,
    revenue,
    profit,
    note: note || '',
    soldAt: new Date().toISOString()
  };
  sales.push(sale);
  writeData(`sales_${req.params.bizId}.json`, sales);
  res.status(201).json(sale);
});

app.get('/api/businesses/:bizId/sales/export-csv', (req, res) => {
  assertSafeId(req.params.bizId);
  const sales = readData(`sales_${req.params.bizId}.json`);
  const header = 'id,productId,productName,productSku,category,quantity,pricePerUnit,costPerUnit,revenue,profit,note,soldAt';
  const rows = sales.map(s =>
    [s.id, s.productId, `"${s.productName}"`, s.productSku, s.category, s.quantity, s.pricePerUnit, s.costPerUnit, s.revenue, s.profit, `"${s.note || ''}"`, s.soldAt].join(',')
  );
  const csv = [header, ...rows].join('\n');
  res.header('Content-Type', 'text/csv');
  res.header('Content-Disposition', `attachment; filename="sales_${req.params.bizId}_${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
});

// ─── Analytics ─────────────────────────────────────────────────────────────────
app.get('/api/businesses/:bizId/analytics', (req, res) => {
  assertSafeId(req.params.bizId);
  const sales = readData(`sales_${req.params.bizId}.json`);
  const products = readData(`products_${req.params.bizId}.json`);

  const totalRevenue = sales.reduce((s, x) => s + x.revenue, 0);
  const totalProfit = sales.reduce((s, x) => s + x.profit, 0);
  const totalSales = sales.length;

  // Revenue by period
  function groupBy(sales, fmt) {
    const map = {};
    sales.forEach(s => {
      const key = fmt(new Date(s.soldAt));
      if (!map[key]) map[key] = { period: key, revenue: 0, profit: 0, count: 0 };
      map[key].revenue += s.revenue;
      map[key].profit += s.profit;
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => a.period.localeCompare(b.period));
  }

  const pad = n => String(n).padStart(2, '0');
  const dailyFmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const weekFmt = d => {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${pad(week)}`;
  };
  const monthFmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}`;

  const revenueByPeriod = {
    daily: groupBy(sales, dailyFmt),
    weekly: groupBy(sales, weekFmt),
    monthly: groupBy(sales, monthFmt)
  };

  // Top/worst products
  const productSales = {};
  sales.forEach(s => {
    if (!productSales[s.productId]) {
      productSales[s.productId] = { productId: s.productId, productName: s.productName, totalQty: 0, totalRevenue: 0, totalProfit: 0 };
    }
    productSales[s.productId].totalQty += s.quantity;
    productSales[s.productId].totalRevenue += s.revenue;
    productSales[s.productId].totalProfit += s.profit;
  });
  const sorted = Object.values(productSales).sort((a, b) => b.totalRevenue - a.totalRevenue);
  const topProducts = sorted.slice(0, 5);
  const worstProducts = sorted.slice(-5).reverse();

  // Low stock and expiring
  const now = new Date();
  const in30days = new Date(now); in30days.setDate(now.getDate() + 30);
  const lowStockProducts = products.filter(p => p.quantity <= p.lowStockThreshold);
  const expiringProducts = products.filter(p => p.expiryDate && new Date(p.expiryDate) <= in30days && new Date(p.expiryDate) >= now);

  res.json({ totalRevenue, totalProfit, totalSales, revenueByPeriod, topProducts, worstProducts, lowStockProducts, expiringProducts });
});

// ─── Forecasting ───────────────────────────────────────────────────────────────
app.get('/api/businesses/:bizId/forecast', (req, res) => {
  assertSafeId(req.params.bizId);
  const products = readData(`products_${req.params.bizId}.json`);
  const sales = readData(`sales_${req.params.bizId}.json`);

  const forecasts = products.map(product => {
    const productSales = sales.filter(s => s.productId === product.id);
    if (productSales.length === 0) {
      return {
        productId: product.id,
        productName: product.name,
        forecastedDemand: 0,
        confidenceScore: 0,
        recommendedReorderQty: product.lowStockThreshold * 2,
        currentStock: product.quantity,
        trend: 'stable'
      };
    }

    // Group sales by day (last 30 days)
    const now = new Date();
    const days = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      days[key] = 0;
    }
    productSales.forEach(s => {
      const d = new Date(s.soldAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (days[key] !== undefined) days[key] += s.quantity;
    });

    const values = Object.values(days);
    const n = values.length;

    // Weighted moving average (more recent = higher weight)
    let weightedSum = 0;
    let weightTotal = 0;
    values.forEach((v, i) => {
      const weight = i + 1;
      weightedSum += v * weight;
      weightTotal += weight;
    });
    const wma = weightTotal > 0 ? weightedSum / weightTotal : 0;
    const forecastedDemand = Math.round(wma * 7); // weekly forecast

    // Confidence based on data points
    const nonZeroDays = values.filter(v => v > 0).length;
    const confidenceScore = Math.min(100, Math.round((nonZeroDays / n) * 100));

    // Trend detection (compare first half to second half)
    const firstHalf = values.slice(0, Math.floor(n / 2)).reduce((a, b) => a + b, 0);
    const secondHalf = values.slice(Math.floor(n / 2)).reduce((a, b) => a + b, 0);
    let trend = 'stable';
    if (secondHalf > firstHalf * 1.1) trend = 'increasing';
    else if (secondHalf < firstHalf * 0.9) trend = 'decreasing';

    const recommendedReorderQty = Math.max(product.lowStockThreshold, forecastedDemand * 2 - product.quantity);

    return {
      productId: product.id,
      productName: product.name,
      forecastedDemand,
      confidenceScore,
      recommendedReorderQty: Math.max(0, Math.round(recommendedReorderQty)),
      currentStock: product.quantity,
      trend
    };
  });

  res.json(forecasts);
});

// ─── Daily Backup ──────────────────────────────────────────────────────────────
cron.schedule('0 0 * * *', () => {
  try {
    const date = new Date().toISOString().slice(0, 10);
    const backupDir = path.join(DATA_DIR, 'backups', date);
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    files.forEach(file => {
      fs.copyFileSync(path.join(DATA_DIR, file), path.join(backupDir, file));
    });
    console.log(`[Backup] Backed up ${files.length} files to ${backupDir}`);
  } catch (err) {
    console.error('[Backup] Failed to create backup:', err.message);
  }
});

// ─── Global Error Handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Max 5MB.' });
  }
  const status = err.status || 500;
  const message = status < 500 ? err.message : 'Internal server error.';
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`SupplyPulse server running on http://localhost:${PORT}`);
});
