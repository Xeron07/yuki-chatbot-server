const express = require("express");
const router = express.Router();
const { getOrderByNumber, getOrderStatus, getOrdersByPhone } = require("../controllers/orderController");

// GET /api/orders/phone/:phoneNumber - Get orders by customer phone number
router.get("/phone/:phoneNumber", getOrdersByPhone);

// GET /api/orders/:orderNumber - Get order details by orderNumber field
router.get("/:orderNumber", getOrderByNumber);

// GET /api/orders/:orderNumber/status - Get order status only
router.get("/:orderNumber/status", getOrderStatus);

module.exports = router;