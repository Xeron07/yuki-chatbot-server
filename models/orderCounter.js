const mongoose = require("mongoose");

const orderCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequenceValue: { type: Number, default: 1 },
});

module.exports = mongoose.model("OrderCounter", orderCounterSchema);