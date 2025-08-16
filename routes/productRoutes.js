const express = require("express");
const router = express.Router();
const { searchProducts, getProductById } = require("../controllers/productController");

// POST /api/products/search - Search products by query string
router.post("/search", searchProducts);

// GET /api/products/:productId - Get single product details by id or slug
router.get("/:productId", getProductById);

module.exports = router;