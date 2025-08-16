const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('redis');
const logger = require('../utils/logger');

// Redis client for rate limiting
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => {
  logger.error('Redis client error:', err);
});

redisClient.on('connect', () => {
  logger.info('Connected to Redis for rate limiting');
});

// Connect to Redis
redisClient.connect().catch((err) => {
  logger.error('Failed to connect to Redis:', err);
});

// General API rate limiter
const apiLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
  }),
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000),
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/metrics';
  },
  onLimitReached: (req) => {
    logger.security('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent'),
    });
  },
});

// Strict rate limiter for sensitive endpoints
const strictLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  message: {
    error: 'Too many requests to sensitive endpoint, please try again later.',
    retryAfter: Math.ceil(15 * 60),
  },
  standardHeaders: true,
  legacyHeaders: false,
  onLimitReached: (req) => {
    logger.security('Strict rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent'),
    });
  },
});

// WebSocket connection rate limiter
const websocketLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 connection attempts per minute
  message: {
    error: 'Too many WebSocket connection attempts, please try again later.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  onLimitReached: (req) => {
    logger.security('WebSocket rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
  },
});

// ML service rate limiter
const mlLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 ML requests per minute
  message: {
    error: 'Too many ML service requests, please try again later.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  onLimitReached: (req) => {
    logger.security('ML service rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
  },
});

module.exports = {
  apiLimiter,
  strictLimiter,
  websocketLimiter,
  mlLimiter,
  redisClient,
};