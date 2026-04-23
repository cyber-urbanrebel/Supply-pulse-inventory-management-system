'use strict';

// ── Global State ──────────────────────────────────────────────────────────────
const state = {
  currentBusiness: null,
  businesses: [],
  products: [],
  sales: [],
  stockLog: [],
  analytics: null,
  theme: localStorage.getItem('theme') || 'light',
  sidebarOpen: true,
  charts: {}
};

// ── Utility Functions ─────────────────────────────────────────────────────────
function formatCurrency(amount) {
  return '$' + Number(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── API Helper ────────────────────────────────────────────────────────────────
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body && !(body instanceof FormData)) {
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    delete opts.headers['Content-Type'];
    opts.body = body;
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-msg">${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toast-out 0.25s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  // Rebuild charts for new theme
  if (state.currentBusiness) refreshActiveCharts();
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const shell = document.getElementById('app-shell');

  // Section collapse
  document.querySelectorAll('.nav-section-header').forEach(header => {
    header.addEventListener('click', () => {
      const section = header.closest('.nav-section');
      section.classList.toggle('collapsed');
    });
  });

  // Hamburger toggle
  document.getElementById('hamburger-btn').addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('open');
    } else {
      state.sidebarOpen = !state.sidebarOpen;
      shell.classList.toggle('sidebar-collapsed', !state.sidebarOpen);
    }
  });

  document.getElementById('sidebar-close-btn').addEventListener('click', () => {
    sidebar.classList.remove('open');
  });

  // Close sidebar on mobile when clicking outside
  document.addEventListener('click', e => {
    if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && e.target !== document.getElementById('hamburger-btn')) {
        sidebar.classList.remove('open');
      }
    }
  });
}

// ── Navigation ────────────────────────────────────────────────────────────────
const VIEW_TITLES = {
  dashboard: 'Dashboard',
  products: 'Products',
  categories: 'Categories',
  'stock-log': 'Stock Log',
  'import-csv': 'Import CSV',
  'record-sale': 'Record Sale',
  'sales-history': 'Sales History',
  'export-csv': 'Export CSV',
  charts: 'Charts',
  'profit-report': 'Profit Report',
  'best-worst': 'Best / Worst Sellers',
  forecast: 'AI Forecast',
  settings: 'Settings',
  'no-business': 'Welcome'
};

function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById(`view-${viewId}`);
  if (view) view.classList.add('active');
  document.getElementById('page-title').textContent = VIEW_TITLES[viewId] || viewId;

  // Mark active nav item
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewId);
  });

  // Lazy-load view data
  if (state.currentBusiness) loadViewData(viewId);
}

function loadViewData(viewId) {
  switch (viewId) {
    case 'dashboard': loadDashboard(); break;
    case 'products': loadProducts(); break;
    case 'categories': loadCategories(); break;
    case 'stock-log': loadStockLog(); break;
    case 'sales-history': loadSalesHistory(); break;
    case 'record-sale': loadRecordSaleForm(); break;
    case 'charts': loadCharts(); break;
    case 'profit-report': loadProfitReport(); break;
    case 'best-worst': loadBestWorst(); break;
    case 'forecast': /* on demand */ break;
    case 'settings': loadSettings(); break;
  }
}

function initNav() {
  document.querySelectorAll('[data-view]').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const view = item.dataset.view;
      if (!state.currentBusiness && !['settings', 'no-business'].includes(view)) {
        showToast('Please select or create a business first.', 'warning');
        return;
      }
      showView(view);
      if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
      }
    });
  });
}

// ── Businesses ────────────────────────────────────────────────────────────────
async function loadBusinesses() {
  try {
    state.businesses = await api('GET', '/api/businesses');
    renderBusinessSelect();
    const savedId = localStorage.getItem('currentBusinessId');
    if (savedId && state.businesses.find(b => b.id === savedId)) {
      selectBusiness(savedId);
    } else if (state.businesses.length > 0) {
      selectBusiness(state.businesses[0].id);
    } else {
      showView('no-business');
    }
  } catch (err) {
    showToast('Failed to load businesses: ' + err.message, 'error');
  }
}

function renderBusinessSelect() {
  const sel = document.getElementById('business-select');
  sel.innerHTML = '<option value="">-- Select Business --</option>';
  state.businesses.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = escapeHtml(b.name);
    if (state.currentBusiness && state.currentBusiness.id === b.id) opt.selected = true;
    sel.appendChild(opt);
  });
}

function selectBusiness(id) {
  const biz = state.businesses.find(b => b.id === id);
  if (!biz) return;
  state.currentBusiness = biz;
  localStorage.setItem('currentBusinessId', id);
  document.getElementById('business-select').value = id;
  showView('dashboard');
}

function openBusinessModal(id = null) {
  const modal = document.getElementById('business-modal-overlay');
  const title = document.getElementById('business-modal-title');
  const nameInput = document.getElementById('business-name-input');
  const editId = document.getElementById('business-edit-id');
  if (id) {
    const biz = state.businesses.find(b => b.id === id);
    title.textContent = 'Edit Business';
    nameInput.value = biz ? biz.name : '';
    editId.value = id;
  } else {
    title.textContent = 'Create Business';
    nameInput.value = '';
    editId.value = '';
  }
  modal.style.display = 'flex';
  nameInput.focus();
}

function closeBusinessModal() {
  document.getElementById('business-modal-overlay').style.display = 'none';
}

async function saveBusiness(e) {
  e.preventDefault();
  const name = document.getElementById('business-name-input').value.trim();
  const id = document.getElementById('business-edit-id').value;
  try {
    if (id) {
      const updated = await api('PUT', `/api/businesses/${id}`, { name });
      const idx = state.businesses.findIndex(b => b.id === id);
      if (idx !== -1) state.businesses[idx] = updated;
      if (state.currentBusiness && state.currentBusiness.id === id) state.currentBusiness = updated;
      showToast('Business updated.', 'success');
    } else {
      const biz = await api('POST', '/api/businesses', { name });
      state.businesses.push(biz);
      showToast(`Business "${biz.name}" created.`, 'success');
      selectBusiness(biz.id);
    }
    renderBusinessSelect();
    closeBusinessModal();
    loadSettings();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteBusiness(id) {
  const biz = state.businesses.find(b => b.id === id);
  if (!confirm(`Delete business "${biz ? biz.name : id}" and all its data? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/api/businesses/${id}`);
    state.businesses = state.businesses.filter(b => b.id !== id);
    if (state.currentBusiness && state.currentBusiness.id === id) {
      state.currentBusiness = null;
      localStorage.removeItem('currentBusinessId');
    }
    renderBusinessSelect();
    showToast('Business deleted.', 'success');
    if (state.businesses.length > 0) {
      selectBusiness(state.businesses[0].id);
    } else {
      showView('no-business');
    }
    loadSettings();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  if (!state.currentBusiness) return;
  try {
    const [analytics, products] = await Promise.all([
      api('GET', `/api/businesses/${state.currentBusiness.id}/analytics`),
      api('GET', `/api/businesses/${state.currentBusiness.id}/products`)
    ]);
    state.analytics = analytics;
    state.products = products;

    document.getElementById('stat-revenue-val').textContent = formatCurrency(analytics.totalRevenue);
    document.getElementById('stat-profit-val').textContent = formatCurrency(analytics.totalProfit);
    document.getElementById('stat-sales-val').textContent = analytics.totalSales;
    document.getElementById('stat-products-val').textContent = products.length;

    // Low stock
    const lowEl = document.getElementById('low-stock-list');
    if (analytics.lowStockProducts.length === 0) {
      lowEl.innerHTML = '<div class="empty-hint">No low stock items 🎉</div>';
    } else {
      lowEl.innerHTML = analytics.lowStockProducts.map(p => `
        <div class="low-stock-item">
          <span>${escapeHtml(p.name)}</span>
          <span class="badge badge-warning">Qty: ${p.quantity} / ${p.lowStockThreshold}</span>
        </div>`).join('');
    }

    // Expiring
    const expEl = document.getElementById('expiring-list');
    if (analytics.expiringProducts.length === 0) {
      expEl.innerHTML = '<div class="empty-hint">No items expiring soon 🎉</div>';
    } else {
      expEl.innerHTML = analytics.expiringProducts.map(p => `
        <div class="expiring-item">
          <span>${escapeHtml(p.name)}</span>
          <span class="badge badge-danger">${formatDate(p.expiryDate)}</span>
        </div>`).join('');
    }

    // Chart
    renderDashboardChart(analytics.revenueByPeriod.monthly);
  } catch (err) {
    showToast('Failed to load dashboard: ' + err.message, 'error');
  }
}

function renderDashboardChart(data) {
  const ctx = document.getElementById('dashboard-chart');
  if (!ctx) return;
  if (state.charts.dashboard) { state.charts.dashboard.destroy(); delete state.charts.dashboard; }
  const labels = data.map(d => d.period);
  const values = data.map(d => d.revenue);
  state.charts.dashboard = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values,
        backgroundColor: 'rgba(59,130,246,0.7)',
        borderColor: 'rgba(59,130,246,1)',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v } } }
    }
  });
}

// ── Products ──────────────────────────────────────────────────────────────────
async function loadProducts(search = '', category = '') {
  if (!state.currentBusiness) return;
  try {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (category) params.set('category', category);
    const qs = params.toString() ? '?' + params.toString() : '';
    state.products = await api('GET', `/api/businesses/${state.currentBusiness.id}/products${qs}`);
    renderProductsTable();
    populateCategoryFilter();
  } catch (err) {
    showToast('Failed to load products: ' + err.message, 'error');
  }
}

function populateCategoryFilter() {
  const all = [...new Set(state.products.map(p => p.category).filter(Boolean))].sort();
  const sel = document.getElementById('category-filter');
  const current = sel.value;
  sel.innerHTML = '<option value="">All Categories</option>';
  all.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    if (c === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

function stockBadge(p) {
  if (p.quantity === 0) return '<span class="badge badge-danger">Out of Stock</span>';
  if (p.quantity <= p.lowStockThreshold) return '<span class="badge badge-warning">Low Stock</span>';
  return '<span class="badge badge-success">In Stock</span>';
}

function renderProductsTable() {
  const wrap = document.getElementById('products-table-wrap');
  if (state.products.length === 0) {
    wrap.innerHTML = '<div class="empty-hint">No products found</div>';
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name</th><th>SKU</th><th>Category</th><th>Qty</th>
          <th>Price</th><th>Cost</th><th>Status</th><th>Expiry</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${state.products.map(p => `
          <tr>
            <td>${escapeHtml(p.name)}</td>
            <td><code>${escapeHtml(p.sku)}</code></td>
            <td><span class="badge badge-info">${escapeHtml(p.category)}</span></td>
            <td>${p.quantity}</td>
            <td>${formatCurrency(p.price)}</td>
            <td>${formatCurrency(p.costPrice)}</td>
            <td>${stockBadge(p)}</td>
            <td>${p.expiryDate ? formatDate(p.expiryDate) : '—'}</td>
            <td>
              <button class="btn btn-sm btn-secondary" onclick="openEditProduct('${p.id}')">Edit</button>
              <button class="btn btn-sm btn-secondary" onclick="openAdjustModal('${p.id}')">Adjust</button>
              <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')">Del</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function openAddProduct() {
  const form = document.getElementById('product-form');
  form.reset();
  document.getElementById('product-id').value = '';
  document.getElementById('product-modal-title').textContent = 'Add Product';
  document.getElementById('product-modal-overlay').style.display = 'flex';
}

function openEditProduct(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  document.getElementById('product-id').value = p.id;
  document.getElementById('product-modal-title').textContent = 'Edit Product';
  document.getElementById('product-name').value = p.name;
  document.getElementById('product-sku').value = p.sku;
  document.getElementById('product-category').value = p.category;
  document.getElementById('product-qty').value = p.quantity;
  document.getElementById('product-price').value = p.price;
  document.getElementById('product-cost').value = p.costPrice;
  document.getElementById('product-threshold').value = p.lowStockThreshold;
  document.getElementById('product-expiry').value = p.expiryDate ? p.expiryDate.slice(0, 10) : '';
  document.getElementById('product-desc').value = p.description;
  document.getElementById('product-modal-overlay').style.display = 'flex';
}

function closeProductModal() {
  document.getElementById('product-modal-overlay').style.display = 'none';
}

async function saveProduct(e) {
  e.preventDefault();
  if (!state.currentBusiness) return;
  const id = document.getElementById('product-id').value;
  const body = {
    name: document.getElementById('product-name').value,
    sku: document.getElementById('product-sku').value,
    category: document.getElementById('product-category').value,
    quantity: document.getElementById('product-qty').value,
    price: document.getElementById('product-price').value,
    costPrice: document.getElementById('product-cost').value || 0,
    lowStockThreshold: document.getElementById('product-threshold').value || 10,
    expiryDate: document.getElementById('product-expiry').value || null,
    description: document.getElementById('product-desc').value
  };
  try {
    if (id) {
      await api('PUT', `/api/businesses/${state.currentBusiness.id}/products/${id}`, body);
      showToast('Product updated.', 'success');
    } else {
      await api('POST', `/api/businesses/${state.currentBusiness.id}/products`, body);
      showToast('Product added.', 'success');
    }
    closeProductModal();
    loadProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  try {
    await api('DELETE', `/api/businesses/${state.currentBusiness.id}/products/${id}`);
    showToast('Product deleted.', 'success');
    loadProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Adjust Stock ──────────────────────────────────────────────────────────────
function openAdjustModal(productId) {
  const p = state.products.find(x => x.id === productId);
  if (!p) return;
  document.getElementById('adjust-product-id').value = productId;
  document.getElementById('adjust-product-name').textContent = `${p.name} — current stock: ${p.quantity}`;
  document.getElementById('adjust-amount').value = '';
  document.getElementById('adjust-reason').value = '';
  document.getElementById('adjust-modal-overlay').style.display = 'flex';
}

function closeAdjustModal() {
  document.getElementById('adjust-modal-overlay').style.display = 'none';
}

async function saveAdjust(e) {
  e.preventDefault();
  const productId = document.getElementById('adjust-product-id').value;
  const adjustment = Number(document.getElementById('adjust-amount').value);
  const reason = document.getElementById('adjust-reason').value;
  try {
    await api('POST', `/api/businesses/${state.currentBusiness.id}/products/${productId}/adjust-stock`, { adjustment, reason });
    showToast('Stock adjusted.', 'success');
    closeAdjustModal();
    loadProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Categories ────────────────────────────────────────────────────────────────
async function loadCategories() {
  if (!state.currentBusiness) return;
  try {
    const products = await api('GET', `/api/businesses/${state.currentBusiness.id}/products`);
    const catMap = {};
    products.forEach(p => {
      const c = p.category || 'General';
      if (!catMap[c]) catMap[c] = { count: 0, totalValue: 0 };
      catMap[c].count++;
      catMap[c].totalValue += p.price * p.quantity;
    });
    const el = document.getElementById('categories-list');
    if (Object.keys(catMap).length === 0) {
      el.innerHTML = '<div class="empty-hint">No categories yet</div>';
      return;
    }
    el.innerHTML = `
      <table>
        <thead><tr><th>Category</th><th>Products</th><th>Inventory Value</th></tr></thead>
        <tbody>
          ${Object.entries(catMap).sort((a,b) => a[0].localeCompare(b[0])).map(([cat, d]) => `
            <tr>
              <td><span class="badge badge-info">${escapeHtml(cat)}</span></td>
              <td>${d.count}</td>
              <td>${formatCurrency(d.totalValue)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    showToast('Failed to load categories: ' + err.message, 'error');
  }
}

// ── Stock Log ─────────────────────────────────────────────────────────────────
async function loadStockLog() {
  if (!state.currentBusiness) return;
  try {
    state.stockLog = await api('GET', `/api/businesses/${state.currentBusiness.id}/stock-log`);
    const wrap = document.getElementById('stock-log-wrap');
    if (state.stockLog.length === 0) {
      wrap.innerHTML = '<div class="empty-hint">No stock adjustments yet</div>';
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead>
          <tr><th>Date</th><th>Product</th><th>Adjustment</th><th>New Qty</th><th>Reason</th></tr>
        </thead>
        <tbody>
          ${state.stockLog.map(l => `
            <tr>
              <td>${formatDateTime(l.timestamp)}</td>
              <td>${escapeHtml(l.productName)}</td>
              <td class="${l.adjustment > 0 ? 'text-success' : 'text-danger'}">${l.adjustment > 0 ? '+' : ''}${l.adjustment}</td>
              <td>${l.newQuantity}</td>
              <td>${escapeHtml(l.reason) || '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    showToast('Failed to load stock log: ' + err.message, 'error');
  }
}

// ── CSV Import ────────────────────────────────────────────────────────────────
let csvParsedData = null;

function initCsvImport() {
  const fileInput = document.getElementById('csv-file-input');
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    handleCsvFile(file);
  });

  const area = document.getElementById('csv-upload-area');
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleCsvFile(file);
  });

  document.getElementById('import-confirm-btn').addEventListener('click', importCsv);
}

function handleCsvFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) { showToast('CSV must have a header row and at least one data row.', 'error'); return; }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    csvParsedData = { file, headers, rows: [] };
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
      csvParsedData.rows.push(row);
    }
    renderCsvPreview(csvParsedData.rows.slice(0, 5), headers);
  };
  reader.readAsText(file);
}

function renderCsvPreview(rows, headers) {
  const previewEl = document.getElementById('csv-preview');
  const tableEl = document.getElementById('csv-preview-table');
  previewEl.style.display = 'block';
  tableEl.innerHTML = `
    <table>
      <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(row => `<tr>${headers.map(h => `<td>${escapeHtml(row[h] || '')}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
    <p class="text-muted mt-3" style="font-size:0.85rem">Showing first ${rows.length} rows of ${csvParsedData.rows.length} total.</p>`;
}

async function importCsv() {
  if (!csvParsedData || !state.currentBusiness) return;
  const formData = new FormData();
  formData.append('file', csvParsedData.file);
  try {
    const result = await api('POST', `/api/businesses/${state.currentBusiness.id}/products/import-csv`, formData);
    showToast(`Imported ${result.imported} products. ${result.errors.length ? result.errors.length + ' errors.' : ''}`, result.errors.length ? 'warning' : 'success');
    document.getElementById('csv-preview').style.display = 'none';
    document.getElementById('csv-file-input').value = '';
    csvParsedData = null;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Sales ─────────────────────────────────────────────────────────────────────
async function loadRecordSaleForm() {
  if (!state.currentBusiness) return;
  try {
    state.products = await api('GET', `/api/businesses/${state.currentBusiness.id}/products`);
    const sel = document.getElementById('sale-product-select');
    sel.innerHTML = '<option value="">Select a product…</option>';
    state.products.filter(p => p.quantity > 0).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (Stock: ${p.quantity}) — ${formatCurrency(p.price)}`;
      sel.appendChild(opt);
    });
  } catch (err) {
    showToast('Failed to load products: ' + err.message, 'error');
  }
}

function updateSalePreview() {
  const productId = document.getElementById('sale-product-select').value;
  const qty = Number(document.getElementById('sale-qty').value) || 1;
  const product = state.products.find(p => p.id === productId);
  const preview = document.getElementById('sale-preview');
  if (!product) { preview.style.display = 'none'; return; }
  preview.style.display = 'block';
  document.getElementById('sale-unit-price').textContent = formatCurrency(product.price);
  document.getElementById('sale-total-revenue').textContent = formatCurrency(product.price * qty);
  document.getElementById('sale-profit').textContent = formatCurrency((product.price - product.costPrice) * qty);
  document.getElementById('sale-stock').textContent = product.quantity;
}

async function recordSale(e) {
  e.preventDefault();
  const productId = document.getElementById('sale-product-select').value;
  const quantity = Number(document.getElementById('sale-qty').value);
  const note = document.getElementById('sale-note').value;
  if (!productId) { showToast('Please select a product.', 'warning'); return; }
  try {
    await api('POST', `/api/businesses/${state.currentBusiness.id}/sales`, { productId, quantity, note });
    showToast('Sale recorded!', 'success');
    document.getElementById('record-sale-form').reset();
    document.getElementById('sale-preview').style.display = 'none';
    loadRecordSaleForm();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadSalesHistory(from = '', to = '', period = '') {
  if (!state.currentBusiness) return;
  try {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (period) params.set('period', period);
    const qs = params.toString() ? '?' + params.toString() : '';
    state.sales = await api('GET', `/api/businesses/${state.currentBusiness.id}/sales${qs}`);
    renderSalesTable();
  } catch (err) {
    showToast('Failed to load sales: ' + err.message, 'error');
  }
}

function renderSalesTable() {
  const wrap = document.getElementById('sales-table-wrap');
  if (state.sales.length === 0) {
    wrap.innerHTML = '<div class="empty-hint">No sales found for the selected filters</div>';
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Date</th><th>Product</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Revenue</th><th>Profit</th><th>Note</th></tr>
      </thead>
      <tbody>
        ${state.sales.map(s => `
          <tr>
            <td>${formatDateTime(s.soldAt)}</td>
            <td>${escapeHtml(s.productName)}</td>
            <td><code>${escapeHtml(s.productSku || '')}</code></td>
            <td>${s.quantity}</td>
            <td>${formatCurrency(s.pricePerUnit)}</td>
            <td>${formatCurrency(s.revenue)}</td>
            <td class="${s.profit >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(s.profit)}</td>
            <td>${escapeHtml(s.note) || '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── Analytics ─────────────────────────────────────────────────────────────────
async function ensureAnalytics() {
  if (!state.currentBusiness) return null;
  try {
    state.analytics = await api('GET', `/api/businesses/${state.currentBusiness.id}/analytics`);
    return state.analytics;
  } catch (err) {
    showToast('Failed to load analytics: ' + err.message, 'error');
    return null;
  }
}

let currentChartPeriod = 'daily';

async function loadCharts() {
  const analytics = await ensureAnalytics();
  if (!analytics) return;
  renderRevenueChart(analytics.revenueByPeriod[currentChartPeriod], currentChartPeriod);
}

function renderRevenueChart(data, period) {
  const ctx = document.getElementById('revenue-chart');
  const profitCtx = document.getElementById('profit-chart');
  if (!ctx) return;

  if (state.charts.revenue) { state.charts.revenue.destroy(); delete state.charts.revenue; }
  if (state.charts.profit) { state.charts.profit.destroy(); delete state.charts.profit; }

  document.getElementById('chart-title').textContent = period.charAt(0).toUpperCase() + period.slice(1) + ' Revenue';

  const labels = data.map(d => d.period);
  const revenues = data.map(d => d.revenue);
  const profits = data.map(d => d.profit);

  state.charts.revenue = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: revenues,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v } } }
    }
  });

  state.charts.profit = new Chart(profitCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Profit',
        data: profits,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v } } }
    }
  });
}

async function loadProfitReport() {
  const analytics = await ensureAnalytics();
  if (!analytics) return;
  const wrap = document.getElementById('profit-report-wrap');
  const all = [...(analytics.topProducts || []), ...(analytics.worstProducts || [])];
  const unique = Array.from(new Map(all.map(p => [p.productId, p])).values())
    .sort((a, b) => b.totalProfit - a.totalProfit);
  if (unique.length === 0) {
    wrap.innerHTML = '<div class="empty-hint">No sales data yet</div>';
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Product</th><th>Units Sold</th><th>Revenue</th><th>Profit</th><th>Margin</th></tr>
      </thead>
      <tbody>
        ${unique.map(p => {
          const margin = p.totalRevenue > 0 ? (p.totalProfit / p.totalRevenue * 100).toFixed(1) : '0.0';
          return `
            <tr>
              <td>${escapeHtml(p.productName)}</td>
              <td>${p.totalQty}</td>
              <td>${formatCurrency(p.totalRevenue)}</td>
              <td class="${p.totalProfit >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(p.totalProfit)}</td>
              <td>${margin}%</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

async function loadBestWorst() {
  const analytics = await ensureAnalytics();
  if (!analytics) return;

  const bestEl = document.getElementById('best-sellers-list');
  if (!analytics.topProducts || analytics.topProducts.length === 0) {
    bestEl.innerHTML = '<div class="empty-hint">No sales data</div>';
  } else {
    bestEl.innerHTML = analytics.topProducts.map((p, i) => `
      <div class="seller-item">
        <span class="seller-rank">#${i+1}</span>
        <span style="flex:1">${escapeHtml(p.productName)}</span>
        <div style="text-align:right">
          <div>${formatCurrency(p.totalRevenue)}</div>
          <div class="text-muted" style="font-size:0.8rem">${p.totalQty} units</div>
        </div>
      </div>`).join('');
  }

  const worstEl = document.getElementById('worst-sellers-list');
  if (!analytics.worstProducts || analytics.worstProducts.length === 0) {
    worstEl.innerHTML = '<div class="empty-hint">No sales data</div>';
  } else {
    worstEl.innerHTML = analytics.worstProducts.map((p, i) => `
      <div class="seller-item">
        <span class="seller-rank">#${i+1}</span>
        <span style="flex:1">${escapeHtml(p.productName)}</span>
        <div style="text-align:right">
          <div>${formatCurrency(p.totalRevenue)}</div>
          <div class="text-muted" style="font-size:0.8rem">${p.totalQty} units</div>
        </div>
      </div>`).join('');
  }
}

// ── Forecast ──────────────────────────────────────────────────────────────────
async function loadForecast() {
  if (!state.currentBusiness) return;
  const wrap = document.getElementById('forecast-wrap');
  wrap.innerHTML = '<div class="empty-hint">Loading forecasts…</div>';
  try {
    const forecasts = await api('GET', `/api/businesses/${state.currentBusiness.id}/forecast`);
    if (forecasts.length === 0) {
      wrap.innerHTML = '<div class="empty-hint">No products to forecast</div>';
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Product</th><th>Current Stock</th><th>Forecasted Demand (7d)</th>
            <th>Confidence</th><th>Recommended Reorder</th><th>Trend</th>
          </tr>
        </thead>
        <tbody>
          ${forecasts.map(f => {
            const confClass = f.confidenceScore >= 70 ? 'badge-success' : f.confidenceScore >= 40 ? 'badge-warning' : 'badge-danger';
            const trendIcon = f.trend === 'increasing' ? '📈' : f.trend === 'decreasing' ? '📉' : '➡️';
            return `
              <tr>
                <td>${escapeHtml(f.productName)}</td>
                <td>${f.currentStock}</td>
                <td>${f.forecastedDemand}</td>
                <td><span class="badge ${confClass}">${f.confidenceScore}%</span></td>
                <td>${f.recommendedReorderQty}</td>
                <td>${trendIcon} ${f.trend}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    showToast('Failed to load forecasts: ' + err.message, 'error');
    wrap.innerHTML = '<div class="empty-hint">Failed to load forecasts</div>';
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────
function loadSettings() {
  const el = document.getElementById('settings-business-list');
  if (state.businesses.length === 0) {
    el.innerHTML = '<div class="empty-hint">No businesses yet</div>';
    return;
  }
  el.innerHTML = `
    <h4 class="mb-3">Your Businesses</h4>
    ${state.businesses.map(b => `
      <div class="settings-biz-row">
        <span class="settings-biz-name">${escapeHtml(b.name)}</span>
        <button class="btn btn-sm btn-secondary" onclick="openBusinessModal('${b.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteBusiness('${b.id}')">Delete</button>
      </div>`).join('')}
    <button class="btn btn-primary mt-4" onclick="openBusinessModal()">+ New Business</button>`;
}

// ── Active Charts Refresh ─────────────────────────────────────────────────────
function refreshActiveCharts() {
  const active = document.querySelector('.view.active');
  if (!active) return;
  const id = active.id.replace('view-', '');
  if (['charts', 'dashboard'].includes(id)) loadViewData(id);
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportSalesCsv() {
  if (!state.currentBusiness) return;
  window.open(`/api/businesses/${state.currentBusiness.id}/sales/export-csv`, '_blank');
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Apply stored theme
  applyTheme(state.theme);

  // Sidebar
  initSidebar();

  // Nav
  initNav();

  // CSV Import
  initCsvImport();

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('settings-light-btn').addEventListener('click', () => applyTheme('light'));
  document.getElementById('settings-dark-btn').addEventListener('click', () => applyTheme('dark'));

  // Business selector
  document.getElementById('business-select').addEventListener('change', e => {
    if (e.target.value) selectBusiness(e.target.value);
  });
  document.getElementById('new-business-btn').addEventListener('click', () => openBusinessModal());
  document.getElementById('create-first-business-btn').addEventListener('click', () => openBusinessModal());

  // Business modal
  document.getElementById('business-form').addEventListener('submit', saveBusiness);
  document.getElementById('business-modal-close').addEventListener('click', closeBusinessModal);
  document.getElementById('business-modal-cancel').addEventListener('click', closeBusinessModal);
  document.getElementById('business-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('business-modal-overlay')) closeBusinessModal();
  });

  // Product modal
  document.getElementById('add-product-btn').addEventListener('click', openAddProduct);
  document.getElementById('product-form').addEventListener('submit', saveProduct);
  document.getElementById('product-modal-close').addEventListener('click', closeProductModal);
  document.getElementById('product-modal-cancel').addEventListener('click', closeProductModal);
  document.getElementById('product-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('product-modal-overlay')) closeProductModal();
  });

  // Adjust stock modal
  document.getElementById('adjust-form').addEventListener('submit', saveAdjust);
  document.getElementById('adjust-modal-close').addEventListener('click', closeAdjustModal);
  document.getElementById('adjust-modal-cancel').addEventListener('click', closeAdjustModal);
  document.getElementById('adjust-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('adjust-modal-overlay')) closeAdjustModal();
  });

  // Product search & filter
  const debouncedSearch = debounce(() => {
    const search = document.getElementById('product-search').value;
    const category = document.getElementById('category-filter').value;
    loadProducts(search, category);
  }, 300);
  document.getElementById('product-search').addEventListener('input', debouncedSearch);
  document.getElementById('category-filter').addEventListener('change', debouncedSearch);

  // Sale form
  document.getElementById('record-sale-form').addEventListener('submit', recordSale);
  document.getElementById('sale-product-select').addEventListener('change', updateSalePreview);
  document.getElementById('sale-qty').addEventListener('input', updateSalePreview);

  // Sales history filter
  document.getElementById('filter-sales-btn').addEventListener('click', () => {
    const from = document.getElementById('sales-from').value;
    const to = document.getElementById('sales-to').value;
    const period = document.getElementById('sales-period').value;
    loadSalesHistory(from, to, period);
  });

  // Chart tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentChartPeriod = btn.dataset.period;
      if (state.analytics) {
        renderRevenueChart(state.analytics.revenueByPeriod[currentChartPeriod], currentChartPeriod);
      }
    });
  });

  // Forecast refresh
  document.getElementById('refresh-forecast-btn').addEventListener('click', loadForecast);

  // Export CSV
  document.getElementById('export-sales-btn').addEventListener('click', exportSalesCsv);

  // Load businesses
  loadBusinesses();
});
