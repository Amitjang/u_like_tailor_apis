// Chhote common helpers ek jagah (purane code ke liye bhi).
const { normalizePhone } = require("./phone");
const { rupees, gstSplit } = require("./money");
const { todayIST, addDays, isDateStr } = require("./dates");
const { ORDER_STATUS } = require("../models/model.helpers");

const makeId = (prefix) => `${prefix}-${Date.now()}`;

// Order status sahi hai? (received, cutting, stitching, trial, ready, delivered, cancelled)
const normalizeStatus = (status) => (ORDER_STATUS.includes(status) ? status : null);

// Order ka baaki (paise)
const orderDueAmount = (order) => Math.max((order.totalPaise || 0) - (order.paidPaise || 0), 0);

module.exports = { makeId, normalizeStatus, orderDueAmount, normalizePhone, rupees, gstSplit, todayIST, addDays, isDateStr };
