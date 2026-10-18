# U Like Tailor Backend

Node.js + Express + MongoDB backend for the U Like Tailor app. Hindi + English.
Folder structure aapke purane backend jaisa hi hai: `config / models / controller / routes / docs / utils`.

## Project setup

1. Node.js 20+ install karein.
2. Terminal mein project folder kholein aur packages daalein:

```bash
npm install
```

3. `.env` banayein (`.env.example` ki copy). Aapki purani `.env` bhi chalegi — usme `MONGO_URI` aur
   Cloudinary pehle se hai; testing ke liye yeh jod dein:

```
DEV_FIXED_OTP=123456          # har number ka OTP 123456 (sirf testing)
ADMIN_PHONES=apna_mobile      # /api/admin ke liye
RUN_WORKER=true               # WhatsApp reminders + plan expiry
```

4. Server chalayein:

```bash
npm run dev      # ya: npm start
```

Pehli baar chalte hi plans, kapdon ke type (services) aur WhatsApp templates apne aap ban jaate hain.

- Health: `GET http://localhost:5000/api/health`
- Swagger docs: `http://localhost:5000/api-docs`

## Folder structure

```
server.js                 Server start (DB connect, seed, worker)
worker.js                 Alag worker process (npm run worker) — chahein to
src/app.js                Express app — saare routes yahan jude hain
src/config/db.js          MongoDB connection (MONGO_URI)
src/config/env.js         .env settings (JWT, OTP, WhatsApp, Razorpay, ADMIN_PHONES...)
src/config/cloudinary.js  Cloudinary
src/config/mutler.js      Photo upload (multer + Cloudinary)
src/models/*.model.js     MongoDB models (user, shop, plan, customer, order, payment, worker, fabric, ...)
src/controller/*.js       Har API ka kaam (customer.controller.js, orders.controller.js, ...)
src/routes/*.routes.js    URL -> controller
src/middleware/           Login (JWT), dukaan (X-Shop-Id), role, plan limit, bhasha
src/utils/                i18n (Hindi/English), billing, WhatsApp, voice parser, dates, money, seed ...
src/jobs/worker.js        Background: WhatsApp bhejna, reminders, birthday, plan expiry, low stock
src/docs/*.swagger.js     Swagger docs
tests/                    Unit + poora flow (e2e) test
```

## API kaise call karein

| Cheez | Kaise |
|---|---|
| Login | `POST /api/auth/otp/send {"phone"}` → `POST /api/auth/otp/verify {"phone","otp"}` → `tokens.accessToken` |
| Har request | Header `Authorization: Bearer <accessToken>` |
| Dukaan | Header `X-Shop-Id: <shopId>` (dukaan wale saare APIs) — shopId `GET /api/auth/me` ke `shops` se |
| Bhasha | Header `X-Language: hi` ya `en` (warna user ki saved bhasha, phir Hindi) |
| Token khatam (401) | `POST /api/auth/refresh {"refreshToken"}` |
| Paisa | Hamesha **paise** mein: ₹150.50 = `15050` |
| Tareekh | `"YYYY-MM-DD"` |

Har jawab ek hi shape mein:

```json
{"success": true, "message": "सफल", "data": { ... }}
{"success": false, "message": "ऑर्डर नहीं मिला", "error": {"code": "not_found", "key": "order_not_found", "message": "ऑर्डर नहीं मिला"}}
```

`402 plan_limit` = plan ki limit (app "plan upgrade" dikhaye). Photo: `POST /api/media/upload` (form-data `image`) → `data.url`.

## Available APIs

### public

| Method | Path | Kaun |
|---|---|---|
| GET | `/api/public/languages` |  |
| GET | `/api/public/plans` |  |
| GET | `/api/public/track/:token` |  |
| GET | `/api/public/shops/:shopId/catalog` |  |

### auth

| Method | Path | Kaun |
|---|---|---|
| POST | `/api/auth/otp/send` |  |
| POST | `/api/auth/otp/verify` |  |
| POST | `/api/auth/refresh` |  |
| POST | `/api/auth/logout` |  |
| GET | `/api/auth/me` |  |
| PATCH | `/api/auth/me` |  |

### shops

| Method | Path | Kaun |
|---|---|---|
| GET | `/api/shops` |  |
| POST | `/api/shops` |  |
| GET | `/api/shops/current` |  |
| PATCH | `/api/shops/current` | owner/manager |
| GET | `/api/shops/subscription` |  |
| GET | `/api/shops/team` | owner/manager |
| POST | `/api/shops/team` | owner |
| DELETE | `/api/shops/team/:memberId` | owner |

### services

| Method | Path | Kaun |
|---|---|---|
| GET | `/api/services` |  |
| POST | `/api/services` | owner/manager |
| PATCH | `/api/services/:id` | owner/manager |
| PUT | `/api/services/:id/fields` | owner/manager |
| POST | `/api/services/voice/parse` |  |

### customers

| Method | Path | Kaun |
|---|---|---|
| GET | `/api/customers` |  |
| POST | `/api/customers` |  |
| GET | `/api/customers/lookup` |  |
| GET | `/api/customers/:id` |  |
| PATCH | `/api/customers/:id` |  |
| DELETE | `/api/customers/:id` | owner/manager |
| POST | `/api/customers/:id/members` |  |
| PATCH | `/api/customers/members/:memberId` |  |
| DELETE | `/api/customers/members/:memberId` |  |
| GET | `/api/customers/members/:memberId/measurements` |  |
| POST | `/api/customers/members/:memberId/measurements` |  |

### orders

| Method | Path | Kaun |
|---|---|---|
| POST | `/api/orders` |  |
| GET | `/api/orders` |  |
| GET | `/api/orders/:id` |  |
| PATCH | `/api/orders/:id` |  |
| POST | `/api/orders/:id/status` |  |
| POST | `/api/orders/scan/:qr` |  |
| POST | `/api/orders/:id/notify` |  |
| PATCH | `/api/orders/items/:itemId` |  |
| POST | `/api/orders/:id/payment-link` |  |
| POST | `/api/orders/items/:itemId/assign` |  |

### payments

| Method | Path | Kaun |
|---|---|---|
| POST | `/api/payments` |  |
| GET | `/api/payments` |  |
| DELETE | `/api/payments/:id` | owner/manager |
| GET | `/api/payments/dues` |  |

### expenses

| Method | Path | Kaun |
|---|---|---|
| GET | `/api/expenses` | owner/manager |
| POST | `/api/expenses` | owner/manager |
| DELETE | `/api/expenses/:id` | owner/manager |

### workers

| Method | Path | Kaun |
|---|---|---|
| GET | `/api/workers` |  |
| POST | `/api/workers` | owner/manager |
| PATCH | `/api/workers/:id` | owner/manager |
| DELETE | `/api/workers/:id` | owner/manager |
| GET | `/api/workers/earnings` | owner/manager |
| PUT | `/api/workers/:id/capacity` | owner/manager |
| PATCH | `/api/workers/assignments/:id` |  |
| GET | `/api/workers/:id/work` |  |
| POST | `/api/workers/:id/advances` | owner/manager |
| GET | `/api/workers/:id/payouts` | owner/manager |
| POST | `/api/workers/:id/payouts` | owner/manager |
| GET | `/api/workers/piece-rates` | owner/manager |
| PUT | `/api/workers/piece-rates` | owner/manager |
| GET | `/api/workers/attendance` |  |
| PUT | `/api/workers/attendance` | owner/manager |

### fabrics

| Method | Path | Kaun |
|---|---|---|
| GET | `/api/fabrics` |  |
| POST | `/api/fabrics` |  |
| PATCH | `/api/fabrics/:id` |  |
| DELETE | `/api/fabrics/:id` | owner/manager |
| GET | `/api/fabrics/:id/transactions` |  |
| POST | `/api/fabrics/:id/transactions` |  |

### media

| Method | Path | Kaun |
|---|---|---|
| GET | `/api/media/designs` |  |
| POST | `/api/media/designs` |  |
| PATCH | `/api/media/designs/:id` |  |
| DELETE | `/api/media/designs/:id` |  |
| GET | `/api/media` |  |
| POST | `/api/media` |  |
| DELETE | `/api/media/:id` |  |

### festivals

| Method | Path | Kaun |
|---|---|---|
| GET | `/api/festivals` |  |
| POST | `/api/festivals` | owner/manager |
| GET | `/api/festivals/:id/capacity` |  |

### dashboard

| Method | Path | Kaun |
|---|---|---|
| GET | `/api/dashboard` |  |
| GET | `/api/dashboard/reports/monthly` | owner/manager |

### messages

| Method | Path | Kaun |
|---|---|---|
| GET | `/api/messages/automation-rules` |  |
| PUT | `/api/messages/automation-rules/:event` | owner/manager |
| GET | `/api/messages/templates` |  |
| PUT | `/api/messages/templates/:event` | owner/manager |
| GET | `/api/messages` | owner/manager |
| POST | `/api/messages/send` |  |

### notifications

| Method | Path | Kaun |
|---|---|---|
| GET | `/api/notifications` |  |
| POST | `/api/notifications/read` |  |

### billing

| Method | Path | Kaun |
|---|---|---|
| GET | `/api/billing/preview` | owner |
| POST | `/api/billing/checkout` | owner |
| POST | `/api/billing/verify` | owner |
| GET | `/api/billing/payments` | owner/manager |

### sync

| Method | Path | Kaun |
|---|---|---|
| POST | `/api/sync/pull` |  |
| POST | `/api/sync/push` |  |

### admin

| Method | Path | Kaun |
|---|---|---|
| GET | `/api/admin/plans` |  |
| POST | `/api/admin/plans` |  |
| PATCH | `/api/admin/plans/:id` |  |
| POST | `/api/admin/shops/:shopId/subscription/grant` |  |
| GET | `/api/admin/subscription-payments` |  |
| POST | `/api/admin/festivals` |  |

### webhooks

| Method | Path | Kaun |
|---|---|---|
| GET | `/api/webhooks/whatsapp` |  |
| POST | `/api/webhooks/whatsapp` |  |
| POST | `/api/webhooks/razorpay` |  |

Request/response ke fields: Swagger (`/api-docs`) aur har controller function ke upar ki comment.

## Subscription (plan kharidna)

`GET /api/public/plans` → `GET /api/billing/preview?plan=growth` → `POST /api/billing/checkout {"planCode"}` →
app mein Razorpay checkout (`data.razorpay` seedha `razorpay.open()` mein) → `POST /api/billing/verify
{razorpayOrderId, razorpayPaymentId, razorpaySignature}`. App band ho jaye to Razorpay webhook
(`/api/webhooks/razorpay`) plan chalu kar deta hai. Sirf owner kharid sakta hai.

## Production checklist

- [ ] `APP_ENV=prod`, strong `JWT_SECRET` / `OTP_SECRET` (32+ characters), `DEV_FIXED_OTP` khaali
- [ ] `OTP_PROVIDER=whatsapp` + `WA_PROVIDER=meta_cloud` (Meta WhatsApp Cloud API)
- [ ] Razorpay Live keys + `RAZORPAY_WEBHOOK_SECRET`
- [ ] `PUBLIC_BASE_URL` = aapka domain, `CORS_ORIGINS` sirf apne domains
- [ ] MongoDB Atlas (5.0+) ka backup on

## Test

```bash
npm test     # unit tests

# Poora flow (khaali database par server chala kar):
MONGO_URI=mongodb://127.0.0.1:27017/tailor_e2e PORT=8080 DEV_FIXED_OTP=123456 RUN_WORKER=true ADMIN_PHONES=9876543210 \
RAZORPAY_KEY_ID=rzp_test_e2e RAZORPAY_KEY_SECRET=e2e_key_secret RAZORPAY_WEBHOOK_SECRET=e2e_wh_secret \
RAZORPAY_BASE_URL=http://127.0.0.1:8099 npm start
# doosre terminal mein:
MONGO_URI=mongodb://127.0.0.1:27017/tailor_e2e API_URL=http://localhost:8080/api npm run e2e
#   u L i k e T a i l o r B a c k e n d  
 #   u L i k e T a i l o r B a c k e n d  
 #   u _ l i k e _ t a i l o r _ a p i s  
 #   u _ l i k e _ t a i l o r _ a p i s  
 