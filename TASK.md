Task: Implement Node.js/Express backend API with existing Mongoose schemas for e-commerce chatbot
Create a REST API server using the provided Mongoose schemas. The frontend expects these endpoints:

POST /api/products/search - Search products by query string (use text search on name/sku fields)
GET /api/products/:productId - Get single product details by id or slug
GET /api/orders/:orderNumber - Get order details by orderNumber field
GET /api/orders/:orderNumber/status - Get order status only

Existing Schemas to Use:
Product Schema: Already includes text indexing on name/sku fields, slug generation, variations array, rating system, and proper timestamps. Has fields: id, name, slug, rating, description, discount, quantity, unitPrice, images, categoryId, hasVariation, sku, variation[], etc.
Order Schema: Includes auto-incrementing orderNumber using OrderCounter, customer info, payment tracking, shipping details, and products array. Has fields: id, orderNumber, customer{name, email, phoneNumber}, status, totalPrice, paid, discount, deliveryCharge, products[], shipping{}, etc.
Implementation Requirements:

Express.js server with MongoDB/Mongoose connection
Use existing schemas exactly as provided (don't modify them)
Implement OrderCounter schema for auto-incrementing orderNumbers
Product search should use MongoDB text search on indexed fields
Handle both id and slug for product lookup
Proper error handling and HTTP status codes
CORS enabled for frontend integration
Environment variables for MongoDB connection and port
Seed database with sample data matching the schema structure

Search Logic: Use $text: { $search: query } for product search with proper scoring and filtering by active products.
The frontend has mock fallback data, so ensure your API returns data in the exact same structure as the schemas define.
