#!/usr/bin/env node
/**
 * Service Manager for Yuki Chatbot
 * Starts both Express.js server and ML service together
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class ServiceManager {
  constructor() {
    this.services = new Map();
    this.isShuttingDown = false;
    
    // Setup graceful shutdown
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('SIGTERM', () => this.gracefulShutdown());
  }

  async startService(name, command, args = [], options = {}) {
    console.log(`🚀 Starting ${name}...`);
    
    const service = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
      env: { ...process.env, ...options.env },
      ...options
    });

    // Store service reference
    this.services.set(name, service);

    // Handle service output
    service.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[${name}] ${output}`);
      }
    });

    service.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.error(`[${name}] ❌ ${output}`);
      }
    });

    // Handle service exit
    service.on('close', (code) => {
      if (!this.isShuttingDown) {
        console.log(`[${name}] Process exited with code ${code}`);
        if (code !== 0) {
          console.error(`[${name}] ❌ Service crashed! Exit code: ${code}`);
        }
      }
      this.services.delete(name);
    });

    service.on('error', (err) => {
      console.error(`[${name}] ❌ Failed to start: ${err.message}`);
      this.services.delete(name);
    });

    return service;
  }

  async checkPythonVirtualEnv() {
    const mlServicePath = path.join(process.cwd(), 'ml-service');
    const venvPath = path.join(mlServicePath, 'ml-env');
    const activateScript = path.join(venvPath, 'bin', 'activate');
    
    if (!fs.existsSync(venvPath) || !fs.existsSync(activateScript)) {
      console.log('🔧 Python virtual environment not found. Creating...');
      
      // Create virtual environment
      const createVenv = spawn('python3', ['-m', 'venv', 'ml-env'], {
        stdio: 'inherit',
        cwd: mlServicePath
      });

      await new Promise((resolve, reject) => {
        createVenv.on('close', (code) => {
          if (code === 0) {
            console.log('✅ Virtual environment created successfully');
            resolve();
          } else {
            reject(new Error(`Failed to create virtual environment. Exit code: ${code}`));
          }
        });
      });

      // Install requirements
      console.log('📦 Installing Python dependencies...');
      const pipInstall = spawn('ml-env/bin/pip', ['install', '-r', 'requirements.txt'], {
        stdio: 'inherit',
        cwd: mlServicePath
      });

      await new Promise((resolve, reject) => {
        pipInstall.on('close', (code) => {
          if (code === 0) {
            console.log('✅ Python dependencies installed successfully');
            resolve();
          } else {
            reject(new Error(`Failed to install dependencies. Exit code: ${code}`));
          }
        });
      });
    }
  }

  async checkRequiredFiles() {
    const mlServicePath = path.join(process.cwd(), 'ml-service');
    const requiredFiles = ['nlp_service.py', 'model.pkl', 'vectorizer.pkl', 'requirements.txt'];
    const missingFiles = [];

    for (const file of requiredFiles) {
      if (!fs.existsSync(path.join(mlServicePath, file))) {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length > 0) {
      throw new Error(`Missing required files in ml-service/: ${missingFiles.join(', ')}`);
    }
  }

  async start() {
    try {
      console.log('🔍 Checking required files...');
      await this.checkRequiredFiles();

      console.log('🐍 Setting up Python environment...');
      await this.checkPythonVirtualEnv();

      // Get ports from environment variables
      const expressPort = process.env.PORT || 3001;
      const mlPort = process.env.ML_SERVICE_PORT || 5000;

      console.log(`📡 Express.js server will run on port ${expressPort}`);
      console.log(`🤖 ML service will run on port ${mlPort}`);

      // Start Express.js server
      await this.startService('express-server', process.execPath, ['server.js'], {
        env: { PORT: expressPort }
      });

      // Wait a bit for Express server to start
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Start ML service
      await this.startService('ml-service', 'ml-service/ml-env/bin/python', ['ml-service/nlp_service.py'], {
        env: { 
          ML_SERVICE_PORT: mlPort,
          API_BASE_URL: `http://localhost:${expressPort}/api`
        }
      });

      console.log('\n🎉 All services started successfully!');
      console.log(`📊 Express.js API: http://localhost:${expressPort}`);
      console.log(`🤖 ML Service: http://localhost:${mlPort}`);
      console.log(`📚 API Documentation: http://localhost:${expressPort}/swagger.yaml`);
      console.log('\nPress Ctrl+C to stop all services\n');

    } catch (error) {
      console.error('❌ Failed to start services:', error.message);
      await this.gracefulShutdown();
      process.exit(1);
    }
  }

  async gracefulShutdown() {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    console.log('\n🛑 Shutting down services...');

    const shutdownPromises = [];

    for (const [name, service] of this.services) {
      console.log(`🔻 Stopping ${name}...`);
      
      const promise = new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.log(`⚠️  Force killing ${name}...`);
          service.kill('SIGKILL');
          resolve();
        }, 5000);

        service.on('close', () => {
          clearTimeout(timeout);
          console.log(`✅ ${name} stopped`);
          resolve();
        });
      });

      service.kill('SIGTERM');
      shutdownPromises.push(promise);
    }

    await Promise.all(shutdownPromises);
    console.log('✅ All services stopped gracefully');
    process.exit(0);
  }
}

// Start the service manager
if (require.main === module) {
  const manager = new ServiceManager();
  manager.start().catch((error) => {
    console.error('❌ Service manager failed:', error);
    process.exit(1);
  });
}

module.exports = ServiceManager;