const Order = require("../models/order");

// Get order details by orderNumber field
const getOrderByNumber = async (req, res) => {
  try {
    const { orderNumber } = req.params;

    const order = await Order.findOne({
      $or: [{ orderNumber: parseInt(orderNumber) }, { id: orderNumber }],
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ order });
  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get order status only
const getOrderStatus = async (req, res) => {
  try {
    const { orderNumber } = req.params;

    const order = await Order.findOne(
      { orderNumber: parseInt(orderNumber) },
      { status: 1, orderNumber: 1, _id: 0 }
    );

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ orderNumber: order.orderNumber, status: order.status });
  } catch (error) {
    console.error("Get order status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get orders by customer phone number with status priority
const getOrdersByPhone = async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // First get processing orders (up to 3)
    const processingOrders = await Order.find({
      "customer.phoneNumber": phoneNumber,
      status: "processing",
    })
      .sort({ "timestamps.createdAt": -1 })
      .limit(3);

    let orders = [...processingOrders];
    const remainingSlots = 3 - processingOrders.length;

    // If we have space, get shipped orders
    if (remainingSlots > 0) {
      const shippedOrders = await Order.find({
        "customer.phoneNumber": phoneNumber,
        status: "shipped",
      })
        .sort({ "timestamps.createdAt": -1 })
        .limit(remainingSlots);

      orders = [...orders, ...shippedOrders];
    }

    res.json({
      orders,
      total: orders.length,
      phoneNumber,
    });
  } catch (error) {
    console.error("Get orders by phone error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getOrderByNumber,
  getOrderStatus,
  getOrdersByPhone,
};
