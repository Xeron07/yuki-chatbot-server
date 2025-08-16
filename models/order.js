const mongoose = require("mongoose");
const OrderCounter = require("./orderCounter");
const orderSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  active: { type: Boolean, default: true },
  notes: { type: String, default: "" },
  orderCreatedBy: { type: String, default: "customer" },
  orderNumber: { type: Number, unique: true, default: -201 }, // Auto-incrementing field
  customer: {
    name: { type: String, required: true },
    email: { type: String, default: "" },
    phoneNumber: { type: String, required: true },
  },
  status: { type: String, default: "processing" },
  totalPrice: { type: Number, default: 0.0 },
  paid: { type: Number, default: 0.0 },
  discount: { type: Number, default: 0 },
  deliveryCharge: { type: Number, default: 0 },
  remaining: { type: Number, default: 0.0 },
  timestamps: {
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  payment: {
    type: [
      {
        paymentType: { type: String, default: "" },
        paymentBy: { type: String, default: "" },
        amount: { type: Number, default: 0 },
        date: { type: Date, default: Date.now },
        transectionId: { type: String },
      },
    ],
    default: [],
  },
  shipping: {
    division: { type: String, default: "" },
    district: { type: String, default: "" },
    address: { type: String, default: "" },
  },
  products: [
    {
      id: { type: String },
      productId: { type: String },
      name: { type: String },
      thumbnail: { type: String },
      quantity: { type: Number, default: 0 },
      unitPrice: { type: Number, default: 0.0 },
      totalPrice: { type: Number, default: 0.0 },
      discount: { type: Number, default: 0 },
      hasVariation: { type: Boolean, default: false },
      title: { type: String, default: "" },
      variantId: { type: String, default: "" },
      variation: {
        type: {
          id: { type: String, default: "" },
          size: { type: String, default: "" },
          color: { type: String, default: "" },
        },
        default: {},
      },
    },
  ],
});

// // Register the auto-increment plugin
// autoIncrement().then((res) =>
//   orderSchema.plugin(res.plugin, {
//     model: "Order",
//     field: "orderNumber",
//     startAt: 1,
//   })
// );

// Pre-save hook to auto-increment the 'id' field
orderSchema.pre("save", async function (next) {
  if (!this.isNew) {
    // Skip auto-increment logic if the document is not new
    return next();
  }

  try {
    const counter = await OrderCounter.findByIdAndUpdate(
      { _id: "id" }, // Use a unique identifier for the counter
      { $inc: { sequenceValue: 1 } }, // Increment the sequence value by 1
      { new: true, upsert: true } // Create the counter if it doesn't exist
    );

    this.orderNumber = counter.sequenceValue; // Set the auto-incremented id
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("orders", orderSchema);
