// State
const state = {
  businesses: [],
  selectedBusinessId: null,
  selectedBusinessName: null,
  products: [],
  sales: [],
  activeTab: 'businesses',
  inventoryInterval: null
};

const INVENTORY_REFRESH_INTERVAL_MS = 30000;
const TOAST_DURATION_MS = 4000;

// --- API helpers ---
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

// --- Tab navigation ---
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.toggle('active', s.id === `tab-${tab}`));

  clearInterval(state.inventoryInterval);
  state.inventoryInterval = null;

  if (!state.selectedBusinessId && tab !== 'businesses') {
    showRequiresBusiness(tab);
    return;
  }

  switch (tab) {
    case 'businesses': loadBusinesses(); break;
    case 'inventory':
      loadInventory();
      state.inventoryInterval = setInterval(loadInventory, INVENTORY_REFRESH_INTERVAL_MS);
      break;
    case 'sales': loadSales(); break;
    case 'alerts': loadAlerts(); break;
    case 'forecast': loadForecastTab(); break;
  }
}

function showRequiresBusiness(tab) {
  const ids = { inventory: 'inventory', sales: 'sales', alerts: 'alerts', forecast: 'forecast' };
  const prefix = ids[tab];
  if (!prefix) return;
  document.getElementById(`${prefix}-requires-business`)?.classList.remove('hidden');
  document.getElementById(`${prefix}-content`)?.classList.add('hidden');
}

function hideRequiresBusiness(tab) {
  const prefix = tab;
  document.getElementById(`${prefix}-requires-business`)?.classList.add('hidden');
  document.getElementById(`${prefix}-content`)?.classList.remove('hidden');
}

// --- Businesses ---
async function loadBusinesses() {
  try {
    state.businesses = await api('GET', '/businesses');
    renderBusinesses();
  } catch (e) { showError('Failed to load businesses: ' + e.message); }
}

function renderBusinesses() {
  const list = document.getElementById('businesses-list');
  if (!state.businesses.length) {
    list.innerHTML = '<p style="color:#888;text-align:center;padding:16px">No businesses yet. Add one above.</p>';
    return;
  }
  list.innerHTML = state.businesses.map(b => `
    <div class="business-item ${b.id === state.selectedBusinessId ? 'selected' : ''}">
      <span class="business-item-name">🏢 ${escHtml(b.name)}</span>
      <div class="business-item-actions">
        <button class="btn btn-small btn-primary" onclick="selectBusiness('${b.id}', '${escAttr(b.name)}')">Select</button>
        <button class="btn btn-small btn-danger" onclick="deleteBusiness('${b.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

async function selectBusiness(id, name) {
  state.selectedBusinessId = id;
  state.selectedBusinessName = name;
  document.getElementById('active-business-display').textContent = '🏢 ' + name;
  renderBusinesses();
}

async function deleteBusiness(id) {
  if (!confirm('Delete this business and all its data?')) return;
  try {
    await api('DELETE', `/businesses/${id}`);
    if (state.selectedBusinessId === id) {
      state.selectedBusinessId = null;
      state.selectedBusinessName = null;
      document.getElementById('active-business-display').textContent = 'No business selected';
    }
    await loadBusinesses();
  } catch (e) { showError(e.message); }
}

document.getElementById('add-business-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('business-name-input').value.trim();
  if (!name) return;
  try {
    await api('POST', '/businesses', { name });
    document.getElementById('business-name-input').value = '';
    await loadBusinesses();
  } catch (e) { showError(e.message); }
});

// --- Inventory ---
async function loadInventory() {
  if (!state.selectedBusinessId) return;
  hideRequiresBusiness('inventory');
  try {
    state.products = await api('GET', `/inventory/${state.selectedBusinessId}`);
    renderInventory();
    populateSaleProductSelect();
    populateForecastProductSelect();
  } catch (e) { showError('Failed to load inventory: ' + e.message); }
}

function renderInventory() {
  const tbody = document.getElementById('inventory-tbody');
  if (!state.products.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;padding:20px">No products yet.</td></tr>';
    return;
  }
  tbody.innerHTML = state.products.map(p => {
    const lowStock = p.quantity <= p.reorderLevel;
    return `
    <tr class="${lowStock ? 'low-stock' : ''}">
      <td>${escHtml(p.name)} ${lowStock ? '⚠️' : ''}</td>
      <td>${escHtml(p.sku || '')}</td>
      <td>${escHtml(p.category || '')}</td>
      <td>
        <input type="number" class="qty-input" value="${p.quantity}" id="qty-${p.id}" min="0">
        <button class="qty-save-btn" onclick="saveQty('${p.id}')">✓</button>
      </td>
      <td>${p.reorderLevel}</td>
      <td>$${Number(p.price).toFixed(2)}</td>
      <td>$${Number(p.cost).toFixed(2)}</td>
      <td>
        <button class="btn btn-small btn-secondary" onclick="openEditModal('${p.id}')">Edit</button>
        <button class="btn btn-small btn-danger" onclick="deleteProduct('${p.id}')">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

async function saveQty(productId) {
  const val = parseInt(document.getElementById(`qty-${productId}`).value, 10);
  if (isNaN(val) || val < 0) return;
  try {
    await api('PUT', `/inventory/${state.selectedBusinessId}/${productId}`, { quantity: val });
    await loadInventory();
  } catch (e) { showError(e.message); }
}

document.getElementById('add-product-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!state.selectedBusinessId) { showError('Select a business first'); return; }
  const product = {
    name: document.getElementById('product-name').value.trim(),
    sku: document.getElementById('product-sku').value.trim(),
    category: document.getElementById('product-category').value.trim(),
    quantity: Number(document.getElementById('product-quantity').value),
    reorderLevel: Number(document.getElementById('product-reorder').value),
    price: Number(document.getElementById('product-price').value),
    cost: Number(document.getElementById('product-cost').value)
  };
  try {
    await api('POST', `/inventory/${state.selectedBusinessId}`, product);
    e.target.reset();
    document.getElementById('product-reorder').value = '10';
    await loadInventory();
  } catch (e2) { showError(e2.message); }
});

async function deleteProduct(productId) {
  if (!confirm('Delete this product?')) return;
  try {
    await api('DELETE', `/inventory/${state.selectedBusinessId}/${productId}`);
    await loadInventory();
  } catch (e) { showError(e.message); }
}

// Edit modal
function openEditModal(productId) {
  const p = state.products.find(x => x.id === productId);
  if (!p) return;
  document.getElementById('edit-product-id').value = p.id;
  document.getElementById('edit-name').value = p.name;
  document.getElementById('edit-sku').value = p.sku || '';
  document.getElementById('edit-category').value = p.category || '';
  document.getElementById('edit-quantity').value = p.quantity;
  document.getElementById('edit-reorder').value = p.reorderLevel;
  document.getElementById('edit-price').value = p.price;
  document.getElementById('edit-cost').value = p.cost;
  document.getElementById('edit-modal').classList.remove('hidden');
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('edit-modal').classList.add('hidden');
  document.getElementById('modal-overlay').classList.add('hidden');
}

document.getElementById('close-modal').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', closeModal);

document.getElementById('edit-product-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('edit-product-id').value;
  const updates = {
    name: document.getElementById('edit-name').value.trim(),
    sku: document.getElementById('edit-sku').value.trim(),
    category: document.getElementById('edit-category').value.trim(),
    quantity: Number(document.getElementById('edit-quantity').value),
    reorderLevel: Number(document.getElementById('edit-reorder').value),
    price: Number(document.getElementById('edit-price').value),
    cost: Number(document.getElementById('edit-cost').value)
  };
  try {
    await api('PUT', `/inventory/${state.selectedBusinessId}/${id}`, updates);
    closeModal();
    await loadInventory();
  } catch (e2) { showError(e2.message); }
});

// --- Sales ---
async function loadSales() {
  if (!state.selectedBusinessId) { showRequiresBusiness('sales'); return; }
  hideRequiresBusiness('sales');
  try {
    state.sales = await api('GET', `/sales/${state.selectedBusinessId}`);
    if (!state.products.length) {
      state.products = await api('GET', `/inventory/${state.selectedBusinessId}`);
    }
    populateSaleProductSelect();
    renderSalesHistory();
    await loadAnalytics();
  } catch (e) { showError('Failed to load sales: ' + e.message); }
}

function populateSaleProductSelect() {
  const sel = document.getElementById('sale-product-select');
  const current = sel.value;
  sel.innerHTML = '<option value="">-- Select Product --</option>' +
    state.products.map(p => `<option value="${p.id}">${escHtml(p.name)} (stock: ${p.quantity})</option>`).join('');
  if (current) sel.value = current;
}

function renderSalesHistory() {
  const tbody = document.getElementById('sales-tbody');
  const productMap = Object.fromEntries(state.products.map(p => [p.id, p.name]));
  if (!state.sales.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;padding:20px">No sales recorded yet.</td></tr>';
    return;
  }
  const sorted = [...state.sales].sort((a, b) => new Date(b.date) - new Date(a.date));
  tbody.innerHTML = sorted.slice(0, 50).map(s => `
    <tr>
      <td>${new Date(s.date).toLocaleDateString()}</td>
      <td>${escHtml(productMap[s.productId] || s.productId)}</td>
      <td>${s.quantity}</td>
      <td>$${Number(s.revenue).toFixed(2)}</td>
    </tr>
  `).join('');
}

async function loadAnalytics() {
  try {
    const a = await api('GET', `/sales/${state.selectedBusinessId}/analytics`);
    renderAnalytics(a);
  } catch (e) { console.error('Analytics error:', e); }
}

function renderAnalytics(a) {
  document.getElementById('analytics-summary').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">$${Number(a.totalRevenue).toFixed(2)}</div>
      <div class="stat-label">Total Revenue</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${a.totalSales}</div>
      <div class="stat-label">Total Sales</div>
    </div>
  `;

  const maxRev = a.topProducts.length ? Math.max(a.topProducts[0].revenue, 1) : 1;
  document.getElementById('top-products-chart').innerHTML = a.topProducts.length
    ? a.topProducts.map(p => `
      <div class="bar-row">
        <div class="bar-label" title="${escHtml(p.name)}">${escHtml(p.name)}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${Math.max(2, (p.revenue / maxRev * 100).toFixed(1))}%"></div>
        </div>
        <div class="bar-value">$${Number(p.revenue).toFixed(0)}</div>
      </div>
    `).join('')
    : '<p style="color:#888;font-size:0.85rem">No sales data yet.</p>';

  renderLineChart(a.salesByDay);
}

function renderLineChart(salesByDay) {
  const container = document.getElementById('sales-chart');
  if (!salesByDay || !salesByDay.length) {
    container.innerHTML = '<p style="color:#888;font-size:0.85rem;padding:10px 0">No data for last 30 days.</p>';
    return;
  }

  const W = 600, H = 160, padL = 50, padR = 16, padT = 16, padB = 30;
  const cW = W - padL - padR;
  const cH = H - padT - padB;

  const revenues = salesByDay.map(d => d.revenue);
  const maxR = Math.max(...revenues, 1);

  const xStep = cW / Math.max(salesByDay.length - 1, 1);

  const points = salesByDay.map((d, i) => {
    const x = padL + i * xStep;
    const y = padT + cH - (d.revenue / maxR) * cH;
    return `${x},${y}`;
  });

  const labelStep = Math.ceil(salesByDay.length / 6);
  const labels = salesByDay
    .map((d, i) => i % labelStep === 0
      ? `<text x="${padL + i * xStep}" y="${H - 4}" text-anchor="middle" font-size="9" fill="#999">${d.date.slice(5)}</text>`
      : '')
    .join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="max-height:180px">
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + cH}" stroke="#e0e4ea" stroke-width="1"/>
      <line x1="${padL}" y1="${padT + cH}" x2="${W - padR}" y2="${padT + cH}" stroke="#e0e4ea" stroke-width="1"/>
      <text x="${padL - 4}" y="${padT + 4}" text-anchor="end" font-size="9" fill="#999">$${maxR.toFixed(0)}</text>
      <text x="${padL - 4}" y="${padT + cH}" text-anchor="end" font-size="9" fill="#999">$0</text>
      <polyline points="${points.join(' ')}" fill="none" stroke="#00b894" stroke-width="2" stroke-linejoin="round"/>
      ${salesByDay.map((d, i) => `<circle cx="${padL + i * xStep}" cy="${padT + cH - (d.revenue / maxR) * cH}" r="3" fill="#00b894"/>`).join('')}
      ${labels}
    </svg>
  `;
}

document.getElementById('record-sale-form').addEventListener('submit', async e => {
  e.preventDefault();
  const productId = document.getElementById('sale-product-select').value;
  const quantity = Number(document.getElementById('sale-quantity').value);
  if (!productId || quantity < 1) { showError('Select a product and valid quantity'); return; }
  try {
    await api('POST', `/sales/${state.selectedBusinessId}`, { productId, quantity });
    document.getElementById('sale-quantity').value = '1';
    state.sales = await api('GET', `/sales/${state.selectedBusinessId}`);
    state.products = await api('GET', `/inventory/${state.selectedBusinessId}`);
    populateSaleProductSelect();
    renderSalesHistory();
    await loadAnalytics();
  } catch (e2) { showError(e2.message); }
});

// --- Alerts ---
async function loadAlerts() {
  if (!state.selectedBusinessId) { showRequiresBusiness('alerts'); return; }
  hideRequiresBusiness('alerts');
  try {
    const products = await api('GET', `/inventory/${state.selectedBusinessId}`);
    const lowStock = products.filter(p => p.quantity <= p.reorderLevel);
    const alertsList = document.getElementById('alerts-list');
    if (!lowStock.length) {
      alertsList.innerHTML = '<p style="color:#00b894;text-align:center;padding:20px">✅ All products are adequately stocked!</p>';
      return;
    }
    alertsList.innerHTML = '<p style="margin-bottom:12px;color:#888;font-size:0.85rem">Loading forecasts...</p>';
    const items = await Promise.all(lowStock.map(async p => {
      let forecastHtml = '';
      try {
        const f = await api('GET', `/sales/${state.selectedBusinessId}/forecast/${p.id}`);
        forecastHtml = `<div class="alert-forecast">🔮 Forecast: ~${Math.ceil(f.forecastedDemand)} units/week · Recommended restock: <strong>${f.recommendedRestock}</strong> units</div>`;
      } catch { forecastHtml = ''; }
      return `
        <div class="alert-item">
          <div class="alert-item-header">
            <span class="alert-item-name">${escHtml(p.name)}</span>
            <span class="badge badge-danger">⚠️ Low Stock</span>
          </div>
          <div class="alert-details">
            Current: <span class="alert-qty">${p.quantity}</span> · Reorder at: ${p.reorderLevel} · SKU: ${escHtml(p.sku || 'N/A')}
          </div>
          ${forecastHtml}
        </div>
      `;
    }));
    alertsList.innerHTML = items.join('');
  } catch (e) { showError('Failed to load alerts: ' + e.message); }
}

document.getElementById('refresh-alerts-btn').addEventListener('click', loadAlerts);

// --- Forecast Tab ---
function loadForecastTab() {
  if (!state.selectedBusinessId) { showRequiresBusiness('forecast'); return; }
  hideRequiresBusiness('forecast');
  populateForecastProductSelect();
}

function populateForecastProductSelect() {
  const sel = document.getElementById('forecast-product-select');
  const current = sel.value;
  sel.innerHTML = '<option value="">-- Select Product --</option>' +
    state.products.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
  if (current) sel.value = current;
}

async function loadForecast(productId) {
  if (!productId || !state.selectedBusinessId) return;
  const result = document.getElementById('forecast-result');
  result.innerHTML = '<p style="color:#888">Loading forecast...</p>';
  try {
    const f = await api('GET', `/sales/${state.selectedBusinessId}/forecast/${productId}`);
    result.innerHTML = `
      <div class="forecast-result-card">
        <div class="forecast-metric"><label>Product</label><strong>${escHtml(f.name)}</strong></div>
        <div class="forecast-metric"><label>Forecasted Demand (7 days)</label><strong>${Math.ceil(f.forecastedDemand)} units</strong></div>
        <div class="forecast-metric"><label>Recommended Restock</label><strong>${f.recommendedRestock} units</strong></div>
      </div>
    `;
  } catch (e) { result.innerHTML = `<p style="color:#e17055">Error: ${escHtml(e.message)}</p>`; }
}

document.getElementById('run-forecast-btn').addEventListener('click', () => {
  const productId = document.getElementById('forecast-product-select').value;
  if (!productId) { showError('Select a product first'); return; }
  loadForecast(productId);
});

// --- Utilities ---
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function showError(msg) {
  const existing = document.getElementById('toast-error');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'toast-error';
  toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#e17055;color:white;padding:12px 20px;border-radius:8px;z-index:9999;font-size:0.9rem;max-width:360px;box-shadow:0 4px 12px rgba(0,0,0,0.2)';
  toast.textContent = '⚠️ ' + msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), TOAST_DURATION_MS);
}

// --- Init ---
initTabs();
loadBusinesses();
