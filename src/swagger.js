const path = require("path");
const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "U Like Tailor API",
      version: "2.0.0",
      description:
        "Darzi ki dukaan ka backend (Hindi + English).\n\n" +
        "• Login: `POST /api/auth/otp/send` → `POST /api/auth/otp/verify` → `Authorization: Bearer <accessToken>`\n" +
        "• Dukaan ke andar wale APIs mein header `X-Shop-Id: <shopId>`\n" +
        "• Bhasha: header `X-Language: hi | en`\n" +
        "• Paisa hamesha paise mein (₹150.50 = 15050), tareekh \"YYYY-MM-DD\"\n" +
        "• Har jawab: `{success, message, data}` — galti par `{success:false, message, error:{code,key,message}}`",
    },
    servers: [
      { url: process.env.PUBLIC_BASE_URL || "http://localhost:5000", description: "Server" },
      { url: "https://u-like-tailor-backend.onrender.com", description: "Render" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        shopId: { type: "apiKey", in: "header", name: "X-Shop-Id" },
      },
    },
    security: [{ bearerAuth: [], shopId: [] }],
  },
  apis: [path.join(__dirname, "docs", "*.swagger.js")],
};

module.exports = swaggerJsdoc(options);
