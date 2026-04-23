const { updateDb, readDb } = require("../store");
const { makeId } = require("../utils/id");
const { forecastForProducts } = require("./forecastService");

function ensureBusiness(db, businessId) {
  const b = db.businesses.find((x) => x.id === businessId);
  if (!b) {
    throw new Error("Business not found");
  }
}

async function createBusiness(payload) {
  if (!payload?.name) throw new Error("Business name is required");

  return updateDb((db) => {
    const business = {
      id: makeId("biz"),
      name: payload.name,
      industry: payload.industry || "general",
      currency: payload.currency || "USD",
      createdAt: Date.now(),
    };
    db.businesses.push(business);
    return business;
  });
}

async function createSupplier(payload) {
  if (!payload?.businessId || !payload?.name) {
    throw new Error("businessId and supplier name are required");
  }

  return updateDb((db) => {
    ensureBusiness(db, payload.businessId);

    const supplier = {
      id: makeId("sup"),
      businessId: payload.businessId,
      name: payload.name,
      email: payload.email || "",
      phone: payload.phone || "",
      leadTimeDays: Number(payload.leadTimeDays || 7),
      createdAt: Date.now(),
    };

    db.suppliers.push(supplier);
    return supplier;
  });
}

async function createProduct(payload) {
  if (!payload?.businessId || !payload?.name || !payload?.sku) {
    throw new Error("businessId, name and sku are required");
  }

  return updateDb((db) => {
    ensureBusiness(db, payload.businessId);

    const skuExists = db.products.some(
      (p) => p.businessId === payload.businessId && p.sku.toLowerCase() === payload.sku.toLowerCase()
    );
    if (skuExists) throw new Error("SKU already exists for this business");

    const product = {
      id: makeId("prd"),
      businessId: payload.businessId,
      name: payload.name,
      sku: payload.sku,
      category: payload.category || "general",
      unitCost: Number(payload.unitCost || 0),
      unitPrice: Number(payload.unitPrice || 0),
      stockOnHand: Number(payload.stockOnHand || 0),
      safetyStock: Number(payload.safetyStock || 0),
      reorderQty: Number(payload.reorderQty || 0),
      leadTimeDays: Number(payload.leadTimeDays || 7),
      supplierId: payload.supplierId || null,
      autoReorder: Boolean(payload.autoReorder),
      createdAt: Date.now(),
    };

    db.products.push(product);

    db.inventoryMovements.push({
      id: makeId("mov"),
      businessId: payload.businessId,
      productId: product.id,
      type: "initial_stock",
      quantity: product.stockOnHand,
      reference: "product_create",
      createdAt: Date.now(),
    });

    return product;
  });
}

async function recordSale(payload) {
  if (!payload?.businessId || !payload?.productId || !payload?.quantity) {
    throw new Error("businessId, productId and quantity are required");
  }

  const qty = Number(payload.quantity);
  if (qty <= 0) throw new Error("quantity must be greater than 0");

  return updateDb((db) => {
    ensureBusiness(db, payload.businessId);

    const product = db.products.find(
      (p) => p.id === payload.productId && p.businessId === payload.businessId
    );
    if (!product) throw new Error("Product not found");
    if (product.stockOnHand < qty) throw new Error("Insufficient stock");

    product.stockOnHand -= qty;

    const sale = {
      id: makeId("sale"),
      businessId: payload.businessId,
      productId: payload.productId,
      quantity: qty,
      unitPrice: Number(payload.unitPrice || product.unitPrice || 0),
      createdAt: Date.now(),
    };

    db.sales.push(sale);
    db.inventoryMovements.push({
      id: makeId("mov"),
      businessId: payload.businessId,
      productId: payload.productId,
      type: "sale",
      quantity: -qty,
      reference: sale.id,
      createdAt: Date.now(),
    });

    return sale;
  });
}

async function createPurchaseOrder(payload) {
  if (!payload?.businessId || !payload?.supplierId || !Array.isArray(payload?.items) || !payload.items.length) {
    throw new Error("businessId, supplierId and items[] are required");
  }

  return updateDb((db) => {
    ensureBusiness(db, payload.businessId);

    const supplier = db.suppliers.find(
      (s) => s.id === payload.supplierId && s.businessId === payload.businessId
    );
    if (!supplier) throw new Error("Supplier not found");

    const items = payload.items.map((item) => {
      const product = db.products.find(
        (p) => p.id === item.productId && p.businessId === payload.businessId
      );
      if (!product) throw new Error(`Product ${item.productId} not found`);

      const quantity = Number(item.quantity);
      if (quantity <= 0) throw new Error("PO item quantity must be > 0");

      const unitCost = Number(item.unitCost ?? product.unitCost ?? 0);
      return {
        productId: product.id,
        quantity,
        unitCost,
        lineTotal: quantity * unitCost,
      };
    });

    const po = {
      id: makeId("po"),
      businessId: payload.businessId,
      supplierId: payload.supplierId,
      status: "pending",
      source: payload.source || "manual",
      items,
      total: items.reduce((sum, i) => sum + i.lineTotal, 0),
      createdAt: Date.now(),
      receivedAt: null,
    };

    db.purchaseOrders.push(po);
    return po;
  });
}

async function receivePurchaseOrder(poId) {
  if (!poId) throw new Error("poId is required");

  return updateDb((db) => {
    const po = db.purchaseOrders.find((x) => x.id === poId);
    if (!po) throw new Error("Purchase order not found");
    if (po.status === "received") throw new Error("Purchase order already received");

    for (const item of po.items) {
      const product = db.products.find((p) => p.id === item.productId && p.businessId === po.businessId);
      if (!product) throw new Error(`Product ${item.productId} missing while receiving PO`);
      product.stockOnHand += item.quantity;

      db.inventoryMovements.push({
        id: makeId("mov"),
        businessId: po.businessId,
        productId: item.productId,
        type: "purchase_receive",
        quantity: item.quantity,
        reference: po.id,
        createdAt: Date.now(),
      });
    }

    po.status = "received";
    po.receivedAt = Date.now();

    return po;
  });
}

function listBusinessData(businessId) {
  const db = readDb();
  ensureBusiness(db, businessId);

  return {
    products: db.products.filter((p) => p.businessId === businessId),
    suppliers: db.suppliers.filter((s) => s.businessId === businessId),
    sales: db.sales.filter((s) => s.businessId === businessId),
    purchaseOrders: db.purchaseOrders.filter((p) => p.businessId === businessId),
    inventoryMovements: db.inventoryMovements.filter((m) => m.businessId === businessId),
  };
}

function getDashboard(businessId) {
  const { products, sales, purchaseOrders } = listBusinessData(businessId);

  const inventoryValue = products.reduce((sum, p) => sum + p.stockOnHand * (p.unitCost || 0), 0);
  const lowStockCount = products.filter((p) => p.stockOnHand <= p.safetyStock).length;

  const revenue = sales.reduce((sum, s) => sum + s.quantity * s.unitPrice, 0);
  const costOfGoodsSold = sales.reduce((sum, s) => {
    const product = products.find((p) => p.id === s.productId);
    return sum + s.quantity * (product?.unitCost || 0);
  }, 0);

  const poPending = purchaseOrders.filter((po) => po.status === "pending").length;

  return {
    kpis: {
      totalProducts: products.length,
      inventoryValue: Number(inventoryValue.toFixed(2)),
      lowStockCount,
      totalRevenue: Number(revenue.toFixed(2)),
      grossMargin: Number((revenue - costOfGoodsSold).toFixed(2)),
      pendingPurchaseOrders: poPending,
    },
  };
}

function getForecast(businessId) {
  const { products, sales } = listBusinessData(businessId);
  return forecastForProducts(products, sales);
}

async function autoCreateRestockOrders(businessId) {
  const db = readDb();
  const business = db.businesses.find((b) => b.id === businessId);
  if (!business) throw new Error("Business not found");

  const forecast = getForecast(businessId);
  const productsById = new Map(db.products.filter((p) => p.businessId === businessId).map((p) => [p.id, p]));

  const groupedBySupplier = new Map();

  for (const f of forecast) {
    if (!f.needsRestock || f.suggestedOrderQty <= 0) continue;

    const p = productsById.get(f.productId);
    if (!p || !p.autoReorder || !p.supplierId) continue;

    if (!groupedBySupplier.has(p.supplierId)) groupedBySupplier.set(p.supplierId, []);
    groupedBySupplier.get(p.supplierId).push({
      productId: p.id,
      quantity: p.reorderQty > 0 ? p.reorderQty : f.suggestedOrderQty,
      unitCost: p.unitCost,
    });
  }

  const created = [];
  for (const [supplierId, items] of groupedBySupplier.entries()) {
    if (!items.length) continue;

    const po = await createPurchaseOrder({
      businessId,
      supplierId,
      items,
      source: "auto_restock",
    });
    created.push(po);
  }

  return created;
}

module.exports = {
  createBusiness,
  createSupplier,
  createProduct,
  recordSale,
  createPurchaseOrder,
  receivePurchaseOrder,
  listBusinessData,
  getDashboard,
  getForecast,
  autoCreateRestockOrders,
};
