const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Add colors to winston
winston.addColors(colors);

// Define format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? format : consoleFormat,
  }),
  
  // File transport for errors
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/error.log'),
    level: 'error',
    format: format,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/combined.log'),
    format: format,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
];

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  levels,
  format,
  transports,
  exitOnError: false,
});

// Handle uncaught exceptions and unhandled rejections
logger.exceptions.handle(
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/exceptions.log'),
    format: format,
    maxsize: 5242880,
    maxFiles: 3,
  })
);

logger.rejections.handle(
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/rejections.log'),
    format: format,
    maxsize: 5242880,
    maxFiles: 3,
  })
);

// Add custom methods for different types of logs
logger.performance = (message, startTime, metadata = {}) => {
  const duration = Date.now() - startTime;
  logger.info(message, {
    type: 'performance',
    duration,
    ...metadata,
  });
};

logger.audit = (action, userId, details = {}) => {
  logger.info('Audit event', {
    type: 'audit',
    action,
    userId,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

logger.security = (event, details = {}) => {
  logger.warn('Security event', {
    type: 'security',
    event,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

logger.business = (metric, value, metadata = {}) => {
  logger.info('Business metric', {
    type: 'business',
    metric,
    value,
    timestamp: new Date().toISOString(),
    ...metadata,
  });
};

module.exports = logger;