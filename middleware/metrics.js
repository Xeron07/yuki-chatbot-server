const promClient = require('prom-client');
const logger = require('../utils/logger');

// Create a Registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({
  register,
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const websocketConnections = new promClient.Gauge({
  name: 'websocket_connections_active',
  help: 'Number of active WebSocket connections',
  labelNames: ['namespace'],
});

const chatbotMessages = new promClient.Counter({
  name: 'chatbot_messages_total',
  help: 'Total number of chatbot messages',
  labelNames: ['type', 'intent'],
});

const ticketMetrics = new promClient.Gauge({
  name: 'support_tickets_active',
  help: 'Number of active support tickets',
  labelNames: ['status'],
});

const nlpProcessingTime = new promClient.Histogram({
  name: 'nlp_processing_duration_seconds',
  help: 'Duration of NLP processing in seconds',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
});

const agentMetrics = new promClient.Gauge({
  name: 'support_agents_active',
  help: 'Number of active support agents',
  labelNames: ['status'],
});

const errorRate = new promClient.Counter({
  name: 'application_errors_total',
  help: 'Total number of application errors',
  labelNames: ['type', 'severity'],
});

const databaseQueries = new promClient.Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'collection'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

// Register metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(websocketConnections);
register.registerMetric(chatbotMessages);
register.registerMetric(ticketMetrics);
register.registerMetric(nlpProcessingTime);
register.registerMetric(agentMetrics);
register.registerMetric(errorRate);
register.registerMetric(databaseQueries);

// Middleware to collect HTTP metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    
    httpRequestDuration
      .labels(req.method, route, res.statusCode)
      .observe(duration);
    
    httpRequestTotal
      .labels(req.method, route, res.statusCode)
      .inc();
  });
  
  next();
};

// Metrics collection class
class MetricsCollector {
  static recordWebSocketConnection(namespace, count) {
    websocketConnections.labels(namespace).set(count);
  }
  
  static recordChatbotMessage(type, intent = 'unknown') {
    chatbotMessages.labels(type, intent).inc();
  }
  
  static recordTicketMetric(status, count) {
    ticketMetrics.labels(status).set(count);
  }
  
  static recordNLPProcessing(duration) {
    nlpProcessingTime.observe(duration);
  }
  
  static recordAgentMetric(status, count) {
    agentMetrics.labels(status).set(count);
  }
  
  static recordError(type, severity = 'error') {
    errorRate.labels(type, severity).inc();
    logger.error('Application error recorded', {
      type,
      severity,
      timestamp: new Date().toISOString(),
    });
  }
  
  static recordDatabaseQuery(operation, collection, duration) {
    databaseQueries.labels(operation, collection).observe(duration);
  }
  
  static getMetrics() {
    return register.metrics();
  }
  
  static getContentType() {
    return register.contentType;
  }
}

module.exports = {
  metricsMiddleware,
  MetricsCollector,
  register,
};