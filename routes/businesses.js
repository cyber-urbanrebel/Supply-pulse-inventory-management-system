const express = require('express');
const router = express.Router();
const store = require('../lib/store');

router.get('/', (req, res) => {
  try {
    const businesses = store.listBusinesses();
    res.json(businesses);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Business name is required' });
  }
  try {
    const business = store.createBusiness(name.trim());
    res.status(201).json(business);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    store.deleteBusiness(req.params.id);
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
