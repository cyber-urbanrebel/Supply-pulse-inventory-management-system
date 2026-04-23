const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const {
  createBusiness,
  createSupplier,
  createProduct,
  recordSale,
  createPurchaseOrder,
  receivePurchaseOrder,
  listBusinessData,
  getDashboard,
  getForecast,
} = require("./services/inventoryService");
const { startRestockJob } = require("./jobs/restockJob");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const PORT = Number(process.env.PORT || 4100);

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "SupplyPulse", timestamp: Date.now() });
});

app.get("/api/businesses", (req, res) => {
  try {
    const { readDb } = require("./store");
    const db = readDb();
    res.json(db.businesses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/businesses", async (req, res) => {
  try {
    const created = await createBusiness(req.body);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/businesses/:businessId/overview", (req, res) => {
  try {
    const data = listBusinessData(req.params.businessId);
    const dashboard = getDashboard(req.params.businessId);
    res.json({ ...data, ...dashboard });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/suppliers", async (req, res) => {
  try {
    const created = await createSupplier(req.body);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/products", async (req, res) => {
  try {
    const created = await createProduct(req.body);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/sales", async (req, res) => {
  try {
    const created = await recordSale(req.body);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/purchase-orders", async (req, res) => {
  try {
    const created = await createPurchaseOrder(req.body);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/purchase-orders/:poId/receive", async (req, res) => {
  try {
    const updated = await receivePurchaseOrder(req.params.poId);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/businesses/:businessId/forecast", (req, res) => {
  try {
    const forecast = getForecast(req.params.businessId);
    res.json(forecast);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  startRestockJob();
  console.log(`SupplyPulse running at http://localhost:${PORT}`);
});
