---
title: "Debugging and Troubleshooting Guide"
description: "Comprehensive guide for debugging and troubleshooting the Docker On-Demand system"
audience: ["developers", "contributors"]
last_updated: "2025-01-23"
version: "1.0.0"
related_docs:
  - "setup.md"
  - "testing.md"
  - "coding-standards.md"
---

# Debugging and Troubleshooting Guide

This guide provides comprehensive debugging techniques and solutions for common issues in the Docker On-Demand system.

## Development Environment Debugging

### IDE Setup for Debugging

#### Visual Studio Code Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Development Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/ts-node",
      "args": ["src/index.ts"],
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "ephemeral:*"
      },
      "console": "integratedTerminal",
      "restart": true,
      "runtimeArgs": ["--nolazy"],
      "sourceMaps": true,
      "outFiles": ["${workspaceFolder}/dist/**/*.js"]
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/vitest",
      "args": ["run", "--reporter=verbose"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "env": {
        "NODE_ENV": "test"
      }
    },
    {
      "name": "Debug Specific Test",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/vitest",
      "args": ["run", "${fileBasenameNoExtension}", "--reporter=verbose"],
      "console": "integratedTerminal",
      "cwd": "${workspaceFolder}"
    }
  ]
}
```

#### Debugging TypeScript

1. **Set Breakpoints**: Click in the gutter next to line numbers
2. **Start Debugging**: Press F5 or use Debug menu
3. **Step Through Code**: Use F10 (step over), F11 (step into), Shift+F11 (step out)
4. **Inspect Variables**: Hover over variables or use Debug Console

### Command Line Debugging

#### Node.js Inspector

```bash
# Start with inspector
node --inspect-brk dist/index.js

# Start development server with inspector
node --inspect-brk node_modules/.bin/ts-node src/index.ts

# Debug tests
node --inspect-brk node_modules/.bin/vitest run
```

Then open Chrome and navigate to `chrome://inspect`

#### Debug Logging

Enable debug logging with environment variables:

```bash
# Enable all debug logs
DEBUG=* npm run dev

# Enable specific module logs
DEBUG=ephemeral:* npm run dev

# Enable container manager logs only
DEBUG=ephemeral:container-manager npm run dev
```

## Application Debugging

### Logging System

The application uses structured logging through the Logger utility:

```typescript
import { Logger } from '../utils/Logger.js';

const logger = Logger.getInstance();

// Different log levels
logger.debug('ComponentName', 'Debug message', { data: 'value' });
logger.info('ComponentName', 'Info message', { data: 'value' });
logger.warn('ComponentName', 'Warning message', { data: 'value' });
logger.error('ComponentName', 'Error message', error, { data: 'value' });

// Container-specific logging
logger.logContainerOperation('create', containerId, true, {
  dockerId: 'docker-123',
  port: 8000,
  image: 'nginx:alpine'
});
```

### Debug Environment Variables

```bash
# .env.debug
NODE_ENV=development
DEBUG=ephemeral:*
LOG_LEVEL=debug

# Docker debugging
DOCKER_SOCKET_PATH=/var/run/docker.sock
DOCKER_DEBUG=true

# API debugging
API_PORT=3000
API_HOST=localhost
API_DEBUG=true

# Cleanup debugging (longer intervals for debugging)
CLEANUP_INTERVAL=60
CLEANUP_INACTIVITY_TIMEOUT=300
```

### Performance Debugging

#### Memory Usage Monitoring

```typescript
// Add to your debugging code
function logMemoryUsage(label: string) {
  const usage = process.memoryUsage();
  console.log(`Memory Usage [${label}]:`, {
    rss: `${Math.round(usage.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(usage.external / 1024 / 1024)} MB`
  });
}

// Usage
logMemoryUsage('Before container creation');
await containerManager.createContainer(request);
logMemoryUsage('After container creation');
```

#### CPU Profiling

```bash
# Start with CPU profiling
node --prof dist/index.js

# Generate readable profile
node --prof-process isolate-*.log > profile.txt
```

#### Async Stack Traces

```bash
# Enable long stack traces
node --async-stack-traces dist/index.js
```

## Docker-Related Debugging

### Docker Connection Issues

#### Check Docker Daemon Status

```bash
# Check if Docker daemon is running
docker info

# Check Docker socket permissions
ls -la /var/run/docker.sock

# Test Docker API directly
curl --unix-socket /var/run/docker.sock http://localhost/version
```

#### Docker Socket Debugging

```typescript
// Add to ContainerManager constructor for debugging
constructor(configManager?: ConfigManager) {
  this.config = configManager ? configManager.getConfig() : ConfigManager.getInstance().getConfig();
  
  // Debug Docker connection
  console.log('Docker socket path:', this.config.docker.socketPath);
  
  this.docker = new Docker({
    socketPath: this.config.docker.socketPath
  });
  
  // Test connection immediately
  this.docker.ping()
    .then(() => console.log('Docker connection successful'))
    .catch(error => console.error('Docker connection failed:', error));
}
```

### Container Debugging

#### Inspect Container State

```typescript
// Debug helper function
async function debugContainer(containerId: string) {
  try {
    const container = await containerManager.getContainer(containerId);
    if (!container) {
      console.log(`Container ${containerId} not found in manager`);
      return;
    }
    
    console.log('Container state:', {
      id: container.id,
      dockerId: container.dockerId,
      status: container.status,
      image: container.image,
      createdAt: container.createdAt,
      lastActivity: container.lastActivity,
      connection: container.connection
    });
    
    // Check Docker state
    const dockerContainer = docker.getContainer(container.dockerId);
    const dockerInfo = await dockerContainer.inspect();
    
    console.log('Docker container state:', {
      id: dockerInfo.Id,
      state: dockerInfo.State,
      config: dockerInfo.Config,
      networkSettings: dockerInfo.NetworkSettings
    });
    
  } catch (error) {
    console.error('Debug container failed:', error);
  }
}
```

#### Container Logs

```bash
# View container logs directly
docker logs <container-id>

# Follow container logs
docker logs -f <container-id>

# View logs with timestamps
docker logs -t <container-id>
```

```typescript
// Get container logs programmatically
async function getContainerLogs(dockerId: string) {
  const container = docker.getContainer(dockerId);
  const logs = await container.logs({
    stdout: true,
    stderr: true,
    timestamps: true,
    tail: 100
  });
  
  console.log('Container logs:', logs.toString());
}
```

### Port Allocation Debugging

```typescript
// Debug port allocation
class ContainerManager {
  private debugPortAllocation() {
    console.log('Port allocation debug:', {
      portRange: this.config.docker.portRange,
      usedPorts: Array.from(this.usedPorts),
      availablePorts: this.getAvailablePorts(),
      activeContainers: this.containers.size
    });
  }
  
  private getAvailablePorts(): number[] {
    const { start, end } = this.config.docker.portRange;
    const available = [];
    
    for (let port = start; port <= end; port++) {
      if (!this.usedPorts.has(port)) {
        available.push(port);
      }
    }
    
    return available;
  }
}
```

## API Debugging

### Request/Response Debugging

#### Express Middleware for Debugging

```typescript
// Add to ApiServer.setupMiddleware()
private setupMiddleware(): void {
  // Debug middleware (only in development)
  if (process.env.NODE_ENV === 'development') {
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
        headers: req.headers,
        body: req.body,
        query: req.query,
        params: req.params
      });
      
      // Log response
      const originalSend = res.send;
      res.send = function(body) {
        console.log(`[${new Date().toISOString()}] Response ${res.statusCode}:`, body);
        return originalSend.call(this, body);
      };
      
      next();
    });
  }
  
  // ... rest of middleware setup
}
```

#### API Testing with curl

```bash
# Test health endpoint
curl -v http://localhost:3000/health

# Test container creation
curl -v -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d '{"image": "nginx:alpine", "environment": {"TEST": "debug"}}'

# Test with invalid JSON
curl -v -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d 'invalid json'

# Test non-existent endpoint
curl -v http://localhost:3000/nonexistent
```

### Error Response Debugging

```typescript
// Enhanced error handling middleware
private errorHandlingMiddleware(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Debug logging
  console.error('API Error Debug:', {
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    },
    request: {
      method: req.method,
      path: req.path,
      headers: req.headers,
      body: req.body,
      query: req.query
    },
    timestamp: new Date().toISOString()
  });
  
  // ... rest of error handling
}
```

## Service Layer Debugging

### Activity Monitor Debugging

```typescript
// Debug activity monitoring
class ActivityMonitor {
  startMonitoring(containerId: string, dockerId: string): void {
    console.log(`Starting monitoring for container ${containerId} (${dockerId})`);
    
    // ... existing implementation
    
    // Debug periodic check
    const interval = setInterval(() => {
      const record = this.activityRecords.get(containerId);
      if (record) {
        console.log(`Activity check for ${containerId}:`, {
          lastActivity: record.lastActivity,
          activityCount: record.activities.length,
          isActive: this.isContainerActive(containerId)
        });
      }
    }, 30000); // Every 30 seconds
    
    this.monitoringIntervals.set(containerId, interval);
  }
}
```

### Cleanup Scheduler Debugging

```typescript
// Debug cleanup operations
class CleanupScheduler {
  private async performCleanup(): Promise<void> {
    console.log('Starting cleanup cycle:', {
      timestamp: new Date().toISOString(),
      activeContainers: this.containerManager.getActiveContainerCount(),
      inactivityTimeout: this.config.cleanup.inactivityTimeout
    });
    
    const containers = await this.containerManager.listContainers();
    const inactiveContainers = [];
    
    for (const container of containers) {
      const lastActivity = this.activityMonitor.getLastActivity(container.id);
      const inactiveTime = lastActivity ? Date.now() - lastActivity.getTime() : 0;
      
      console.log(`Container ${container.id} activity check:`, {
        lastActivity: lastActivity?.toISOString(),
        inactiveTime: `${Math.round(inactiveTime / 1000)}s`,
        threshold: `${this.config.cleanup.inactivityTimeout}s`,
        willCleanup: inactiveTime > this.config.cleanup.inactivityTimeout * 1000
      });
      
      if (inactiveTime > this.config.cleanup.inactivityTimeout * 1000) {
        inactiveContainers.push(container);
      }
    }
    
    console.log(`Cleanup summary: ${inactiveContainers.length} containers to remove`);
    
    // ... rest of cleanup logic
  }
}
```

## Common Issues and Solutions

### Docker Daemon Issues

#### Issue: "Docker connection failed: connect ENOENT /var/run/docker.sock"

**Diagnosis:**
```bash
# Check if Docker daemon is running
systemctl status docker  # Linux
brew services list | grep docker  # macOS

# Check socket permissions
ls -la /var/run/docker.sock

# Test socket connectivity
docker ps
```

**Solutions:**
1. Start Docker daemon:
   ```bash
   # Linux
   sudo systemctl start docker
   
   # macOS
   open -a Docker
   ```

2. Fix permissions:
   ```bash
   # Add user to docker group (Linux)
   sudo usermod -aG docker $USER
   newgrp docker
   ```

3. Check socket path in configuration:
   ```bash
   # Update .env file
   DOCKER_SOCKET_PATH=/var/run/docker.sock
   ```

#### Issue: "Permission denied while trying to connect to Docker daemon"

**Diagnosis:**
```bash
# Check current user groups
groups

# Check Docker socket ownership
ls -la /var/run/docker.sock
```

**Solutions:**
1. Add user to docker group:
   ```bash
   sudo usermod -aG docker $USER
   ```

2. Restart terminal/IDE after group changes

3. Use sudo temporarily (not recommended for development):
   ```bash
   sudo npm run dev
   ```

### Port Allocation Issues

#### Issue: "No available ports in range"

**Diagnosis:**
```typescript
// Add debug logging to port allocation
private allocatePort(): number {
  const { start, end } = this.config.docker.portRange;
  
  console.log('Port allocation debug:', {
    range: `${start}-${end}`,
    usedPorts: Array.from(this.usedPorts),
    availableCount: (end - start + 1) - this.usedPorts.size
  });
  
  // ... rest of allocation logic
}
```

**Solutions:**
1. Expand port range:
   ```bash
   # In .env
   DOCKER_PORT_RANGE_START=8000
   DOCKER_PORT_RANGE_END=9000
   ```

2. Clean up unused containers:
   ```bash
   # Remove all containers
   docker container prune -f
   
   # Or restart the application to reset port tracking
   ```

3. Check for port conflicts:
   ```bash
   # Check what's using ports in range
   netstat -tulpn | grep :800
   lsof -i :8000-8010
   ```

### Memory Leaks

#### Issue: Application memory usage keeps growing

**Diagnosis:**
```typescript
// Add memory monitoring
setInterval(() => {
  const usage = process.memoryUsage();
  console.log('Memory usage:', {
    rss: `${Math.round(usage.rss / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
    containers: containerManager.getActiveContainerCount(),
    monitoringIntervals: activityMonitor.getActiveMonitoringCount()
  });
}, 30000);
```

**Solutions:**
1. Check for uncleaned intervals:
   ```typescript
   // Ensure intervals are cleared
   clearInterval(intervalId);
   ```

2. Remove event listeners:
   ```typescript
   // Clean up event listeners
   emitter.removeAllListeners();
   ```

3. Clear maps and sets:
   ```typescript
   // In cleanup methods
   this.containers.clear();
   this.usedPorts.clear();
   this.activityRecords.clear();
   ```

### Container Creation Failures

#### Issue: "Failed to create container: Image not found"

**Diagnosis:**
```bash
# Check if image exists locally
docker images | grep nginx

# Try pulling image manually
docker pull nginx:alpine
```

**Solutions:**
1. Pull image before use:
   ```bash
   docker pull nginx:alpine
   ```

2. Use existing local image:
   ```bash
   # List available images
   docker images
   
   # Update .env with available image
   DOCKER_DEFAULT_IMAGE=alpine:latest
   ```

3. Check image name spelling and tag

#### Issue: "Container starts but immediately stops"

**Diagnosis:**
```bash
# Check container logs
docker logs <container-id>

# Check container exit code
docker ps -a
```

**Solutions:**
1. Use images with long-running processes:
   ```json
   {
     "image": "nginx:alpine"  // Good - runs nginx daemon
   }
   ```

2. Add command to keep container running:
   ```typescript
   const containerConfig = {
     Image: image,
     Cmd: ['tail', '-f', '/dev/null'],  // Keep container alive
     // ... rest of config
   };
   ```

### API Response Issues

#### Issue: "Request timeout" or slow responses

**Diagnosis:**
```typescript
// Add timing middleware
this.app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${duration}ms`);
  });
  
  next();
});
```

**Solutions:**
1. Add request timeouts:
   ```typescript
   // In Express setup
   this.app.use(timeout('30s'));
   ```

2. Optimize Docker operations:
   ```typescript
   // Use connection pooling or caching
   // Implement retry logic with exponential backoff
   ```

3. Add response streaming for large data

### Testing Issues

#### Issue: Tests fail intermittently

**Diagnosis:**
- Check for race conditions
- Look for shared state between tests
- Verify proper cleanup in `afterEach`

**Solutions:**
1. Use proper test isolation:
   ```typescript
   beforeEach(() => {
     containerManager.clear();
     vi.clearAllMocks();
   });
   ```

2. Add delays for async operations:
   ```typescript
   await new Promise(resolve => setTimeout(resolve, 100));
   ```

3. Use deterministic test data:
   ```typescript
   // Instead of random data
   const testId = 'test-container-123';
   ```

## Performance Debugging

### Profiling Tools

#### Node.js Built-in Profiler

```bash
# CPU profiling
node --prof dist/index.js

# Generate readable profile
node --prof-process isolate-*.log > profile.txt
```

#### Memory Profiling

```bash
# Heap snapshot
node --inspect dist/index.js
# Then use Chrome DevTools Memory tab
```

#### Third-party Tools

```bash
# Install clinic.js
npm install -g clinic

# CPU profiling
clinic doctor -- node dist/index.js

# Memory profiling
clinic heapprofiler -- node dist/index.js

# Event loop monitoring
clinic bubbleprof -- node dist/index.js
```

### Performance Monitoring

```typescript
// Add performance monitoring
class PerformanceMonitor {
  private static timers = new Map<string, number>();
  
  static start(label: string): void {
    this.timers.set(label, Date.now());
  }
  
  static end(label: string): number {
    const start = this.timers.get(label);
    if (!start) return 0;
    
    const duration = Date.now() - start;
    console.log(`Performance [${label}]: ${duration}ms`);
    this.timers.delete(label);
    return duration;
  }
}

// Usage
PerformanceMonitor.start('container-creation');
const container = await containerManager.createContainer(request);
PerformanceMonitor.end('container-creation');
```

## Log Analysis

### Structured Logging

```typescript
// Use consistent log structure
logger.info('ContainerManager', 'Container operation', {
  operation: 'create',
  containerId: 'abc123',
  image: 'nginx:alpine',
  duration: 1500,
  success: true,
  timestamp: new Date().toISOString()
});
```

### Log Aggregation

```bash
# Filter logs by component
grep "ContainerManager" application.log

# Filter by operation
grep "Container operation" application.log | grep "create"

# Extract timing information
grep "duration" application.log | awk '{print $NF}'
```

### Log Analysis Tools

```bash
# Install jq for JSON log parsing
brew install jq  # macOS
apt-get install jq  # Ubuntu

# Parse JSON logs
cat application.log | jq '.timestamp, .message, .metadata'

# Filter by log level
cat application.log | jq 'select(.level == "error")'
```

## Debugging Checklist

### Before Starting Development
- [ ] Docker daemon is running
- [ ] Environment variables are set correctly
- [ ] Dependencies are installed
- [ ] Tests pass locally

### When Encountering Issues
- [ ] Check application logs
- [ ] Verify Docker connectivity
- [ ] Test API endpoints manually
- [ ] Check resource usage (memory, CPU)
- [ ] Review recent code changes

### Performance Issues
- [ ] Profile CPU usage
- [ ] Monitor memory consumption
- [ ] Check for memory leaks
- [ ] Analyze slow operations
- [ ] Review database/Docker API calls

### Production Debugging
- [ ] Check system resources
- [ ] Review error logs
- [ ] Monitor container health
- [ ] Verify network connectivity
- [ ] Check disk space

This debugging guide should help developers quickly identify and resolve issues in the Docker On-Demand system. Remember to always start with the logs and work systematically through potential causes.