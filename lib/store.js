const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BUSINESSES_FILE = path.join(DATA_DIR, 'businesses.json');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertValidId(id) {
  if (!UUID_RE.test(id)) throw new Error('Invalid business ID');
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function listBusinesses() {
  ensureDataDir();
  if (!fs.existsSync(BUSINESSES_FILE)) {
    fs.writeFileSync(BUSINESSES_FILE, JSON.stringify([], null, 2));
    return [];
  }
  return JSON.parse(fs.readFileSync(BUSINESSES_FILE, 'utf8'));
}

function getBusiness(id) {
  ensureDataDir();
  assertValidId(id);
  const file = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function createBusiness(name) {
  ensureDataDir();
  const id = uuidv4();
  const business = { id, name, products: [], sales: [] };
  fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(business, null, 2));
  const businesses = listBusinesses();
  businesses.push({ id, name });
  fs.writeFileSync(BUSINESSES_FILE, JSON.stringify(businesses, null, 2));
  return business;
}

function deleteBusiness(id) {
  ensureDataDir();
  assertValidId(id);
  const businesses = listBusinesses().filter(b => b.id !== id);
  fs.writeFileSync(BUSINESSES_FILE, JSON.stringify(businesses, null, 2));
  const file = path.join(DATA_DIR, `${id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function saveBusiness(businessObj) {
  ensureDataDir();
  assertValidId(businessObj.id);
  fs.writeFileSync(
    path.join(DATA_DIR, `${businessObj.id}.json`),
    JSON.stringify(businessObj, null, 2)
  );
}

module.exports = { listBusinesses, getBusiness, createBusiness, deleteBusiness, saveBusiness };
