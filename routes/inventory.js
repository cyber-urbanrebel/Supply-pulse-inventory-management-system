const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const store = require('../lib/store');

router.get('/:businessId', (req, res) => {
  const business = store.getBusiness(req.params.businessId);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  res.json(business.products);
});

router.post('/:businessId', (req, res) => {
  const business = store.getBusiness(req.params.businessId);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  const { name, sku, category, quantity, reorderLevel, price, cost } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Product name is required' });
  const product = {
    id: uuidv4(),
    name: name.trim(),
    sku: sku || '',
    category: category || '',
    quantity: Number(quantity) || 0,
    reorderLevel: Number(reorderLevel) || 0,
    price: Number(price) || 0,
    cost: Number(cost) || 0
  };
  business.products.push(product);
  store.saveBusiness(business);
  res.status(201).json(product);
});

router.put('/:businessId/:productId', (req, res) => {
  const business = store.getBusiness(req.params.businessId);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  const idx = business.products.findIndex(p => p.id === req.params.productId);
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });
  const allowed = ['name', 'sku', 'category', 'quantity', 'reorderLevel', 'price', 'cost'];
  const numericFields = ['quantity', 'reorderLevel', 'price', 'cost'];
  allowed.forEach(field => {
    if (req.body[field] !== undefined) {
      if (numericFields.includes(field)) {
        const num = Number(req.body[field]);
        if (!isNaN(num)) business.products[idx][field] = num;
      } else {
        business.products[idx][field] = req.body[field];
      }
    }
  });
  store.saveBusiness(business);
  res.json(business.products[idx]);
});

router.delete('/:businessId/:productId', (req, res) => {
  const business = store.getBusiness(req.params.businessId);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  business.products = business.products.filter(p => p.id !== req.params.productId);
  store.saveBusiness(business);
  res.status(204).end();
});

module.exports = router;
