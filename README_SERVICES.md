# 🚀 Integrated Services Setup

This setup allows you to run both the Express.js server and ML service together with a single command.

## Quick Start

### 1. Install Dependencies
```bash
# Install Node.js dependencies
npm install

# Setup Python environment and install ML dependencies
npm run setup:ml
```

### 2. Configure Environment
```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your configuration
nano .env
```

### 3. Start All Services
```bash
# Start both Express.js server and ML service together
npm run start:services
```

This will automatically:
- ✅ Check for required ML files (model.pkl, vectorizer.pkl, requirements.txt)
- ✅ Create Python virtual environment if needed
- ✅ Install Python dependencies
- ✅ Start Express.js server on configured port (default: 3001)
- ✅ Start ML service on configured port (default: 5000)
- ✅ Handle graceful shutdown of both services

## Individual Service Commands

```bash
# Start only Express.js server
npm start

# Start only ML service (requires setup first)
npm run start:ml

# Setup ML environment manually
npm run setup:ml
```

## Environment Configuration

The services read configuration from environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Express.js server port |
| `ML_SERVICE_PORT` | 5000 | ML service port |
| `API_BASE_URL` | http://localhost:3001/api | API base URL for ML service |
| `MONGODB_URI` | mongodb://localhost:27017/yuki-chatbot | Database connection |

## Service URLs

Once started, the services will be available at:
- 📊 **Express.js API**: http://localhost:3001
- 🤖 **ML Service**: http://localhost:5000
- 📚 **API Documentation**: http://localhost:3001/swagger.yaml

## Health Checks

```bash
# Check Express.js server
curl http://localhost:3001/health

# Check ML service
curl http://localhost:5000/health
```

## Testing ML Integration

```bash
# Test intent prediction
curl -X POST http://localhost:5000/predict \
  -H "Content-Type: application/json" \
  -d '{"message": "Search for laptop"}'
```

## Stopping Services

Press `Ctrl+C` to gracefully stop both services. The service manager will:
1. Send SIGTERM to both processes
2. Wait for graceful shutdown (5 seconds timeout)
3. Force kill if necessary
4. Clean up resources

## Troubleshooting

### Port Already in Use
```bash
# Check what's using the port
lsof -i :3001
lsof -i :5000

# Kill processes if needed
kill -9 <PID>
```

### Python Environment Issues
```bash
# Remove and recreate ML environment
rm -rf ml-service/ml-env
npm run setup:ml
```

### Missing ML Files
Make sure these files exist in the `ml-service/` folder:
- `ml-service/nlp_service.py`
- `ml-service/model.pkl`
- `ml-service/vectorizer.pkl`
- `ml-service/requirements.txt`

### Service Crashes
Check the console output for error messages. Each service is prefixed with its name:
- `[express-server]` - Express.js server logs
- `[ml-service]` - ML service logs

## Production Deployment

For production, consider using a process manager like PM2:

```bash
# Install PM2
npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'chatbot-services',
      script: 'start-services.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        ML_SERVICE_PORT: 5000
      }
    }
  ]
}
EOF

# Start with PM2
pm2 start ecosystem.config.js
```