// Alag worker process: `npm run worker` (tab server mein RUN_WORKER=false rakhein).
require("dotenv").config();
const mongoose = require("mongoose");
const config = require("./src/config/env");
const connectDB = require("./src/config/db");
const { seed } = require("./src/utils/seed");
const { fromConfig } = require("./src/utils/whatsapp");
const worker = require("./src/jobs/worker");

async function main() {
  const cfg = config.load();
  await connectDB(cfg.mongoUri);
  await connectDB.initIndexes();
  await seed();
  const stop = worker.start({ wa: fromConfig(cfg), publicBaseUrl: cfg.publicBaseUrl });
  const shutdown = async () => {
    await stop();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("Worker start nahi hua:", e.message);
  process.exit(1);
});
