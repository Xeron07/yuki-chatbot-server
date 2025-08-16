const Product = require("../models/product");

// Search products by query string
const searchProducts = async (req, res) => {
  try {
    const { query, limit = 20 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: "Query parameter is required" });
    }

    // Create case-insensitive regex for partial matching
    const searchRegex = new RegExp(query, 'i');

    const products = await Product.find({
      $and: [
        { active: true },
        {
          $or: [
            { name: { $regex: searchRegex } },
            { description: { $regex: searchRegex } }
          ]
        }
      ]
    })
    .limit(parseInt(limit));

    res.json({ products, total: products.length });
  } catch (error) {
    console.error("Product search error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get single product details by id or slug
const getProductById = async (req, res) => {
  try {
    const { productId } = req.params;
    
    // Try to find by id first, then by slug
    let product = await Product.findOne({ id: productId, active: true });
    
    if (!product) {
      product = await Product.findOne({ slug: productId, active: true });
    }
    
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ product });
  } catch (error) {
    console.error("Get product error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  searchProducts,
  getProductById
};