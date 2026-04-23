const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

let writeChain = Promise.resolve();

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(
      DB_PATH,
      JSON.stringify(
        {
          businesses: [],
          products: [],
          suppliers: [],
          sales: [],
          inventoryMovements: [],
          purchaseOrders: [],
        },
        null,
        2
      )
    );
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw);
}

function writeDb(data) {
  ensureDb();
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

async function updateDb(mutator) {
  writeChain = writeChain.then(async () => {
    const snapshot = readDb();
    const draft = JSON.parse(JSON.stringify(snapshot));
    const result = await mutator(draft);
    writeDb(draft);
    return result;
  });

  return writeChain;
}

module.exports = {
  readDb,
  updateDb,
};
