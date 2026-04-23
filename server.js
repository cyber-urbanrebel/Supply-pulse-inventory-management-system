const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(express.json());
app.use(globalLimiter);
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiLimiter);
app.use('/api/businesses', require('./routes/businesses'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/sales', require('./routes/sales'));

const INDEX_HTML = path.join(__dirname, 'public', 'index.html');

// SPA catch-all
app.get('*', (req, res) => {
  res.sendFile(INDEX_HTML);
});

app.listen(PORT, () => {
  console.log(`Supply Pulse running on port ${PORT}`);
});

module.exports = app;
