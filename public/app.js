const api = {
	async get(url) {
		const response = await fetch(url);
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || "Request failed");
		return data;
	},
	async post(url, body) {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || "Request failed");
		return data;
	},
};

const S = {
	businessId: null,
	businesses: [],
	overview: null,
	forecast: [],
};

const viewTitles = {
	dashboard: "Dashboard",
	products: "Products",
	suppliers: "Suppliers",
	sales: "Sales",
	orders: "Purchase Orders",
	forecast: "Demand Forecast",
};

const byId = (id) => document.getElementById(id);

function esc(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;");
}

function toast(message, ok = true) {
	const el = byId("toast");
	el.textContent = message;
	el.style.background = ok ? "#0f172a" : "#b91c1c";
	el.classList.remove("hidden");
	requestAnimationFrame(() => el.classList.add("show"));
	setTimeout(() => {
		el.classList.remove("show");
		setTimeout(() => el.classList.add("hidden"), 220);
	}, 3000);
}

function currency(value) {
	const amount = Number(value || 0);
	const code = S.businesses.find((b) => b.id === S.businessId)?.currency || "USD";
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: code,
			maximumFractionDigits: 2,
		}).format(amount);
	} catch {
		return `${code} ${amount.toFixed(2)}`;
	}
}

function num(value) {
	return Number(value || 0).toLocaleString();
}

function dateTime(value) {
	if (!value) return "-";
	return new Date(value).toLocaleString();
}

function safeArray(value) {
	return Array.isArray(value) ? value : [];
}

function showView(name) {
	document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
	document.querySelectorAll(".nav-item").forEach((el) => el.classList.remove("active"));

	const viewEl = byId(`view-${name}`);
	if (viewEl) viewEl.classList.add("active");

	const navEl = document.querySelector(`.nav-item[data-view="${name}"]`);
	if (navEl) navEl.classList.add("active");

	byId("view-title").textContent = viewTitles[name] || "SupplyPulse";
}

document.querySelectorAll(".nav-item").forEach((item) => {
	item.addEventListener("click", (event) => {
		event.preventDefault();
		showView(item.dataset.view);
	});
});

function renderBizSelect() {
	const select = byId("businessSelect");
	const options = S.businesses
		.map((b) => `<option value="${esc(b.id)}">${esc(b.name)} (${esc(b.currency || "USD")})</option>`)
		.join("");
	select.innerHTML = options;
	if (S.businessId) select.value = S.businessId;
}

byId("businessSelect").addEventListener("change", async (event) => {
	S.businessId = event.target.value;
	await refresh();
});

function updateSidebarPulse() {
	const text = byId("sidebarPulseText");
	if (!S.overview) {
		text.textContent = "Add a business and start recording data to unlock smart supply chain insights.";
		return;
	}

	const k = S.overview.kpis || {};
	const low = Number(k.lowStockCount || 0);
	const pending = Number(k.pendingPurchaseOrders || 0);
	const revenue = Number(k.totalRevenue || 0);

	if (low > 0 && pending === 0) {
		text.textContent = `${low} item(s) are below safety stock with no pending receipts. Restock action is recommended today.`;
		return;
	}
	if (pending > 0) {
		text.textContent = `${pending} purchase order(s) are in transit. Prioritize receiving to reduce stock pressure and improve forecast stability.`;
		return;
	}
	if (revenue > 0) {
		text.textContent = "Inventory flow is stable and sales are moving. Use forecast recommendations to protect margin while scaling.";
		return;
	}

	text.textContent = "You are set up and ready. Add products and record sales to activate demand forecasting intelligence.";
}

async function refresh() {
	if (!S.businessId) return;
	try {
		const [overview, forecast] = await Promise.all([
			api.get(`/api/businesses/${S.businessId}/overview`),
			api.get(`/api/businesses/${S.businessId}/forecast`),
		]);
		S.overview = overview;
		S.forecast = safeArray(forecast);

		renderDashboard();
		renderProducts();
		renderSuppliers();
		renderSales();
		renderPOs();
		renderForecast();
		updateSidebarPulse();
	} catch (error) {
		toast(`Refresh failed: ${error.message}`, false);
	}
}

function topProductsByRevenue() {
	const sales = safeArray(S.overview?.sales);
	const products = safeArray(S.overview?.products);
	const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
	const totals = {};

	for (const sale of sales) {
		const key = sale.productId;
		if (!totals[key]) totals[key] = { qty: 0, revenue: 0 };
		totals[key].qty += Number(sale.quantity || 0);
		totals[key].revenue += Number(sale.quantity || 0) * Number(sale.unitPrice || 0);
	}

	return Object.entries(totals)
		.map(([productId, data]) => ({
			productId,
			name: productMap[productId]?.name || productId,
			qty: data.qty,
			revenue: data.revenue,
			marginPerUnit: Number(productMap[productId]?.unitPrice || 0) - Number(productMap[productId]?.unitCost || 0),
		}))
		.sort((a, b) => b.revenue - a.revenue);
}

function renderDashboard() {
	const k = S.overview?.kpis || {};
	const products = safeArray(S.overview?.products);
	const suppliers = safeArray(S.overview?.suppliers);
	const sales = safeArray(S.overview?.sales);
	const pos = safeArray(S.overview?.purchaseOrders);

	byId("kpiGrid").innerHTML = `
		<div class="kpi-card accent">
			<div class="kpi-label">Total Products</div>
			<div class="kpi-value">${num(k.totalProducts || 0)}</div>
			<div class="kpi-sub">Across ${num(suppliers.length)} active supplier(s)</div>
		</div>
		<div class="kpi-card success">
			<div class="kpi-label">Inventory Value</div>
			<div class="kpi-value">${currency(k.inventoryValue)}</div>
			<div class="kpi-sub">Working capital currently on shelves</div>
		</div>
		<div class="kpi-card ${Number(k.lowStockCount || 0) > 0 ? "danger" : "success"}">
			<div class="kpi-label">Low Stock Exposure</div>
			<div class="kpi-value">${num(k.lowStockCount || 0)}</div>
			<div class="kpi-sub">Items at or below safety stock</div>
		</div>
		<div class="kpi-card success">
			<div class="kpi-label">Total Revenue</div>
			<div class="kpi-value">${currency(k.totalRevenue)}</div>
			<div class="kpi-sub">Cumulative top-line from all recorded sales</div>
		</div>
		<div class="kpi-card accent">
			<div class="kpi-label">Gross Margin</div>
			<div class="kpi-value">${currency(k.grossMargin)}</div>
			<div class="kpi-sub">Revenue less cost of goods sold</div>
		</div>
		<div class="kpi-card ${Number(k.pendingPurchaseOrders || 0) > 0 ? "warn" : "success"}">
			<div class="kpi-label">Pending Purchase Orders</div>
			<div class="kpi-value">${num(k.pendingPurchaseOrders || 0)}</div>
			<div class="kpi-sub">Inbound supply still awaiting receipt</div>
		</div>
	`;

	const lowStock = products
		.filter((p) => Number(p.stockOnHand || 0) <= Number(p.safetyStock || 0))
		.sort((a, b) => (a.stockOnHand - a.safetyStock) - (b.stockOnHand - b.safetyStock));

	byId("lowStockList").innerHTML = lowStock.length
		? lowStock
			.slice(0, 8)
			.map((p) => `
				<div class="list-item">
					<div>
						<div class="list-item-name">${esc(p.name)}</div>
						<div class="list-item-sub">SKU ${esc(p.sku)} | Safety ${num(p.safetyStock)}</div>
					</div>
					<span class="tag tag-red">Stock ${num(p.stockOnHand)}</span>
				</div>
			`)
			.join("")
		: `<div class="empty-state">No immediate stock risk detected. Your safety stock coverage is healthy.</div>`;

	const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));
	const pending = pos.filter((po) => po.status === "pending");
	byId("pendingPoList").innerHTML = pending.length
		? pending
			.slice(0, 8)
			.map((po) => `
				<div class="list-item">
					<div>
						<div class="list-item-name">${esc(supplierMap[po.supplierId] || po.supplierId)}</div>
						<div class="list-item-sub">${num(po.items?.length || 0)} item(s) | ${currency(po.total)}</div>
					</div>
					<button class="btn-sm btn-success" onclick="receivePO('${esc(po.id)}')">Receive</button>
				</div>
			`)
			.join("")
		: `<div class="empty-state">No pending receipts. Inbound pipeline is fully processed.</div>`;

	const topRevenue = topProductsByRevenue().slice(0, 3);
	const bestSeller = topRevenue[0];
	const lowCount = Number(k.lowStockCount || 0);
	const pendingCount = Number(k.pendingPurchaseOrders || 0);

	byId("dashboardInsights").innerHTML = `
		<div class="insight-card">
			<h4>Revenue Driver</h4>
			<p>${bestSeller ? `${esc(bestSeller.name)} leads with ${currency(bestSeller.revenue)} from ${num(bestSeller.qty)} unit(s) sold.` : "Record sales to identify your strongest revenue contributors."}</p>
		</div>
		<div class="insight-card">
			<h4>Inventory Pressure</h4>
			<p>${lowCount > 0 ? `${num(lowCount)} SKU(s) are in risk range. Fast-moving items should be prioritized for replenishment.` : "No critical stock pressure right now. Reorder thresholds are currently respected."}</p>
		</div>
		<div class="insight-card">
			<h4>Procurement Flow</h4>
			<p>${pendingCount > 0 ? `${num(pendingCount)} order(s) are pending receipt. Processing inbound stock will improve service levels.` : "Procurement flow is clear with zero pending inbound orders."}</p>
		</div>
	`;

	const grossMargin = Number(k.grossMargin || 0);
	const revenue = Number(k.totalRevenue || 0);
	const marginRate = revenue > 0 ? (grossMargin / revenue) * 100 : 0;

	byId("executiveBrief").innerHTML = `
		Current run-rate shows ${currency(revenue)} in revenue with a margin realization of ${marginRate.toFixed(1)}%. 
		${lowCount > 0 ? `There are ${num(lowCount)} low-stock SKU(s) that could constrain demand capture if replenishment is delayed.` : "Stock depth is currently sufficient to support near-term demand."}
		${pendingCount > 0 ? `Pending inbound value stands at ${currency(pending.reduce((sum, po) => sum + Number(po.total || 0), 0))}, which can relieve pressure once received.` : "No inbound backlog is waiting, so operational responsiveness is high."}
	`;

	const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
	const recentSales = [...sales]
		.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
		.slice(0, 10);

	byId("recentSalesTable").innerHTML = recentSales.length
		? `
			<thead>
				<tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Timestamp</th></tr>
			</thead>
			<tbody>
				${recentSales
					.map((s) => `
						<tr>
							<td class="bold">${esc(productMap[s.productId]?.name || s.productId)}</td>
							<td>${num(s.quantity)}</td>
							<td>${currency(s.unitPrice)}</td>
							<td class="bold">${currency(Number(s.quantity || 0) * Number(s.unitPrice || 0))}</td>
							<td>${dateTime(s.createdAt)}</td>
						</tr>
					`)
					.join("")}
			</tbody>
		`
		: `<tbody><tr><td class="empty-state" colspan="5">No sales recorded yet. Once you post sales, your dashboard will unlock trend intelligence.</td></tr></tbody>`;
}

function renderProducts() {
	const products = safeArray(S.overview?.products);
	const suppliers = safeArray(S.overview?.suppliers);
	const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));

	byId("productsTable").innerHTML = products.length
		? `
			<thead>
				<tr>
					<th>Name</th><th>SKU</th><th>Category</th><th>Stock</th><th>Safety</th><th>Unit Cost</th><th>Unit Price</th><th>Supplier</th><th>Auto Reorder</th>
				</tr>
			</thead>
			<tbody>
				${products
					.map((p) => {
						const risk = Number(p.stockOnHand || 0) <= Number(p.safetyStock || 0);
						return `
							<tr>
								<td class="bold">${esc(p.name)}</td>
								<td><span class="tag tag-gray">${esc(p.sku)}</span></td>
								<td>${esc(p.category || "-")}</td>
								<td><span class="tag ${risk ? "tag-red" : "tag-green"}">${num(p.stockOnHand)}</span></td>
								<td>${num(p.safetyStock)}</td>
								<td>${currency(p.unitCost)}</td>
								<td>${currency(p.unitPrice)}</td>
								<td>${esc(supplierMap[p.supplierId] || "-")}</td>
								<td>${p.autoReorder ? "Yes" : "No"}</td>
							</tr>
						`;
					})
					.join("")}
			</tbody>
		`
		: `<tbody><tr><td class="empty-state" colspan="9">No products added yet. Add your catalog to begin stock analytics.</td></tr></tbody>`;

	const categoryAgg = {};
	for (const p of products) {
		const category = p.category || "Uncategorized";
		if (!categoryAgg[category]) {
			categoryAgg[category] = { count: 0, stock: 0, value: 0, risk: 0 };
		}
		categoryAgg[category].count += 1;
		categoryAgg[category].stock += Number(p.stockOnHand || 0);
		categoryAgg[category].value += Number(p.stockOnHand || 0) * Number(p.unitCost || 0);
		if (Number(p.stockOnHand || 0) <= Number(p.safetyStock || 0)) categoryAgg[category].risk += 1;
	}

	const categoryRows = Object.entries(categoryAgg).sort((a, b) => b[1].value - a[1].value);
	byId("categoryHealth").innerHTML = categoryRows.length
		? categoryRows
			.map(([category, row]) => `
				<div class="list-item">
					<div>
						<div class="list-item-name">${esc(category)}</div>
						<div class="list-item-sub">${num(row.count)} SKU(s) | ${num(row.stock)} units | ${currency(row.value)} value</div>
					</div>
					<span class="tag ${row.risk > 0 ? "tag-yellow" : "tag-green"}">${row.risk > 0 ? `${num(row.risk)} at risk` : "Healthy"}</span>
				</div>
			`)
			.join("")
		: `<div class="empty-state">Category analytics appear here after adding products.</div>`;

	const marginSorted = [...products]
		.map((p) => ({
			...p,
			margin: Number(p.unitPrice || 0) - Number(p.unitCost || 0),
		}))
		.sort((a, b) => b.margin - a.margin)
		.slice(0, 6);

	byId("marginFocus").innerHTML = marginSorted.length
		? marginSorted
			.map((p) => `
				<div class="list-item">
					<div>
						<div class="list-item-name">${esc(p.name)}</div>
						<div class="list-item-sub">Sell ${currency(p.unitPrice)} | Cost ${currency(p.unitCost)}</div>
					</div>
					<span class="tag ${p.margin >= 0 ? "tag-green" : "tag-red"}">Margin ${currency(p.margin)}</span>
				</div>
			`)
			.join("")
		: `<div class="empty-state">Margin focus cards appear once product pricing is available.</div>`;
}

function renderSuppliers() {
	const suppliers = safeArray(S.overview?.suppliers);
	const products = safeArray(S.overview?.products);
	const purchaseOrders = safeArray(S.overview?.purchaseOrders);

	byId("suppliersTable").innerHTML = suppliers.length
		? `
			<thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Lead Time</th><th>Active SKU</th><th>Pending PO</th></tr></thead>
			<tbody>
				${suppliers
					.map((s) => {
						const skuCount = products.filter((p) => p.supplierId === s.id).length;
						const pending = purchaseOrders.filter((po) => po.supplierId === s.id && po.status === "pending").length;
						return `
							<tr>
								<td class="bold">${esc(s.name)}</td>
								<td>${esc(s.email || "-")}</td>
								<td>${esc(s.phone || "-")}</td>
								<td>${num(s.leadTimeDays)} day(s)</td>
								<td>${num(skuCount)}</td>
								<td>${num(pending)}</td>
							</tr>
						`;
					})
					.join("")}
			</tbody>
		`
		: `<tbody><tr><td class="empty-state" colspan="6">No suppliers yet. Add supplier partners to build procurement workflows.</td></tr></tbody>`;

	const perfCards = suppliers.map((s) => {
		const skuCount = products.filter((p) => p.supplierId === s.id).length;
		const pending = purchaseOrders.filter((po) => po.supplierId === s.id && po.status === "pending");
		const pendingValue = pending.reduce((sum, po) => sum + Number(po.total || 0), 0);
		const avgLead = Number(s.leadTimeDays || 0);

		let health = "Balanced";
		if (avgLead > 14) health = "Long Lead Risk";
		else if (pending.length > 3) health = "Inbound Congestion";
		else if (skuCount === 0) health = "Unlinked Supplier";

		return `
			<div class="insight-card">
				<h4>${esc(s.name)}</h4>
				<p>Lead time ${num(avgLead)} day(s). ${num(skuCount)} linked SKU(s). Pending exposure ${currency(pendingValue)}. Status: ${esc(health)}.</p>
			</div>
		`;
	});

	byId("supplierPerformance").innerHTML = perfCards.length
		? perfCards.join("")
		: `<div class="empty-state">Supplier intelligence cards will populate after you add suppliers and map products.</div>`;
}

function renderSales() {
	const sales = safeArray(S.overview?.sales).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
	const products = safeArray(S.overview?.products);
	const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

	byId("salesTable").innerHTML = sales.length
		? `
			<thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Date</th></tr></thead>
			<tbody>
				${sales
					.map((sale) => {
						const product = productMap[sale.productId];
						const total = Number(sale.quantity || 0) * Number(sale.unitPrice || 0);
						return `
							<tr>
								<td class="bold">${esc(product?.name || sale.productId)}</td>
								<td><span class="tag tag-gray">${esc(product?.sku || "-")}</span></td>
								<td>${num(sale.quantity)}</td>
								<td>${currency(sale.unitPrice)}</td>
								<td class="bold">${currency(total)}</td>
								<td>${dateTime(sale.createdAt)}</td>
							</tr>
						`;
					})
					.join("")}
			</tbody>
		`
		: `<tbody><tr><td class="empty-state" colspan="6">No sales records yet. Capture sales to activate demand momentum and revenue analytics.</td></tr></tbody>`;

	const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
	const recentSales = sales.filter((s) => Number(s.createdAt || 0) >= sevenDaysAgo);
	const recentUnits = recentSales.reduce((sum, s) => sum + Number(s.quantity || 0), 0);
	const recentRevenue = recentSales.reduce((sum, s) => sum + Number(s.quantity || 0) * Number(s.unitPrice || 0), 0);

	byId("demandMomentum").textContent = recentSales.length
		? `Over the last 7 days, ${num(recentUnits)} units were sold for ${currency(recentRevenue)} in revenue. This provides a solid base signal for short-term demand forecasting and procurement pacing.`
		: "Recent demand momentum is still forming. Record daily sales to establish stronger forecast confidence and restock timing.";

	const revenueMix = topProductsByRevenue().slice(0, 6);
	byId("revenueDistribution").innerHTML = revenueMix.length
		? revenueMix
			.map((row, index) => `
				<div class="list-item">
					<div>
						<div class="list-item-name">#${index + 1} ${esc(row.name)}</div>
						<div class="list-item-sub">${num(row.qty)} units sold</div>
					</div>
					<span class="tag tag-blue">${currency(row.revenue)}</span>
				</div>
			`)
			.join("")
		: `<div class="empty-state">Revenue distribution appears after sales are captured.</div>`;
}

function renderPOs() {
	const orders = safeArray(S.overview?.purchaseOrders).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
	const products = safeArray(S.overview?.products);
	const suppliers = safeArray(S.overview?.suppliers);
	const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
	const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));

	byId("poTable").innerHTML = orders.length
		? `
			<thead><tr><th>Supplier</th><th>Items</th><th>Total</th><th>Source</th><th>Status</th><th>Date</th><th>Action</th></tr></thead>
			<tbody>
				${orders
					.map((po) => `
						<tr>
							<td class="bold">${esc(supplierMap[po.supplierId] || po.supplierId)}</td>
							<td>${safeArray(po.items)
								.map((i) => `${esc(productMap[i.productId]?.name || i.productId)} x${num(i.quantity)}`)
								.join(", ")}</td>
							<td class="bold">${currency(po.total)}</td>
							<td><span class="tag ${po.source === "auto_restock" ? "tag-blue" : "tag-gray"}">${po.source === "auto_restock" ? "Auto" : "Manual"}</span></td>
							<td><span class="tag ${po.status === "received" ? "tag-green" : "tag-yellow"}">${esc(po.status)}</span></td>
							<td>${dateTime(po.createdAt)}</td>
							<td>${po.status === "pending" ? `<button class="btn-sm btn-success" onclick="receivePO('${esc(po.id)}')">Receive</button>` : "-"}</td>
						</tr>
					`)
					.join("")}
			</tbody>
		`
		: `<tbody><tr><td class="empty-state" colspan="7">No purchase orders yet. Create one manually or let auto-restock trigger based on demand and safety stock.</td></tr></tbody>`;

	const total = orders.length;
	const pending = orders.filter((o) => o.status === "pending");
	const received = orders.filter((o) => o.status === "received");
	const autoOrders = orders.filter((o) => o.source === "auto_restock");

	byId("pipelineHealth").innerHTML = `
		<div class="insight-card"><h4>Total Orders</h4><p>${num(total)} purchase order(s) in history.</p></div>
		<div class="insight-card"><h4>Pending</h4><p>${num(pending.length)} order(s) awaiting receipt worth ${currency(pending.reduce((s, o) => s + Number(o.total || 0), 0))}.</p></div>
		<div class="insight-card"><h4>Received</h4><p>${num(received.length)} order(s) completed and booked into stock.</p></div>
		<div class="insight-card"><h4>Auto-Restock Share</h4><p>${total > 0 ? `${((autoOrders.length / total) * 100).toFixed(1)}%` : "0.0%"} of purchase orders were generated by policy automation.</p></div>
	`;
}

function renderForecast() {
	const forecast = safeArray(S.forecast);

	byId("forecastTable").innerHTML = forecast.length
		? `
			<thead>
				<tr><th>Product</th><th>SKU</th><th>Stock</th><th>Avg Daily Demand</th><th>Reorder Point</th><th>Days to Stockout</th><th>Suggested PO Qty</th><th>Status</th></tr>
			</thead>
			<tbody>
				${forecast
					.map((f) => `
						<tr>
							<td class="bold">${esc(f.name)}</td>
							<td><span class="tag tag-gray">${esc(f.sku)}</span></td>
							<td>${num(f.currentStock)}</td>
							<td>${Number(f.averageDailyDemand || 0).toFixed(2)}</td>
							<td>${num(f.reorderPoint)}</td>
							<td>${f.daysUntilStockout == null ? "-" : Number(f.daysUntilStockout).toFixed(1)}</td>
							<td>${num(f.suggestedOrderQty)}</td>
							<td><span class="tag ${f.needsRestock ? "tag-red" : "tag-green"}">${f.needsRestock ? "Restock Needed" : "Healthy"}</span></td>
						</tr>
					`)
					.join("")}
			</tbody>
		`
		: `<tbody><tr><td class="empty-state" colspan="8">Forecast data appears after sales and product inventory are available.</td></tr></tbody>`;

	const restockList = forecast
		.filter((f) => f.needsRestock)
		.sort((a, b) => Number(a.daysUntilStockout || 999) - Number(b.daysUntilStockout || 999));

	byId("restockRecommendations").innerHTML = restockList.length
		? restockList
			.slice(0, 8)
			.map((f) => `
				<div class="list-item">
					<div>
						<div class="list-item-name">${esc(f.name)}</div>
						<div class="list-item-sub">Reorder point ${num(f.reorderPoint)} | Avg demand ${Number(f.averageDailyDemand || 0).toFixed(2)}/day</div>
					</div>
					<span class="tag tag-red">PO ${num(f.suggestedOrderQty)}</span>
				</div>
			`)
			.join("")
		: `<div class="empty-state">No urgent restock recommendations. Demand and stock are currently balanced.</div>`;

	const risky = restockList.length;
	const avgDemand = forecast.reduce((sum, f) => sum + Number(f.averageDailyDemand || 0), 0);
	const recommendedQty = restockList.reduce((sum, f) => sum + Number(f.suggestedOrderQty || 0), 0);
	byId("forecastNarrative").textContent = forecast.length
		? `${num(risky)} SKU(s) currently require restock intervention. Combined forecasted demand velocity is ${avgDemand.toFixed(2)} units/day across tracked products. Suggested replenishment totals ${num(recommendedQty)} units to stabilize the next 14-day cycle.`
		: "Forecast narrative will appear once products and sales have enough history for trend extraction.";
}

window.receivePO = async function receivePO(poId) {
	try {
		await api.post(`/api/purchase-orders/${poId}/receive`, {});
		toast("Purchase order received and inventory updated.");
		await refresh();
	} catch (error) {
		toast(error.message, false);
	}
};

function openModal(type) {
	const overlay = byId("modalOverlay");
	const title = byId("modalTitle");
	const body = byId("modalBody");
	const products = safeArray(S.overview?.products);
	const suppliers = safeArray(S.overview?.suppliers);

	overlay.classList.remove("hidden");

	if (type === "new-business") {
		title.textContent = "Create New Business";
		body.innerHTML = `
			<div class="form-group"><label>Business Name *</label><input id="f-bname" placeholder="Example: Acme Retail" /></div>
			<div class="form-row">
				<div class="form-group"><label>Industry</label><input id="f-bindustry" placeholder="Retail, FMCG, Pharma" /></div>
				<div class="form-group"><label>Currency</label><input id="f-bcurrency" value="KES" /></div>
			</div>
			<div class="form-actions">
				<button class="btn-cancel" onclick="closeModal()">Cancel</button>
				<button class="btn btn-primary" onclick="submitBusiness()">Create Business</button>
			</div>
		`;
		return;
	}

	if (type === "add-product") {
		title.textContent = "Add Product";
		body.innerHTML = `
			<div class="form-row">
				<div class="form-group"><label>Product Name *</label><input id="f-pname" /></div>
				<div class="form-group"><label>SKU *</label><input id="f-psku" /></div>
			</div>
			<div class="form-row">
				<div class="form-group"><label>Category</label><input id="f-pcat" placeholder="Example: Beverages" /></div>
				<div class="form-group"><label>Supplier</label>
					<select id="f-psupp"><option value="">None</option>${suppliers.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select>
				</div>
			</div>
			<div class="form-row">
				<div class="form-group"><label>Unit Cost</label><input id="f-pcost" type="number" step="0.01" value="0" /></div>
				<div class="form-group"><label>Unit Price</label><input id="f-pprice" type="number" step="0.01" value="0" /></div>
			</div>
			<div class="form-row">
				<div class="form-group"><label>Opening Stock</label><input id="f-pstock" type="number" value="0" /></div>
				<div class="form-group"><label>Safety Stock</label><input id="f-psafety" type="number" value="10" /></div>
			</div>
			<div class="form-row">
				<div class="form-group"><label>Reorder Qty</label><input id="f-preorder" type="number" value="30" /></div>
				<div class="form-group"><label>Lead Time Days</label><input id="f-plead" type="number" value="7" /></div>
			</div>
			<div class="form-group"><label><input id="f-pauto" type="checkbox" /> Enable auto reorder policy</label></div>
			<div class="form-actions">
				<button class="btn-cancel" onclick="closeModal()">Cancel</button>
				<button class="btn btn-primary" onclick="submitProduct()">Save Product</button>
			</div>
		`;
		return;
	}

	if (type === "add-supplier") {
		title.textContent = "Add Supplier";
		body.innerHTML = `
			<div class="form-group"><label>Supplier Name *</label><input id="f-sname" /></div>
			<div class="form-row">
				<div class="form-group"><label>Email</label><input id="f-semail" type="email" /></div>
				<div class="form-group"><label>Phone</label><input id="f-sphone" /></div>
			</div>
			<div class="form-group"><label>Lead Time Days</label><input id="f-slead" type="number" value="7" /></div>
			<div class="form-actions">
				<button class="btn-cancel" onclick="closeModal()">Cancel</button>
				<button class="btn btn-primary" onclick="submitSupplier()">Save Supplier</button>
			</div>
		`;
		return;
	}

	if (type === "record-sale") {
		title.textContent = "Record Sale";
		body.innerHTML = `
			<div class="form-group">
				<label>Product *</label>
				<select id="f-salep">${products
					.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.sku)}) | Stock ${num(p.stockOnHand)}</option>`)
					.join("")}</select>
			</div>
			<div class="form-row">
				<div class="form-group"><label>Quantity *</label><input id="f-saleq" type="number" min="1" value="1" /></div>
				<div class="form-group"><label>Unit Price (optional)</label><input id="f-saleu" type="number" step="0.01" /></div>
			</div>
			<div class="form-actions">
				<button class="btn-cancel" onclick="closeModal()">Cancel</button>
				<button class="btn btn-primary" onclick="submitSale()">Post Sale</button>
			</div>
		`;
		return;
	}

	if (type === "create-po") {
		title.textContent = "Create Purchase Order";
		body.innerHTML = `
			<div class="form-group">
				<label>Supplier *</label>
				<select id="f-posupp">${suppliers.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select>
			</div>
			<div class="form-group">
				<label>Order Items</label>
				<div id="poItems" class="po-items-wrap">
					<div class="po-item-row">
						<select class="poi-prod">${products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select>
						<input class="poi-qty" type="number" min="1" value="10" />
						<input class="poi-cost" type="number" min="0" step="0.01" placeholder="Unit cost" />
					</div>
				</div>
				<button class="btn-add-item" onclick="addPoItemRow()">+ Add Item</button>
			</div>
			<div class="form-actions">
				<button class="btn-cancel" onclick="closeModal()">Cancel</button>
				<button class="btn btn-primary" onclick="submitPO()">Create Purchase Order</button>
			</div>
		`;
	}
}

window.closeModal = function closeModal(event) {
	if (event && event.target !== byId("modalOverlay")) return;
	byId("modalOverlay").classList.add("hidden");
};

window.addPoItemRow = function addPoItemRow() {
	const products = safeArray(S.overview?.products);
	const row = document.createElement("div");
	row.className = "po-item-row";
	row.innerHTML = `
		<select class="poi-prod">${products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select>
		<input class="poi-qty" type="number" min="1" value="10" />
		<input class="poi-cost" type="number" min="0" step="0.01" placeholder="Unit cost" />
	`;
	byId("poItems").appendChild(row);
};

window.submitBusiness = async function submitBusiness() {
	const name = byId("f-bname")?.value?.trim();
	if (!name) {
		toast("Business name is required", false);
		return;
	}

	try {
		const newBusiness = await api.post("/api/businesses", {
			name,
			industry: byId("f-bindustry")?.value || "",
			currency: byId("f-bcurrency")?.value || "USD",
		});
		S.businesses.push(newBusiness);
		S.businessId = newBusiness.id;
		renderBizSelect();
		closeModal();
		toast("Business created successfully");
		await refresh();
	} catch (error) {
		toast(error.message, false);
	}
};

window.submitProduct = async function submitProduct() {
	if (!S.businessId) return toast("Select a business first", false);
	const name = byId("f-pname")?.value?.trim();
	const sku = byId("f-psku")?.value?.trim();
	if (!name || !sku) return toast("Product name and SKU are required", false);

	try {
		await api.post("/api/products", {
			businessId: S.businessId,
			name,
			sku,
			category: byId("f-pcat")?.value || "",
			supplierId: byId("f-psupp")?.value || null,
			unitCost: byId("f-pcost")?.value || 0,
			unitPrice: byId("f-pprice")?.value || 0,
			stockOnHand: byId("f-pstock")?.value || 0,
			safetyStock: byId("f-psafety")?.value || 0,
			reorderQty: byId("f-preorder")?.value || 0,
			leadTimeDays: byId("f-plead")?.value || 7,
			autoReorder: !!byId("f-pauto")?.checked,
		});
		closeModal();
		toast("Product added");
		await refresh();
		showView("products");
	} catch (error) {
		toast(error.message, false);
	}
};

window.submitSupplier = async function submitSupplier() {
	if (!S.businessId) return toast("Select a business first", false);
	const name = byId("f-sname")?.value?.trim();
	if (!name) return toast("Supplier name is required", false);

	try {
		await api.post("/api/suppliers", {
			businessId: S.businessId,
			name,
			email: byId("f-semail")?.value || "",
			phone: byId("f-sphone")?.value || "",
			leadTimeDays: byId("f-slead")?.value || 7,
		});
		closeModal();
		toast("Supplier added");
		await refresh();
		showView("suppliers");
	} catch (error) {
		toast(error.message, false);
	}
};

window.submitSale = async function submitSale() {
	if (!S.businessId) return toast("Select a business first", false);

	try {
		await api.post("/api/sales", {
			businessId: S.businessId,
			productId: byId("f-salep")?.value,
			quantity: Number(byId("f-saleq")?.value || 0),
			unitPrice: byId("f-saleu")?.value || undefined,
		});
		closeModal();
		toast("Sale recorded");
		await refresh();
		showView("sales");
	} catch (error) {
		toast(error.message, false);
	}
};

window.submitPO = async function submitPO() {
	if (!S.businessId) return toast("Select a business first", false);

	const items = Array.from(document.querySelectorAll(".po-item-row"))
		.map((row) => ({
			productId: row.querySelector(".poi-prod")?.value,
			quantity: Number(row.querySelector(".poi-qty")?.value || 0),
			unitCost: Number(row.querySelector(".poi-cost")?.value || 0) || undefined,
		}))
		.filter((item) => item.productId && item.quantity > 0);

	if (!items.length) return toast("At least one valid item is required", false);

	try {
		await api.post("/api/purchase-orders", {
			businessId: S.businessId,
			supplierId: byId("f-posupp")?.value,
			items,
			source: "manual",
		});
		closeModal();
		toast("Purchase order created");
		await refresh();
		showView("orders");
	} catch (error) {
		toast(error.message, false);
	}
};

byId("newBizBtn").addEventListener("click", () => openModal("new-business"));
byId("refreshBtn").addEventListener("click", refresh);
byId("addProductBtn").addEventListener("click", () => {
	if (!S.businessId) return toast("Create or select a business first", false);
	openModal("add-product");
});
byId("addSupplierBtn").addEventListener("click", () => {
	if (!S.businessId) return toast("Create or select a business first", false);
	openModal("add-supplier");
});
byId("recordSaleBtn").addEventListener("click", () => {
	if (!S.businessId) return toast("Create or select a business first", false);
	openModal("record-sale");
});
byId("createPoBtn").addEventListener("click", () => {
	if (!S.businessId) return toast("Create or select a business first", false);
	openModal("create-po");
});

(async function init() {
	try {
		S.businesses = safeArray(await api.get("/api/businesses"));
		if (S.businesses.length > 0) {
			S.businessId = S.businesses[0].id;
			renderBizSelect();
			await refresh();
		} else {
			renderBizSelect();
			updateSidebarPulse();
			byId("executiveBrief").textContent = "Create your first business profile to activate the complete operating dashboard.";
			byId("dashboardInsights").innerHTML = `<div class="empty-state">No business context found. Use New Business to get started.</div>`;
		}
	} catch (error) {
		toast("Could not connect to the SupplyPulse server", false);
	}
})();
