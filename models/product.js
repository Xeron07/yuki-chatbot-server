const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const slugify = require("slugify");

const productSchema = new mongoose.Schema({
  id: { type: String, unique: true, default: uuidv4 },
  name: { type: String, default: "" },
  slug: { type: String, unique: true, index: true }, // ✅ Slug field
  rating: { type: Number, default: 5 },
  manu_id: { type: String, default: "" },
  description: { type: String, default: "" },
  discount: { type: Number, default: 0 },
  discountType: { type: String, default: "%" },
  quantity: { type: Number, default: 0 },
  unitPrice: { type: Number, default: 0 },
  totalPrice: { type: Number, default: 0 },
  active: { type: Boolean, default: false },
  thumbnail: { type: String, default: "" },
  images: { type: [String], default: [] },
  categoryId: { type: String, default: "" },
  productCode: { type: String },
  hasVariation: { type: Boolean, default: false },
  sku: { type: String, default: "HEX00--1", index: true },
  timestamps: {
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  variation: {
    type: [
      {
        id: { type: String, default: uuidv4 },
        size: { type: String, default: "" },
        color: { type: String, default: "" },
        sku: { type: String, default: "" },
        unitPrice: { type: Number, default: 0 },
        quantity: { type: Number, default: 0 },
      },
    ],
    default: [],
  },
  review: { type: Array, default: [] },
  ratingDetails: {
    type: Array,
    default: [
      { index: 5, value: 100 },
      { index: 4, value: 0 },
      { index: 3, value: 0 },
      { index: 2, value: 0 },
      { index: 1, value: 0 },
    ],
  },
});

// ✅ Pre-save hook to generate slug
productSchema.pre("save", function (next) {
  if (this.isModified("name")) {
    this.slug = slugify(this.name, {
      lower: true,
      strict: true,
      trim: true,
    });
  }
  next();
});

// ✅ Optimized indexes for better performance
productSchema.index({ name: "text", sku: "text" }); // Text search
productSchema.index({ categoryId: 1, active: 1 }); // Category filtering
productSchema.index({ manu_id: 1, categoryId: 1, active: 1 }); // Manufacturer filtering
productSchema.index({ active: 1, quantity: 1 }); // Stock filtering
productSchema.index({ sku: 1 }, { unique: true, sparse: true }); // SKU uniqueness

module.exports = mongoose.model("Product", productSchema);
