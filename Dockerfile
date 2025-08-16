# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install Python and required build tools for ML service
RUN apk add --no-cache python3 py3-pip build-base python3-dev

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY ml-service/requirements.txt ./ml-service/

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Install Python dependencies
RUN pip3 install --no-cache-dir -r ml-service/requirements.txt

# Production stage
FROM node:18-alpine AS production

# Install Python runtime
RUN apk add --no-cache python3 py3-pip

WORKDIR /app

# Copy dependencies from base stage
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /usr/lib/python3.11/site-packages /usr/lib/python3.11/site-packages

# Copy application files
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S chatbot -u 1001 -G nodejs

# Change ownership of app directory
RUN chown -R chatbot:nodejs /app

# Switch to non-root user
USER chatbot

# Expose ports
EXPOSE 3001 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').request('http://localhost:3001/health', {timeout: 2000}, (res) => { \
        if(res.statusCode === 200) process.exit(0); else process.exit(1); \
    }).on('error', () => process.exit(1)).end()"

# Start both services
CMD ["npm", "run", "start:services"]