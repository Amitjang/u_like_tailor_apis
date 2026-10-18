// Swagger docs: /api/expenses  (auto — routes/expenses.routes.js ke saath)

/**
 * @swagger
 * /api/expenses:
 *   get:
 *     tags: [expenses]
 *     summary: Get Expenses (owner/manager)
 *     description: "Query: ?from=&to=&category="
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/expenses:
 *   post:
 *     tags: [expenses]
 *     summary: Create Expense (owner/manager)
 *     description: "Body: {'category':'rent','amountPaise':500000,'spentOn':'2026-10-01'}"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

/**
 * @swagger
 * /api/expenses/{id}:
 *   delete:
 *     tags: [expenses]
 *     summary: Delete Expense (owner/manager)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: '{success, message, data}' }
 */

