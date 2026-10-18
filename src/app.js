const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

const config = require("./config/env");
const i18n = require("./utils/i18n");
const { fromConfig } = require("./utils/whatsapp");
const { razorpay } = require("./utils/razorpay");
const { toApiError, sendError } = require("./utils/http.helpers");
const { language, requireAuth, requireShop, requireAdmin } = require("./middleware");

const authRoutes = require("./routes/auth.routes");
const shopRoutes = require("./routes/shops.routes");
const serviceRoutes = require("./routes/services.routes");
const customerRoutes = require("./routes/customers.routes");
const orderRoutes = require("./routes/orders.routes");
const paymentRoutes = require("./routes/payments.routes");
const expenseRoutes = require("./routes/expenses.routes");
const workerRoutes = require("./routes/workers.routes");
const fabricRoutes = require("./routes/fabrics.routes");
const mediaRoutes = require("./routes/media.routes");
const festivalRoutes = require("./routes/festivals.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const messageRoutes = require("./routes/messages.routes");
const notificationRoutes = require("./routes/notifications.routes");
const billingRoutes = require("./routes/billing.routes");
const syncRoutes = require("./routes/sync.routes");
const adminRoutes = require("./routes/admin.routes");
const publicRoutes = require("./routes/public.routes");
const webhookRoutes = require("./routes/webhooks.routes");

// Settings (.env) — galat ho to server start hi nahi hota (saaf message ke saath)
const cfg = config.load();

const app = express();
app.locals.cfg = cfg;
app.locals.wa = fromConfig(cfg); // WhatsApp sender
app.locals.pay = cfg.paymentProvider === "razorpay" // Razorpay (null = online payment band)
  ? razorpay({ keyId: cfg.razorpayKeyId, keySecret: cfg.razorpayKeySecret, webhookSecret: cfg.razorpayWebhookSecret, baseUrl: cfg.razorpayBaseUrl })
  : null;
app.disable("x-powered-by");
app.set("trust proxy", true);

app.use(cors({
  origin: (origin, cb) => cb(null, !origin || cfg.corsOrigins.includes("*") || cfg.corsOrigins.includes(origin)),
  allowedHeaders: ["Authorization", "Content-Type", "X-Language", "Accept-Language", "X-Shop-Id"],
  exposedHeaders: ["Content-Language"],
}));

// IMPORTANT — rawBody: webhooks ka signature check isi par hota hai
app.use(express.json({ limit: "2mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLog);
app.use(language); // har request ki bhasha: ?lang / X-Language / user ki / phone ki / Hindi

// Root URL — browser mein kholne par "not found" na dikhe
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "U Like Tailor API is running",
    data: { health: "/api/health", docs: "/api-docs", api: "/api" },
  });
});

app.get("/api/health", (_req, res) => {
  const up = mongoose.connection.readyState === 1;
  res.status(up ? 200 : 503).json({
    success: up,
    message: up ? "Backend is running" : "Database not connected",
    timestamp: new Date().toISOString(),
  });
});

// ---------- Bina login ----------
app.use("/api/public", publicRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/auth", authRoutes); // /otp/* aur /refresh bina login, baaki route par login

// ---------- Login ----------
app.use("/api/shops", shopRoutes); // dukaan banana / list (dukaan ke andar wale X-Shop-Id ke saath)
app.use("/api/admin", requireAuth, requireAdmin, adminRoutes);

// ---------- Login + dukaan (header "X-Shop-Id") ----------
const inShop = [requireAuth, requireShop];
app.use("/api/services", inShop, serviceRoutes);
app.use("/api/customers", inShop, customerRoutes);
app.use("/api/orders", inShop, orderRoutes);
app.use("/api/payments", inShop, paymentRoutes);
app.use("/api/expenses", inShop, expenseRoutes);
app.use("/api/workers", inShop, workerRoutes);
app.use("/api/fabrics", inShop, fabricRoutes);
app.use("/api/media", inShop, mediaRoutes);
app.use("/api/festivals", inShop, festivalRoutes);
app.use("/api/dashboard", inShop, dashboardRoutes);
app.use("/api/messages", inShop, messageRoutes);
app.use("/api/notifications", inShop, notificationRoutes);
app.use("/api/billing", inShop, billingRoutes);
app.use("/api/sync", inShop, syncRoutes);

if (!cfg.isProd) app.use("/api/testing", require("./routes/testing.routes")); // Cloudinary check (sirf dev)

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use((req, res) => sendError(res, 404, { code: "not_found", key: "not_found", message: i18n.t(req.lang, "not_found") }));
app.use(errorHandler);

// Har error sahi HTTP status ke saath, user ki bhasha mein:
//   {"success":false,"message":"ऑर्डर नहीं मिला","error":{"code":"not_found","key":"order_not_found","message":"..."}}
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let e = toApiError(err);
  if (!e) {
    console.error(JSON.stringify({ level: "ERROR", msg: "internal error", err: err && (err.stack || err.message), path: req.path, method: req.method }));
    e = { status: 500, code: "internal", key: "internal", args: [] };
  }
  const lang = req.lang || i18n.DEFAULT;
  const args = (e.args || []).map((a) => (a && a.key && a.constructor && a.constructor.name === "MsgKey" ? i18n.t(lang, a.key) : a));
  sendError(res, e.status, { code: e.code, key: e.key, message: i18n.t(lang, e.key, ...args) });
}

function requestLog(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path === "/api/health") return;
    console.log(JSON.stringify({ level: "INFO", msg: "http", method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }));
  });
  next();
}

module.exports = app;