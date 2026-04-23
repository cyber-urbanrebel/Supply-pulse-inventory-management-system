const cron = require("node-cron");
const { readDb } = require("../store");
const { autoCreateRestockOrders } = require("../services/inventoryService");

function startRestockJob() {
  // Every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      const db = readDb();
      for (const business of db.businesses) {
        const created = await autoCreateRestockOrders(business.id);
        if (created.length) {
          console.log(`[restock-job] Created ${created.length} auto PO(s) for ${business.name}`);
        }
      }
    } catch (err) {
      console.error("[restock-job] Failed:", err.message);
    }
  });
}

module.exports = { startRestockJob };
