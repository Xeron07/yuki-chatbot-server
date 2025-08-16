const helmet = require('helmet');
const hpp = require('hpp');
const xss = require('xss');
const validator = require('validator');
const logger = require('../utils/logger');

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  const sanitizeValue = (value) => {
    if (typeof value === 'string') {
      // Remove XSS attacks
      value = xss(value, {
        whiteList: {}, // No HTML tags allowed
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script'],
      });
      
      // Escape SQL injection attempts
      value = validator.escape(value);
      
      return value;
    }
    
    if (typeof value === 'object' && value !== null) {
      for (const key in value) {
        if (value.hasOwnProperty(key)) {
          value[key] = sanitizeValue(value[key]);
        }
      }
    }
    
    return value;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeValue(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeValue(req.query);
  }

  // Sanitize URL parameters
  if (req.params) {
    req.params = sanitizeValue(req.params);
  }

  next();
};

// Request validation middleware
const validateRequest = (req, res, next) => {
  // Check for suspicious patterns
  const suspiciousPatterns = [
    /(<script[\s\S]*?<\/script>)/gi,
    /(javascript:)/gi,
    /(onload=)/gi,
    /(onclick=)/gi,
    /(union.*select)/gi,
    /(drop.*table)/gi,
    /(insert.*into)/gi,
    /(delete.*from)/gi,
  ];

  const checkSuspicious = (obj) => {
    if (typeof obj === 'string') {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(obj)) {
          logger.security('Suspicious pattern detected', {
            ip: req.ip,
            pattern: pattern.toString(),
            value: obj.substring(0, 100),
            userAgent: req.get('User-Agent'),
          });
          return true;
        }
      }
    }
    
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (obj.hasOwnProperty(key) && checkSuspicious(obj[key])) {
          return true;
        }
      }
    }
    
    return false;
  };

  // Check request body, query, and params
  if (checkSuspicious(req.body) || checkSuspicious(req.query) || checkSuspicious(req.params)) {
    return res.status(400).json({
      error: 'Invalid request content detected',
      code: 'INVALID_INPUT',
    });
  }

  next();
};

// IP whitelist/blacklist middleware
const ipFilter = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // Blacklisted IPs (in production, store in database or Redis)
  const blacklistedIPs = process.env.BLACKLISTED_IPS 
    ? process.env.BLACKLISTED_IPS.split(',') 
    : [];

  if (blacklistedIPs.includes(clientIP)) {
    logger.security('Blocked IP attempted access', {
      ip: clientIP,
      path: req.path,
      userAgent: req.get('User-Agent'),
    });
    
    return res.status(403).json({
      error: 'Access denied',
      code: 'IP_BLOCKED',
    });
  }

  next();
};

// Request size limiter
const requestSizeLimit = (req, res, next) => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (req.get('content-length') && parseInt(req.get('content-length')) > maxSize) {
    logger.security('Request size limit exceeded', {
      ip: req.ip,
      size: req.get('content-length'),
      path: req.path,
    });
    
    return res.status(413).json({
      error: 'Request entity too large',
      code: 'REQUEST_TOO_LARGE',
    });
  }

  next();
};

// Security headers configuration
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for Socket.IO compatibility
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// HTTP Parameter Pollution protection
const hppProtection = hpp({
  whitelist: ['tags', 'categories'], // Allow arrays for specific parameters
});

// CORS security
const corsSecurityCheck = (req, res, next) => {
  const origin = req.get('Origin');
  const allowedOrigins = process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',') 
    : ['*'];

  if (origin && allowedOrigins.includes('*')) {
    // Allow all origins in development
    next();
    return;
  }

  if (origin && !allowedOrigins.includes(origin)) {
    logger.security('Blocked CORS request from unauthorized origin', {
      origin,
      ip: req.ip,
      path: req.path,
    });
    
    return res.status(403).json({
      error: 'Cross-origin request blocked',
      code: 'CORS_BLOCKED',
    });
  }

  next();
};

module.exports = {
  sanitizeInput,
  validateRequest,
  ipFilter,
  requestSizeLimit,
  securityHeaders,
  hppProtection,
  corsSecurityCheck,
};