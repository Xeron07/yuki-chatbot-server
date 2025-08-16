#!/usr/bin/env python3
"""
NLP Service for Yuki Chatbot
Integrates the trained intent classification model with API tool calling
"""

import pickle
import json
import re
import sys
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from datetime import datetime

app = Flask(__name__)
CORS(app)

class NLPService:
    def __init__(self, model_path='model.pkl', vectorizer_path='vectorizer.pkl',
                 suggestion_model_path='suggestion_model.pkl',
                 suggestion_vectorizer_path='suggestion_vectorizer.pkl',
                 suggestion_binarizer_path='suggestion_binarizer.pkl'):
        """Initialize the NLP service with trained model and vectorizer"""
        try:
            # Load trained model and vectorizer
            with open(model_path, 'rb') as f:
                self.classifier = pickle.load(f)
            
            with open(vectorizer_path, 'rb') as f:
                self.vectorizer = pickle.load(f)
                
            print("✅ NLP model and vectorizer loaded successfully")
            
            # Load suggestion model components
            try:
                with open(suggestion_model_path, 'rb') as f:
                    self.suggestion_model = pickle.load(f)
                
                with open(suggestion_vectorizer_path, 'rb') as f:
                    self.suggestion_vectorizer = pickle.load(f)
                
                with open(suggestion_binarizer_path, 'rb') as f:
                    self.suggestion_binarizer = pickle.load(f)
                
                print("✅ Intelligent suggestion model loaded successfully")
                self.intelligent_suggestions_enabled = True
            except Exception as e:
                print(f"⚠️ Could not load suggestion model: {e}")
                print("Falling back to rule-based suggestions")
                self.intelligent_suggestions_enabled = False
            
            # Initialize conversation context storage
            self.conversation_contexts = {}
            
            # API endpoints for tool calling
            self.api_base = "http://localhost:3001/api"
            
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            raise e

    def predict_intent(self, text):
        """Predict intent from user input"""
        try:
            # Transform text using the vectorizer
            text_vector = self.vectorizer.transform([text])
            
            # Predict intent
            intent = self.classifier.predict(text_vector)[0]
            
            # Get confidence
            probabilities = self.classifier.predict_proba(text_vector)[0]
            confidence = max(probabilities)
            
            return intent, confidence
            
        except Exception as e:
            print(f"Error predicting intent: {e}")
            return "general", 0.0

    def extract_entities(self, text):
        """Extract entities from user input"""
        entities = {}
        text_lower = text.lower()
        
        # Extract product codes (SS122, B123, H12M pattern)
        product_code_patterns = [
            r'\b(ss\d{2,3})\b',  # SS122, SS123, etc.
            r'\b(b\d{2,3})\b',   # B123, B129, etc.
            r'\b(h\d{1,2}m?)\b'  # H12M, H123, etc.
        ]
        
        for pattern in product_code_patterns:
            matches = re.findall(pattern, text_lower)
            if matches:
                entities['productCode'] = matches[0].upper()
                break
        
        # Extract order numbers (4-10 digits)
        order_pattern = r'\b(\d{4,10})\b'
        order_matches = re.findall(order_pattern, text)
        if order_matches:
            entities['orderNumber'] = order_matches[0]
        
        # Extract phone numbers (Bangladesh format)
        phone_pattern = r'\b(01[3-9]\d{8})\b'
        phone_matches = re.findall(phone_pattern, text)
        if phone_matches:
            entities['phoneNumber'] = phone_matches[0]
        
        # Extract colors
        colors = ['red', 'blue', 'green', 'black', 'white', 'yellow', 'pink', 
                 'purple', 'brown', 'gray', 'grey', 'orange', 'navy', 'maroon', 
                 'gold', 'silver', 'beige', 'cream']
        found_colors = [color for color in colors if color in text_lower]
        if found_colors:
            entities['colors'] = found_colors
        
        # Extract sizes
        sizes = ['xs', 'small', 's', 'medium', 'm', 'large', 'l', 'xl', 'xxl', 
                '2xl', '3xl', '36', '37', '38', '39', '40', '41', '42']
        found_sizes = [size for size in sizes if size in text_lower]
        if found_sizes:
            entities['sizes'] = found_sizes
        
        # Extract search terms (clean up common words)
        if entities.get('productCode'):
            entities['searchTerms'] = [entities['productCode']]
        else:
            common_words = ['search', 'find', 'show', 'get', 'is', 'are', 'the', 
                          'a', 'an', 'for', 'available', 'i', 'want', 'need', 
                          'looking', 'product', 'item', 'buy', 'purchase']
            words = re.findall(r'\b\w+\b', text_lower)
            search_terms = [word for word in words if len(word) > 1 and word not in common_words]
            if search_terms:
                entities['searchTerms'] = search_terms[:3]  # Limit to 3 terms
        
        return entities

    def call_api(self, action, **kwargs):
        """Make API calls for tool calling"""
        try:
            if action == "search_product":
                return self._search_products(**kwargs)
            elif action == "check_stock":
                return self._check_stock(**kwargs)
            elif action == "get_price":
                return self._get_price(**kwargs)
            elif action == "track_order":
                return self._track_order(**kwargs)
            elif action == "get_orders_by_phone":
                return self._get_orders_by_phone(**kwargs)
            else:
                return {"error": f"Unknown action: {action}"}
                
        except Exception as e:
            return {"error": f"API call failed: {str(e)}"}

    def _search_products(self, filters=None):
        """Search products via API"""
        try:
            url = f"{self.api_base}/products/search"
            
            # Build search query
            query = ""
            if filters:
                if 'productCode' in filters:
                    query = filters['productCode']
                elif 'keywords' in filters:
                    if isinstance(filters['keywords'], list):
                        query = ' '.join(filters['keywords'])
                    else:
                        query = filters['keywords']
                elif 'searchTerms' in filters:
                    query = ' '.join(filters['searchTerms'])
            
            if not query:
                return {"error": "No search query provided"}
            
            response = requests.post(url, json={"query": query, "limit": 10}, timeout=5)
            
            if response.status_code == 200:
                return response.json()
            else:
                return {"error": f"Search failed: {response.status_code}"}
                
        except Exception as e:
            return {"error": f"Search API error: {str(e)}"}

    def _check_stock(self, filters=None):
        """Check product stock via API"""
        # For now, integrate with search to get product info including stock
        search_result = self._search_products(filters)
        
        if 'error' in search_result:
            return search_result
        
        products = search_result.get('products', [])
        if not products:
            return {"error": "Product not found"}
        
        # Return stock information
        product = products[0]
        stock_info = {
            "product": product,
            "in_stock": product.get('stock', 0) > 0,
            "quantity": product.get('stock', 0)
        }
        
        return stock_info

    def _get_price(self, filters=None):
        """Get product pricing via API"""
        search_result = self._search_products(filters)
        
        if 'error' in search_result:
            return search_result
        
        products = search_result.get('products', [])
        if not products:
            return {"error": "Product not found"}
        
        # Return price information
        product = products[0]
        price_info = {
            "product": product,
            "price": product.get('unitPrice', 0),
            "currency": "BDT"
        }
        
        return price_info

    def _track_order(self, filters=None):
        """Track order via API"""
        try:
            if not filters or 'orderNumber' not in filters:
                return {"error": "Order number required"}
            
            url = f"{self.api_base}/orders/{filters['orderNumber']}"
            response = requests.get(url, timeout=5)
            
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 404:
                return {"error": "Order not found"}
            else:
                return {"error": f"Order tracking failed: {response.status_code}"}
                
        except Exception as e:
            return {"error": f"Order tracking API error: {str(e)}"}

    def _get_orders_by_phone(self, filters=None):
        """Get orders by phone number via API"""
        try:
            if not filters or 'phoneNumber' not in filters:
                return {"error": "Phone number required"}
            
            url = f"{self.api_base}/orders/phone/{filters['phoneNumber']}"
            response = requests.get(url, timeout=5)
            
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 404:
                return {"error": "No orders found for this phone number"}
            else:
                return {"error": f"Phone lookup failed: {response.status_code}"}
                
        except Exception as e:
            return {"error": f"Phone lookup API error: {str(e)}"}

    def _create_context_for_suggestions(self, intent, entities, action=None, last_message=""):
        """Create context object for intelligent suggestions"""
        context = {
            "last_intent": intent,
            "last_message": last_message,
            "entities": entities,
            "conversation_stage": self._determine_conversation_stage(intent, entities, action),
            "products_found": intent in ["product_search", "show_variants"] and action != "no_products_found"
        }
        return context
    
    def _determine_conversation_stage(self, intent, entities, action):
        """Determine conversation stage based on intent and entities"""
        if intent == "greeting":
            return "greeting"
        elif intent == "product_search":
            if entities.get('productCode'):
                return "product_found"
            elif action == "no_products_found":
                return "no_products_found"
            else:
                return "category_search"
        elif intent == "price_inquiry":
            if entities.get('productCode'):
                return "price_checked"
            else:
                return "category_pricing"
        elif intent == "stock_inquiry":
            return "stock_checked"
        elif intent == "show_variants":
            return "variants_shown"
        elif intent == "order_status":
            return "order_tracked"
        elif intent == "provide_phone_number":
            return "phone_provided"
        else:
            return "general"
    
    def _create_context_string_for_suggestions(self, context):
        """Create context string for suggestion model (same as training)"""
        features = []
        
        # Add intent information
        if 'last_intent' in context:
            features.append(f"intent_{context['last_intent']}")
        
        # Add conversation stage
        if 'conversation_stage' in context:
            features.append(f"stage_{context['conversation_stage']}")
        
        # Add entity information
        if 'entities' in context:
            entities = context['entities']
            if 'productCode' in entities:
                features.append(f"has_product_code")
            if 'searchTerms' in entities:
                features.extend([f"search_{term}" for term in entities['searchTerms']])
            if 'colors' in entities:
                features.extend([f"color_{color}" for color in entities['colors']])
            if 'sizes' in entities:
                features.extend([f"size_{size}" for size in entities['sizes']])
            if 'orderNumber' in entities:
                features.append("has_order_number")
            if 'phoneNumber' in entities:
                features.append("has_phone_number")
        
        # Add products found flag
        if context.get('products_found'):
            features.append("products_found")
        else:
            features.append("no_products_found")
        
        # Add last message (cleaned)
        if 'last_message' in context:
            message_words = context['last_message'].lower().split()
            features.extend([f"msg_{word}" for word in message_words[:5]])  # Limit to 5 words
        
        return ' '.join(features)
    
    def predict_intelligent_suggestions(self, context, top_k=4):
        """Use ML model to predict intelligent suggestions"""
        try:
            # Create context string
            context_str = self._create_context_string_for_suggestions(context)
            
            # Vectorize
            X = self.suggestion_vectorizer.transform([context_str])
            
            # Get binary predictions
            predictions = self.suggestion_model.predict(X)[0]
            
            # Get suggestions where prediction is 1
            suggested_indices = np.where(predictions == 1)[0]
            
            if len(suggested_indices) == 0:
                # Fallback to rule-based suggestions
                return self.generate_rule_based_suggestions(context['last_intent'], context['entities'])
            
            # Get suggested classes
            suggested_classes = [self.suggestion_binarizer.classes_[i] for i in suggested_indices]
            
            # Return top k suggestions
            return suggested_classes[:top_k]
            
        except Exception as e:
            print(f"Error in intelligent suggestions: {e}")
            # Fallback to rule-based suggestions
            return self.generate_rule_based_suggestions(context['last_intent'], context['entities'])
    
    def generate_suggestions(self, intent, entities, action=None, api_result=None, last_message=""):
        """Generate contextual suggestions for the next user actions"""
        if self.intelligent_suggestions_enabled:
            # Use intelligent ML-based suggestions
            context = self._create_context_for_suggestions(intent, entities, action, last_message)
            return self.predict_intelligent_suggestions(context)
        else:
            # Fallback to rule-based suggestions
            return self.generate_rule_based_suggestions(intent, entities)
    
    def generate_rule_based_suggestions(self, intent, entities):
        """Generate rule-based suggestions (original method)"""
        suggestions = []
        
        if intent == "greeting":
            suggestions = [
                "Search for women shoes",
                "Show me hijabs", 
                "Track my order",
                "What's available in bags?"
            ]
            
        elif intent == "product_search":
            if entities.get('productCode'):
                product_code = entities['productCode']
                suggestions = [
                    f"Show colors for {product_code}",
                    f"Is {product_code} in stock?",
                    f"Price of {product_code}",
                    f"What sizes for {product_code}?"
                ]
            else:
                suggestions = [
                    "Show me more products",
                    "Filter by color",
                    "Filter by price range",
                    "Show product details"
                ]
                
        elif intent == "stock_inquiry":
            if entities.get('productCode'):
                product_code = entities['productCode']
                suggestions = [
                    f"Price of {product_code}",
                    f"Show variants for {product_code}",
                    f"Add {product_code} to cart",
                    "Show similar products"
                ]
            else:
                suggestions = [
                    "Check other products",
                    "Show available items",
                    "Filter by availability",
                    "Browse categories"
                ]
                
        elif intent == "price_inquiry":
            if entities.get('productCode'):
                product_code = entities['productCode']
                suggestions = [
                    f"Is {product_code} in stock?",
                    f"Show colors for {product_code}",
                    f"Add {product_code} to cart",
                    "Compare prices"
                ]
            else:
                suggestions = [
                    "Show price ranges",
                    "Filter by budget",
                    "Show affordable options",
                    "Compare products"
                ]
                
        elif intent == "order_status":
            if entities.get('orderNumber'):
                order_num = entities['orderNumber']
                suggestions = [
                    f"Track order {order_num}",
                    "When will it arrive?",
                    "Change delivery address",
                    "Cancel order"
                ]
            elif entities.get('phoneNumber'):
                suggestions = [
                    "Show recent orders",
                    "Track latest order",
                    "Order history",
                    "Delivery updates"
                ]
            else:
                suggestions = [
                    "Track with order number",
                    "Find orders by phone",
                    "Check recent orders",
                    "Order history"
                ]
                
        elif intent == "show_variants":
            if entities.get('productCode'):
                product_code = entities['productCode']
                suggestions = [
                    f"Is {product_code} available in red?",
                    f"Show {product_code} in medium",
                    f"Compare {product_code} colors",
                    f"Size chart for {product_code}"
                ]
            else:
                suggestions = [
                    "Show size chart",
                    "Available colors",
                    "Compare styles",
                    "Filter by size"
                ]
                
        elif intent == "provide_phone_number":
            suggestions = [
                "Track my order",
                "Show my recent orders",
                "Order history",
                "Find orders by phone"
            ]
            
        elif intent == "general":
            suggestions = [
                "Search for products",
                "Track my order", 
                "Show me categories",
                "Help with shopping"
            ]
        
        # Limit to 4 suggestions and ensure they're unique
        unique_suggestions = list(dict.fromkeys(suggestions))
        return unique_suggestions[:4]

    def process_message(self, message, session_id="default"):
        """Main processing function that combines intent prediction with tool calling"""
        try:
            # Predict intent
            intent, confidence = self.predict_intent(message)
            
            # Extract entities
            entities = self.extract_entities(message)
            
            # Initialize response structure
            response = {
                "intent": intent,
                "confidence": confidence,
                "entities": entities,
                "message": message,
                "timestamp": datetime.now().isoformat(),
                "session_id": session_id,
                "action": None
            }
            
            # Handle different intents with API calls
            if intent == "greeting":
                response["action"] = "greet_user"
                response["response"] = {
                    "type": "text",
                    "content": "Hello! I'm your shopping assistant. I can help you with product searches, stock availability, price inquiries, order tracking, and product variants. How can I help you today?"
                }
                
            elif intent == "product_search":
                response["action"] = "search_product"
                # Call search API
                api_result = self.call_api("search_product", filters=entities)
                
                if 'error' in api_result:
                    response["response"] = {
                        "type": "error",
                        "content": f"Sorry, I couldn't search for products: {api_result['error']}"
                    }
                else:
                    products = api_result.get('products', [])
                    if products:
                        response["response"] = {
                            "type": "products",
                            "content": f"Found {len(products)} product(s):",
                            "products": products[:3]  # Limit to 3 results
                        }
                    else:
                        response["action"] = "no_products_found"
                        response["response"] = {
                            "type": "text",
                            "content": "No products found matching your search. Try different keywords or browse our categories."
                        }
                        
            elif intent == "stock_inquiry":
                response["action"] = "check_stock"
                # Call stock check API
                api_result = self.call_api("check_stock", filters=entities)
                
                if 'error' in api_result:
                    response["response"] = {
                        "type": "error",
                        "content": f"Sorry, I couldn't check stock: {api_result['error']}"
                    }
                else:
                    stock_status = "✅ In Stock" if api_result.get('in_stock') else "❌ Out of Stock"
                    quantity = api_result.get('quantity', 0)
                    product_name = api_result.get('product', {}).get('name', 'Product')
                    
                    response["response"] = {
                        "type": "stock",
                        "content": f"{product_name}: {stock_status}" + (f" ({quantity} units available)" if quantity > 0 else ""),
                        "stock_info": api_result
                    }
                    
            elif intent == "price_inquiry":
                response["action"] = "get_price"
                # Call price API
                api_result = self.call_api("get_price", filters=entities)
                
                if 'error' in api_result:
                    response["response"] = {
                        "type": "error",
                        "content": f"Sorry, I couldn't get price information: {api_result['error']}"
                    }
                else:
                    price = api_result.get('price', 0)
                    product_name = api_result.get('product', {}).get('name', 'Product')
                    
                    response["response"] = {
                        "type": "price",
                        "content": f"{product_name}: ৳{price}",
                        "price_info": api_result
                    }
                    
            elif intent == "order_status":
                # Handle order tracking
                if 'orderNumber' in entities:
                    response["action"] = "track_order"
                    api_result = self.call_api("track_order", filters=entities)
                elif 'phoneNumber' in entities:
                    response["action"] = "get_orders_by_phone"
                    api_result = self.call_api("get_orders_by_phone", filters=entities)
                else:
                    response["action"] = "request_order_info"
                    response["response"] = {
                        "type": "text",
                        "content": "Please provide your order number or phone number to track your order."
                    }
                    # Generate suggestions and return
                    response["suggestions"] = self.generate_suggestions(intent, entities, response["action"])
                    return response
                    
            elif intent == "provide_phone_number":
                # Handle phone number provision for order lookup
                if 'phoneNumber' in entities:
                    response["action"] = "get_orders_by_phone"
                    api_result = self.call_api("get_orders_by_phone", filters=entities)
                else:
                    response["action"] = "request_phone_number"
                    response["response"] = {
                        "type": "text",
                        "content": "Please provide your phone number to find your orders. Example: 01712345678"
                    }
                    # Generate suggestions and return
                    response["suggestions"] = self.generate_suggestions(intent, entities, response["action"])
                    return response
                
                if 'error' in api_result:
                    response["response"] = {
                        "type": "error",
                        "content": f"Sorry, I couldn't track your order: {api_result['error']}"
                    }
                else:
                    response["response"] = {
                        "type": "order",
                        "content": "Here's your order information:",
                        "order_data": api_result
                    }
                    
            elif intent == "show_variants":
                # Determine specific variant action based on entities
                if entities.get('color') and entities.get('size'):
                    response["action"] = "check_variant_availability"
                elif 'color' in message.lower() and 'size' in message.lower():
                    response["action"] = "show_all_variants"
                elif 'color' in message.lower():
                    response["action"] = "show_color_options"
                elif 'size' in message.lower() or 'chart' in message.lower():
                    response["action"] = "show_size_chart"
                elif 'compare' in message.lower() or 'difference' in message.lower():
                    response["action"] = "compare_variants"
                else:
                    response["action"] = "show_product_variants"
                
                # For variants, we'd need to get product details first
                search_result = self.call_api("search_product", filters=entities)
                
                if 'error' in search_result or not search_result.get('products'):
                    response["response"] = {
                        "type": "text",
                        "content": "Please search for a specific product first to see variants."
                    }
                else:
                    product = search_result['products'][0]
                    variants = product.get('variation', [])
                    
                    if variants:
                        response["response"] = {
                            "type": "variants",
                            "content": f"Available variants for {product.get('name', 'this product')}:",
                            "variants": variants
                        }
                    else:
                        response["response"] = {
                            "type": "text",
                            "content": f"{product.get('name', 'This product')} doesn't have variants."
                        }
                        
            else:  # general intent
                response["action"] = "provide_help"
                response["response"] = {
                    "type": "text",
                    "content": "I'm here to help! I can search products, check stock, provide pricing information, and track orders. What would you like to know?"
                }
            
            # Generate contextual suggestions for all responses
            response["suggestions"] = self.generate_suggestions(intent, entities, response.get("action"), response.get("response"), message)
            
            return response
            
        except Exception as e:
            return {
                "intent": "general",
                "confidence": 0.0,
                "error": str(e),
                "response": {
                    "type": "text",
                    "content": "Sorry, I encountered an error processing your message. Please try again."
                }
            }

# Initialize the NLP service
nlp_service = NLPService()

@app.route('/predict', methods=['POST'])
def predict():
    """API endpoint for intent prediction and processing"""
    try:
        data = request.get_json()
        
        if not data or 'message' not in data:
            return jsonify({"error": "Message is required"}), 400
        
        message = data['message']
        session_id = data.get('session_id', 'default')
        
        # Process the message
        result = nlp_service.process_message(message, session_id)
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "NLP Service",
        "timestamp": datetime.now().isoformat()
    })

if __name__ == '__main__':
    print("🤖 Starting NLP Service...")
    print("📊 Model loaded and ready for intent classification")
    print("🔧 API tool calling enabled")
    print("🌐 Server starting on http://localhost:5000")
    
    app.run(host='0.0.0.0', port=5000, debug=True)