// Server start: `npm start` (ya `npm run dev`). RUN_WORKER=true ho to WhatsApp/reminder worker bhi isi mein.
require("dotenv").config();
const mongoose = require("mongoose");
const app = require("./src/app");
const connectDB = require("./src/config/db");
const { seed } = require("./src/utils/seed");
const worker = require("./src/jobs/worker");

async function main() {
  const cfg = app.locals.cfg;
  await connectDB(cfg.mongoUri);
  await connectDB.initIndexes(); // indexes (unique wale bhi) taiyaar — badle hue index apne aap theek
  await seed(); // plans, kapde (services), WhatsApp templates — pehle se ho to kuch nahi badalta

  const PORT = cfg.port;
  const server = app.listen(PORT, () =>
    console.log(`Server running on port ${PORT} (env: ${cfg.env}, payments: ${cfg.paymentProvider}, whatsapp: ${app.locals.wa.name})`)
  );
  const stopWorker = cfg.runWorker ? worker.start({ wa: app.locals.wa, publicBaseUrl: cfg.publicBaseUrl }) : null;

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    server.close();
    if (stopWorker) await stopWorker();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("Server start nahi hua:", e.message);
  process.exit(1);
});
