# Yuki Chatbot Production Deployment Guide

## Table of Contents
1. [System Requirements](#system-requirements)
2. [Pre-deployment Setup](#pre-deployment-setup)
3. [Deployment Options](#deployment-options)
4. [Configuration](#configuration)
5. [Security Setup](#security-setup)
6. [Monitoring & Logging](#monitoring--logging)
7. [Performance Analysis](#performance-analysis)
8. [Maintenance & Backup](#maintenance--backup)
9. [Troubleshooting](#troubleshooting)

## System Requirements

### Minimum Requirements (Up to 100 concurrent users)
- **CPU**: 2 vCPUs (2.4 GHz)
- **RAM**: 4 GB
- **Storage**: 50 GB SSD
- **Network**: 100 Mbps bandwidth
- **OS**: Ubuntu 20.04 LTS or higher

### Recommended Requirements (Up to 1000 concurrent users)
- **CPU**: 8 vCPUs (2.4 GHz or higher)
- **RAM**: 16 GB
- **Storage**: 200 GB SSD (with backup storage)
- **Network**: 1 Gbps bandwidth
- **OS**: Ubuntu 22.04 LTS

### High-Load Requirements (1000+ concurrent users)
- **CPU**: 16 vCPUs (3.0 GHz or higher)
- **RAM**: 32 GB
- **Storage**: 500 GB NVMe SSD
- **Network**: 10 Gbps bandwidth
- **Load Balancer**: Required for horizontal scaling

## Pre-deployment Setup

### 1. Server Preparation
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Install additional tools
sudo apt install -y htop iotop nethogs ufw fail2ban
```

### 2. Firewall Configuration
```bash
# Configure UFW firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 3. SSL Certificate Setup
```bash
# Install Certbot for Let's Encrypt
sudo apt install certbot python3-certbot-nginx -y

# Obtain SSL certificate
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Copy certificates to project directory
sudo mkdir -p /path/to/project/nginx/ssl
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /path/to/project/nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /path/to/project/nginx/ssl/key.pem
sudo chown -R $USER:$USER /path/to/project/nginx/ssl
```

## Deployment Options

### Option 1: Docker Compose Deployment (Recommended)

#### Step 1: Clone and Setup
```bash
git clone <repository-url> yuki-chatbot
cd yuki-chatbot/chatbot-server

# Copy environment file
cp .env.production .env

# Edit environment variables
nano .env
```

#### Step 2: Configure Environment Variables
Edit `.env` file with your production values:
```env
# Update these critical values
MONGO_ROOT_PASSWORD=your-secure-mongodb-password
REDIS_PASSWORD=your-secure-redis-password
JWT_SECRET=your-super-secret-jwt-key-min-32-characters
ENCRYPTION_KEY=your-32-character-encryption-key
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
GRAFANA_PASSWORD=your-secure-grafana-password
```

#### Step 3: Deploy
```bash
# Create required directories
mkdir -p logs nginx/ssl monitoring/grafana/dashboards monitoring/grafana/datasources

# Deploy the stack
docker-compose up -d

# Verify deployment
docker-compose ps
docker-compose logs -f
```

### Option 2: Manual Deployment

#### Step 1: Install Dependencies
```bash
# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python 3.11
sudo apt install python3.11 python3.11-venv python3-pip -y

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Install Redis
sudo apt install redis-server -y

# Install Nginx
sudo apt install nginx -y
```

#### Step 2: Setup Application
```bash
# Install Node.js dependencies
npm ci --production

# Setup Python environment
cd ml-service
python3 -m venv ml-env
source ml-env/bin/activate
pip install -r requirements.txt
cd ..

# Configure services
sudo systemctl enable mongodb redis-server nginx
sudo systemctl start mongodb redis-server nginx
```

#### Step 3: Process Management with PM2
```bash
# Install PM2
npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'chatbot-app',
      script: 'server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      name: 'ml-service',
      script: 'ml-service/nlp_service.py',
      interpreter: 'ml-service/ml-env/bin/python',
      env: {
        ML_SERVICE_PORT: 5000
      }
    }
  ]
};
EOF

# Start applications
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Configuration

### Database Configuration

#### MongoDB Production Setup
```javascript
// config/db.js - Production optimizations
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 100,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferMaxEntries: 0,
      retryWrites: true,
      w: 'majority',
      readPreference: 'secondaryPreferred'
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};
```

#### Redis Configuration
```bash
# Edit Redis configuration
sudo nano /etc/redis/redis.conf

# Key settings for production:
maxmemory 2gb
maxmemory-policy allkeys-lru
requirepass your-redis-password
save 900 1
save 300 10
save 60 10000
```

### Application Configuration

#### Performance Tuning
```javascript
// Add to server.js
const compression = require('compression');
const { metricsMiddleware } = require('./middleware/metrics');
const { apiLimiter } = require('./middleware/rateLimiter');
const { securityHeaders, sanitizeInput } = require('./middleware/security');

// Enable compression
app.use(compression({
  level: 6,
  threshold: 1024,
}));

// Add security middleware
app.use(securityHeaders);
app.use(sanitizeInput);

// Add rate limiting
app.use('/api', apiLimiter);

// Add metrics collection
app.use(metricsMiddleware);

// Add metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', MetricsCollector.getContentType());
  res.end(await MetricsCollector.getMetrics());
});
```

## Security Setup

### 1. Environment Security
```bash
# Set proper file permissions
chmod 600 .env*
chmod 700 logs/
chmod 600 nginx/ssl/*

# Create dedicated user
sudo useradd -r -s /bin/false chatbot
sudo chown -R chatbot:chatbot /path/to/application
```

### 2. Network Security
```bash
# Configure fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local

# Add custom filter for application
cat > /etc/fail2ban/filter.d/chatbot.conf << 'EOF'
[Definition]
failregex = ^.*"ip":"<HOST>".*"type":"security".*$
ignoreregex =
EOF

# Add jail configuration
cat >> /etc/fail2ban/jail.local << 'EOF'
[chatbot]
enabled = true
port = 80,443
filter = chatbot
logpath = /path/to/application/logs/combined.log
maxretry = 5
bantime = 3600
EOF

sudo systemctl restart fail2ban
```

### 3. SSL/TLS Configuration
Update `nginx/nginx.conf` with strong SSL settings:
```nginx
# Use Mozilla's intermediate configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;

# HSTS
add_header Strict-Transport-Security "max-age=63072000" always;

# OCSP stapling
ssl_stapling on;
ssl_stapling_verify on;
```

## Monitoring & Logging

### 1. Log Management
```bash
# Setup log rotation
sudo nano /etc/logrotate.d/chatbot

# Add configuration:
/path/to/application/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 chatbot chatbot
    postrotate
        docker-compose restart chatbot-app > /dev/null 2>&1 || true
    endscript
}
```

### 2. Monitoring Setup

#### Grafana Dashboards
Create dashboard configuration in `monitoring/grafana/dashboards/`:

```json
{
  "dashboard": {
    "title": "Yuki Chatbot Dashboard",
    "panels": [
      {
        "title": "Active WebSocket Connections",
        "type": "stat",
        "targets": [
          {
            "expr": "websocket_connections_active"
          }
        ]
      },
      {
        "title": "HTTP Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])"
          }
        ]
      }
    ]
  }
}
```

#### Alerting Rules
Create `monitoring/alert_rules.yml`:
```yaml
groups:
  - name: chatbot.rules
    rules:
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time detected"
      
      - alert: HighErrorRate
        expr: rate(application_errors_total[5m]) > 10
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
```

### 3. Health Checks
```bash
# Create health check script
cat > health_check.sh << 'EOF'
#!/bin/bash

# Check main application
if ! curl -f http://localhost:3001/health > /dev/null 2>&1; then
    echo "Main application health check failed"
    exit 1
fi

# Check ML service
if ! curl -f http://localhost:5000/health > /dev/null 2>&1; then
    echo "ML service health check failed"
    exit 1
fi

echo "All services healthy"
EOF

chmod +x health_check.sh

# Add to crontab for monitoring
echo "*/2 * * * * /path/to/health_check.sh" | crontab -
```

## Performance Analysis for 1000 Concurrent Users

### Resource Usage Estimation

#### CPU Usage
- **Node.js Application**: ~4-6 vCPUs at 70% utilization
- **ML Service**: ~2-3 vCPUs at 60% utilization  
- **Database Operations**: ~1-2 vCPUs at 50% utilization
- **System Overhead**: ~1 vCPU at 30% utilization
- **Total Recommended**: 8-12 vCPUs

#### Memory Usage
- **Node.js Application**: ~8-12 GB (cluster mode with 8 workers)
- **ML Service**: ~2-4 GB (model loading + processing)
- **MongoDB**: ~2-3 GB (working set + cache)
- **Redis**: ~1-2 GB (session data + rate limiting)
- **System + Monitoring**: ~1-2 GB
- **Total Recommended**: 16-24 GB RAM

#### Network Bandwidth
- **WebSocket Connections**: ~50-100 KB/s per active user
- **HTTP API Calls**: ~10-20 KB/s per user
- **Peak Traffic**: 1000 users × 150 KB/s = ~150 Mbps
- **Recommended**: 1 Gbps with burst capability

#### Storage I/O
- **Database Writes**: ~500-1000 IOPS
- **Log Writes**: ~100-200 IOPS
- **Application Reads**: ~200-400 IOPS
- **Total**: ~800-1600 IOPS (SSD recommended)

### Performance Bottlenecks & Solutions

#### 1. WebSocket Connection Limits
```javascript
// Increase connection limits
server.maxConnections = 2000;
server.timeout = 120000;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
```

#### 2. Database Connection Pooling
```javascript
// Optimize MongoDB connections
mongoose.connect(uri, {
  maxPoolSize: 100,
  minPoolSize: 5,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
});
```

#### 3. Redis Optimization
```bash
# Redis configuration for high load
tcp-keepalive 300
timeout 0
tcp-backlog 511
databases 16
```

#### 4. Load Balancing (for scaling beyond 1000 users)
```nginx
upstream chatbot_cluster {
    least_conn;
    server app1:3001 max_fails=3 fail_timeout=30s;
    server app2:3001 max_fails=3 fail_timeout=30s;
    server app3:3001 max_fails=3 fail_timeout=30s;
    keepalive 32;
}
```

### Expected Performance Metrics

#### Response Times (95th percentile)
- **API Endpoints**: <200ms
- **WebSocket Messages**: <50ms
- **ML Processing**: <500ms
- **Database Queries**: <100ms

#### Throughput
- **HTTP Requests**: 5,000-10,000 req/sec
- **WebSocket Messages**: 50,000-100,000 msg/sec
- **ML Predictions**: 1,000-2,000 pred/sec

#### Availability Targets
- **Uptime**: 99.9% (8.76 hours downtime/year)
- **Error Rate**: <0.1%
- **Recovery Time**: <5 minutes

## Maintenance & Backup

### 1. Automated Backups
```bash
# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backup/$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR

# Backup MongoDB
mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/mongodb"

# Backup Redis
redis-cli --rdb "$BACKUP_DIR/redis.rdb"

# Backup application files
tar -czf "$BACKUP_DIR/app.tar.gz" /path/to/application

# Backup logs
tar -czf "$BACKUP_DIR/logs.tar.gz" /path/to/application/logs

# Upload to cloud storage (optional)
# aws s3 sync $BACKUP_DIR s3://your-backup-bucket/

# Cleanup old backups (keep 30 days)
find /backup -name "*" -type d -mtime +30 -exec rm -rf {} \;
EOF

chmod +x backup.sh

# Schedule daily backups
echo "0 2 * * * /path/to/backup.sh" | crontab -
```

### 2. Update Procedure
```bash
# Create update script
cat > update.sh << 'EOF'
#!/bin/bash
set -e

echo "Starting update procedure..."

# Backup current version
./backup.sh

# Pull latest changes
git fetch origin
git checkout main
git pull origin main

# Update dependencies
npm ci --production
cd ml-service && source ml-env/bin/activate && pip install -r requirements.txt && cd ..

# Run database migrations if any
# npm run migrate

# Restart services with zero downtime
docker-compose up -d --no-deps --build chatbot-app

# Verify health
sleep 30
./health_check.sh

echo "Update completed successfully"
EOF

chmod +x update.sh
```

### 3. Monitoring Alerts
```bash
# Setup email alerts for critical issues
sudo apt install mailutils -y

# Configure monitoring script
cat > monitor.sh << 'EOF'
#!/bin/bash

# Check disk space
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "High disk usage: $DISK_USAGE%" | mail -s "Disk Space Alert" admin@yourdomain.com
fi

# Check memory usage
MEM_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
if [ $MEM_USAGE -gt 90 ]; then
    echo "High memory usage: $MEM_USAGE%" | mail -s "Memory Alert" admin@yourdomain.com
fi

# Check application health
if ! ./health_check.sh; then
    echo "Application health check failed" | mail -s "Service Down Alert" admin@yourdomain.com
fi
EOF

chmod +x monitor.sh

# Run monitoring every 5 minutes
echo "*/5 * * * * /path/to/monitor.sh" | crontab -
```

## Troubleshooting

### Common Issues

#### 1. High Memory Usage
```bash
# Check memory usage by process
ps aux --sort=-%mem | head -10

# Monitor memory in real-time
watch -n 1 'free -h && echo && ps aux --sort=-%mem | head -10'

# Restart services if needed
docker-compose restart chatbot-app
```

#### 2. Database Connection Issues
```bash
# Check MongoDB status
sudo systemctl status mongodb
docker-compose logs mongodb

# Check connections
mongo --eval "db.serverStatus().connections"

# Restart if needed
docker-compose restart mongodb
```

#### 3. WebSocket Connection Problems
```bash
# Check open connections
ss -tuln | grep :3001

# Monitor connection count
netstat -an | grep :3001 | wc -l

# Check Nginx logs
tail -f /var/log/nginx/error.log
```

#### 4. Performance Degradation
```bash
# Check system resources
htop
iotop
nethogs

# Check application metrics
curl http://localhost:3001/metrics

# Check logs for errors
tail -f logs/error.log
```

### Emergency Procedures

#### 1. Service Recovery
```bash
# Quick restart all services
docker-compose down && docker-compose up -d

# Or restart individual services
docker-compose restart chatbot-app
docker-compose restart mongodb
docker-compose restart redis
```

#### 2. Database Recovery
```bash
# Restore from backup
mongorestore --uri="$MONGODB_URI" --drop /backup/latest/mongodb

# Check database integrity
mongo --eval "db.runCommand({dbStats: 1})"
```

#### 3. Scale Up Quickly
```bash
# Add more application instances
docker-compose up -d --scale chatbot-app=3

# Or deploy on additional servers
# Update load balancer configuration
```

### Log Analysis
```bash
# Find errors in logs
grep -r "ERROR" logs/
grep -r "security" logs/ | tail -20

# Monitor real-time logs
tail -f logs/combined.log | jq '.'

# Analyze performance logs
grep "performance" logs/combined.log | jq '.duration' | sort -n
```

## Conclusion

This deployment guide provides a comprehensive setup for a production-ready Yuki Chatbot system capable of handling 1000+ concurrent users. The configuration includes:

- **Scalable Architecture**: Microservices with load balancing capability
- **Security**: Multi-layered security with SSL, rate limiting, and input validation
- **Monitoring**: Comprehensive metrics and alerting system
- **High Availability**: Automated backups and recovery procedures
- **Performance**: Optimized for high throughput and low latency

For production deployment, always:
1. Test thoroughly in a staging environment first
2. Monitor all metrics during initial rollout
3. Have rollback procedures ready
4. Keep backups current and tested
5. Monitor security logs regularly

Contact the development team for additional support or custom deployment requirements.