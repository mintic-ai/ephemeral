---
title: "JavaScript API Examples"
description: "Node.js and browser JavaScript examples for API integration"
audience: ["developers", "frontend-developers", "nodejs-developers"]
last_updated: "2025-01-23"
version: "1.0.0"
related_docs:
  - "../endpoints.md"
  - "curl-examples.md"
  - "../README.md"
---

# JavaScript API Examples

This document provides comprehensive JavaScript examples for integrating with the Docker On-Demand API. Examples include both Node.js server-side and browser client-side implementations.

## Prerequisites

- Node.js 16+ (for Node.js examples)
- Modern browser with fetch API support (for browser examples)
- Docker On-Demand system running on `http://localhost:3000`

## Installation

For Node.js examples, you may want to install additional packages:

```bash
npm install node-fetch axios  # Optional: for older Node.js versions or axios preference
```

## Base Configuration

```javascript
// Configuration
const API_BASE_URL = 'http://localhost:3000';
const API_TIMEOUT = 30000; // 30 seconds

// Helper function for API requests
class DockerOnDemandClient {
  constructor(baseUrl = API_BASE_URL, timeout = API_TIMEOUT) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers
      },
      ...options
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${data.error?.message || 'Unknown error'}`);
      }
      
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }
}
```

---

## Health Check Examples

### Basic Health Check

```javascript
// Node.js/Browser compatible
async function checkHealth() {
  try {
    const client = new DockerOnDemandClient();
    const response = await client.request('/health');
    
    console.log('System Status:', response.data.status);
    console.log('Active Containers:', response.data.containers.active);
    console.log('Docker Version:', response.data.docker.version);
    
    return response.data;
  } catch (error) {
    console.error('Health check failed:', error.message);
    throw error;
  }
}

// Usage
checkHealth()
  .then(health => console.log('System is healthy:', health))
  .catch(error => console.error('System health check failed:', error));
```

### Advanced Health Monitoring

```javascript
class HealthMonitor {
  constructor(client, interval = 30000) {
    this.client = client;
    this.interval = interval;
    this.isMonitoring = false;
    this.listeners = [];
  }

  onHealthChange(callback) {
    this.listeners.push(callback);
  }

  async startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('Starting health monitoring...');
    
    while (this.isMonitoring) {
      try {
        const response = await this.client.request('/health');
        const health = response.data;
        
        // Notify listeners
        this.listeners.forEach(callback => callback(health, null));
        
        // Wait for next check
        await new Promise(resolve => setTimeout(resolve, this.interval));
      } catch (error) {
        console.error('Health check error:', error.message);
        this.listeners.forEach(callback => callback(null, error));
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.interval));
      }
    }
  }

  stopMonitoring() {
    this.isMonitoring = false;
    console.log('Health monitoring stopped');
  }
}

// Usage
const client = new DockerOnDemandClient();
const monitor = new HealthMonitor(client, 10000); // Check every 10 seconds

monitor.onHealthChange((health, error) => {
  if (error) {
    console.error('System unhealthy:', error.message);
  } else {
    console.log(`System healthy - ${health.containers.active} containers active`);
  }
});

// monitor.startMonitoring();
```

---

## Container Management Examples

### Create Container

```javascript
async function createContainer(config = {}) {
  try {
    const client = new DockerOnDemandClient();
    const response = await client.request('/containers', {
      method: 'POST',
      body: JSON.stringify(config)
    });
    
    const container = response.data;
    console.log('Container created:', container.id);
    console.log('Access URL:', container.connection.url);
    
    return container;
  } catch (error) {
    console.error('Failed to create container:', error.message);
    throw error;
  }
}

// Usage examples
createContainer(); // Default container

createContainer({
  image: 'nginx:alpine',
  environment: {
    NGINX_HOST: 'localhost',
    NGINX_PORT: '80'
  }
});

createContainer({
  image: 'node:18-alpine',
  environment: {
    NODE_ENV: 'development',
    PORT: '3000',
    DEBUG: 'true'
  },
  ports: [3000, 3001]
});
```

### Container Builder Pattern

```javascript
class ContainerBuilder {
  constructor() {
    this.config = {};
  }

  image(imageName) {
    this.config.image = imageName;
    return this;
  }

  env(key, value) {
    if (!this.config.environment) {
      this.config.environment = {};
    }
    this.config.environment[key] = value;
    return this;
  }

  envs(envObject) {
    this.config.environment = { ...this.config.environment, ...envObject };
    return this;
  }

  ports(...portNumbers) {
    this.config.ports = portNumbers;
    return this;
  }

  async create(client) {
    const response = await client.request('/containers', {
      method: 'POST',
      body: JSON.stringify(this.config)
    });
    return response.data;
  }
}

// Usage
const client = new DockerOnDemandClient();

const container = await new ContainerBuilder()
  .image('nginx:alpine')
  .env('NGINX_HOST', 'localhost')
  .env('NGINX_PORT', '80')
  .ports(80, 443)
  .create(client);

console.log('Created container:', container.id);
```

### List Containers

```javascript
async function listContainers(filters = {}) {
  try {
    const client = new DockerOnDemandClient();
    const response = await client.request('/containers');
    
    let containers = response.data;
    
    // Apply client-side filters
    if (filters.status) {
      containers = containers.filter(c => c.status === filters.status);
    }
    
    if (filters.image) {
      containers = containers.filter(c => c.image.includes(filters.image));
    }
    
    console.log(`Found ${containers.length} containers`);
    containers.forEach(container => {
      console.log(`- ${container.id}: ${container.status} (${container.image})`);
    });
    
    return containers;
  } catch (error) {
    console.error('Failed to list containers:', error.message);
    throw error;
  }
}

// Usage
listContainers(); // All containers
listContainers({ status: 'running' }); // Only running containers
listContainers({ image: 'nginx' }); // Only nginx containers
```

### Get Container Details

```javascript
async function getContainer(containerId) {
  try {
    const client = new DockerOnDemandClient();
    const response = await client.request(`/containers/${containerId}`);
    
    const container = response.data;
    console.log('Container Details:');
    console.log('- ID:', container.id);
    console.log('- Status:', container.status);
    console.log('- Image:', container.image);
    console.log('- URL:', container.connection.url);
    console.log('- Created:', new Date(container.created_at).toLocaleString());
    console.log('- Last Activity:', new Date(container.last_activity).toLocaleString());
    
    return container;
  } catch (error) {
    console.error('Failed to get container:', error.message);
    throw error;
  }
}

// Usage
getContainer('container_1706012345678_abc123');
```

### Delete Container

```javascript
async function deleteContainer(containerId, confirm = false) {
  if (!confirm) {
    throw new Error('Container deletion requires explicit confirmation');
  }
  
  try {
    const client = new DockerOnDemandClient();
    const response = await client.request(`/containers/${containerId}`, {
      method: 'DELETE'
    });
    
    console.log('Container deleted:', response.data.message);
    return response.data;
  } catch (error) {
    console.error('Failed to delete container:', error.message);
    throw error;
  }
}

// Usage
deleteContainer('container_1706012345678_abc123', true);
```

---

## Advanced Examples

### Container Lifecycle Management

```javascript
class ContainerManager {
  constructor(client) {
    this.client = client;
    this.containers = new Map();
  }

  async createAndTrack(config, name) {
    try {
      const container = await this.client.request('/containers', {
        method: 'POST',
        body: JSON.stringify(config)
      });
      
      this.containers.set(name || container.data.id, container.data);
      console.log(`Container '${name}' created: ${container.data.id}`);
      
      return container.data;
    } catch (error) {
      console.error(`Failed to create container '${name}':`, error.message);
      throw error;
    }
  }

  async waitForReady(containerId, maxWaitTime = 30000, checkInterval = 1000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await this.client.request(`/containers/${containerId}`);
        const container = response.data;
        
        if (container.status === 'running') {
          // Test connectivity
          try {
            const testResponse = await fetch(container.connection.url, {
              method: 'HEAD',
              timeout: 5000
            });
            if (testResponse.ok) {
              console.log(`Container ${containerId} is ready and accessible`);
              return container;
            }
          } catch (connectError) {
            // Container not yet accessible, continue waiting
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      } catch (error) {
        console.error(`Error checking container status:`, error.message);
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
    }
    
    throw new Error(`Container ${containerId} did not become ready within ${maxWaitTime}ms`);
  }

  async cleanupAll() {
    const deletePromises = Array.from(this.containers.values()).map(async (container) => {
      try {
        await this.client.request(`/containers/${container.id}`, {
          method: 'DELETE'
        });
        console.log(`Cleaned up container: ${container.id}`);
      } catch (error) {
        console.error(`Failed to cleanup container ${container.id}:`, error.message);
      }
    });
    
    await Promise.all(deletePromises);
    this.containers.clear();
    console.log('All containers cleaned up');
  }

  getTrackedContainers() {
    return Array.from(this.containers.values());
  }
}

// Usage
const client = new DockerOnDemandClient();
const manager = new ContainerManager(client);

async function exampleWorkflow() {
  try {
    // Create containers
    const webServer = await manager.createAndTrack({
      image: 'nginx:alpine',
      environment: { NGINX_HOST: 'localhost' }
    }, 'web-server');
    
    const apiServer = await manager.createAndTrack({
      image: 'node:18-alpine',
      environment: { NODE_ENV: 'development' }
    }, 'api-server');
    
    // Wait for containers to be ready
    await manager.waitForReady(webServer.id);
    await manager.waitForReady(apiServer.id);
    
    console.log('All containers are ready!');
    
    // Do work with containers...
    
    // Cleanup
    await manager.cleanupAll();
  } catch (error) {
    console.error('Workflow failed:', error.message);
    await manager.cleanupAll(); // Cleanup on error
  }
}
```

### Error Handling and Retry Logic

```javascript
class ApiClient {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.timeout = options.timeout || 30000;
  }

  async requestWithRetry(endpoint, options = {}, retryCount = 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers
        }
      });
      
      clearTimeout(timeoutId);
      
      const data = await response.json();
      
      if (!response.ok) {
        const error = new Error(data.error?.message || `HTTP ${response.status}`);
        error.status = response.status;
        error.code = data.error?.code;
        error.details = data.error?.details;
        throw error;
      }
      
      return data;
    } catch (error) {
      // Determine if we should retry
      const shouldRetry = this.shouldRetry(error, retryCount);
      
      if (shouldRetry) {
        console.warn(`Request failed, retrying (${retryCount + 1}/${this.maxRetries}):`, error.message);
        await this.delay(this.retryDelay * Math.pow(2, retryCount)); // Exponential backoff
        return this.requestWithRetry(endpoint, options, retryCount + 1);
      }
      
      throw error;
    }
  }

  shouldRetry(error, retryCount) {
    if (retryCount >= this.maxRetries) return false;
    
    // Retry on network errors
    if (error.name === 'TypeError' || error.name === 'AbortError') return true;
    
    // Retry on specific HTTP status codes
    if (error.status >= 500 || error.status === 429) return true;
    
    // Retry on specific error codes
    if (error.code === 'SERVICE_UNAVAILABLE' || error.code === 'DOCKER_DAEMON_UNAVAILABLE') return true;
    
    return false;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage
const client = new ApiClient('http://localhost:3000', {
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 10000
});

async function robustContainerCreation(config) {
  try {
    const response = await client.requestWithRetry('/containers', {
      method: 'POST',
      body: JSON.stringify(config)
    });
    
    console.log('Container created successfully:', response.data.id);
    return response.data;
  } catch (error) {
    console.error('Failed to create container after retries:', error.message);
    throw error;
  }
}
```

---

## Browser-Specific Examples

### Fetch API with Error Handling

```javascript
// Browser-compatible API client
class BrowserApiClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers
        },
        ...options
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`${response.status}: ${data.error?.message || 'Request failed'}`);
      }

      return data;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error('Network error - check if the API server is running');
      }
      throw error;
    }
  }

  // Health check with UI update
  async checkHealthWithUI(statusElementId) {
    const statusElement = document.getElementById(statusElementId);
    
    try {
      statusElement.textContent = 'Checking...';
      statusElement.className = 'status checking';
      
      const response = await this.makeRequest('/health');
      const health = response.data;
      
      statusElement.textContent = `Healthy - ${health.containers.active} containers`;
      statusElement.className = 'status healthy';
      
      return health;
    } catch (error) {
      statusElement.textContent = `Error: ${error.message}`;
      statusElement.className = 'status error';
      throw error;
    }
  }

  // Create container with progress updates
  async createContainerWithProgress(config, progressCallback) {
    try {
      progressCallback('Creating container...');
      
      const response = await this.makeRequest('/containers', {
        method: 'POST',
        body: JSON.stringify(config)
      });
      
      const container = response.data;
      progressCallback(`Container created: ${container.id}`);
      
      // Wait for container to be ready
      progressCallback('Waiting for container to be ready...');
      await this.waitForContainerReady(container.id, progressCallback);
      
      progressCallback(`Container ready: ${container.connection.url}`);
      return container;
    } catch (error) {
      progressCallback(`Error: ${error.message}`);
      throw error;
    }
  }

  async waitForContainerReady(containerId, progressCallback, maxWait = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      try {
        const response = await this.makeRequest(`/containers/${containerId}`);
        const container = response.data;
        
        if (container.status === 'running') {
          // Test if container is accessible
          try {
            const testResponse = await fetch(container.connection.url, {
              method: 'HEAD',
              mode: 'no-cors' // Avoid CORS issues for testing
            });
            return container;
          } catch (e) {
            // Container not yet accessible
          }
        }
        
        progressCallback(`Container status: ${container.status}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        progressCallback(`Checking container status...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    throw new Error('Container did not become ready in time');
  }
}
```

### HTML Integration Example

```html
<!DOCTYPE html>
<html>
<head>
    <title>Docker On-Demand Dashboard</title>
    <style>
        .status.healthy { color: green; }
        .status.error { color: red; }
        .status.checking { color: orange; }
        .container-item { margin: 10px 0; padding: 10px; border: 1px solid #ccc; }
        .progress { margin: 10px 0; }
    </style>
</head>
<body>
    <h1>Docker On-Demand Dashboard</h1>
    
    <div>
        <h2>System Status</h2>
        <div id="system-status" class="status">Unknown</div>
        <button onclick="checkHealth()">Check Health</button>
    </div>
    
    <div>
        <h2>Create Container</h2>
        <form onsubmit="createContainer(event)">
            <input type="text" id="image-input" placeholder="Docker image (e.g., nginx:alpine)" />
            <button type="submit">Create Container</button>
        </form>
        <div id="create-progress" class="progress"></div>
    </div>
    
    <div>
        <h2>Containers</h2>
        <button onclick="loadContainers()">Refresh</button>
        <div id="containers-list"></div>
    </div>

    <script>
        const client = new BrowserApiClient();
        
        async function checkHealth() {
            await client.checkHealthWithUI('system-status');
        }
        
        async function createContainer(event) {
            event.preventDefault();
            const image = document.getElementById('image-input').value || 'nginx:alpine';
            const progressDiv = document.getElementById('create-progress');
            
            try {
                const container = await client.createContainerWithProgress(
                    { image },
                    (message) => progressDiv.textContent = message
                );
                
                // Refresh container list
                await loadContainers();
                
                // Clear form
                document.getElementById('image-input').value = '';
            } catch (error) {
                console.error('Failed to create container:', error);
            }
        }
        
        async function loadContainers() {
            const containersList = document.getElementById('containers-list');
            
            try {
                const response = await client.makeRequest('/containers');
                const containers = response.data;
                
                containersList.innerHTML = containers.map(container => `
                    <div class="container-item">
                        <strong>${container.id}</strong><br>
                        Status: ${container.status}<br>
                        Image: ${container.image}<br>
                        URL: <a href="${container.connection.url}" target="_blank">${container.connection.url}</a><br>
                        <button onclick="deleteContainer('${container.id}')">Delete</button>
                    </div>
                `).join('');
            } catch (error) {
                containersList.innerHTML = `<div class="error">Failed to load containers: ${error.message}</div>`;
            }
        }
        
        async function deleteContainer(containerId) {
            if (!confirm(`Delete container ${containerId}?`)) return;
            
            try {
                await client.makeRequest(`/containers/${containerId}`, {
                    method: 'DELETE'
                });
                
                await loadContainers(); // Refresh list
            } catch (error) {
                alert(`Failed to delete container: ${error.message}`);
            }
        }
        
        // Load initial data
        checkHealth();
        loadContainers();
    </script>
</body>
</html>
```

---

## Node.js Specific Examples

### Express.js Integration

```javascript
const express = require('express');
const app = express();

// Docker On-Demand client setup
const client = new DockerOnDemandClient();

app.use(express.json());

// Proxy endpoint to create containers
app.post('/api/containers', async (req, res) => {
  try {
    const container = await client.request('/containers', {
      method: 'POST',
      body: JSON.stringify(req.body)
    });
    
    res.status(201).json(container);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check proxy
app.get('/api/health', async (req, res) => {
  try {
    const health = await client.request('/health');
    res.json(health);
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.listen(4000, () => {
  console.log('Proxy server running on port 4000');
});
```

### CLI Tool Example

```javascript
#!/usr/bin/env node

const { program } = require('commander');

const client = new DockerOnDemandClient();

program
  .name('docker-ondemand-cli')
  .description('CLI for Docker On-Demand API')
  .version('1.0.0');

program
  .command('health')
  .description('Check system health')
  .action(async () => {
    try {
      const response = await client.request('/health');
      console.log('System Status:', response.data.status);
      console.log('Active Containers:', response.data.containers.active);
      console.log('Docker Version:', response.data.docker.version);
    } catch (error) {
      console.error('Health check failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('create')
  .description('Create a new container')
  .option('-i, --image <image>', 'Docker image to use')
  .option('-e, --env <key=value>', 'Environment variables', collect, [])
  .action(async (options) => {
    try {
      const config = {};
      
      if (options.image) {
        config.image = options.image;
      }
      
      if (options.env.length > 0) {
        config.environment = {};
        options.env.forEach(env => {
          const [key, value] = env.split('=');
          config.environment[key] = value;
        });
      }
      
      const response = await client.request('/containers', {
        method: 'POST',
        body: JSON.stringify(config)
      });
      
      console.log('Container created:', response.data.id);
      console.log('Access URL:', response.data.connection.url);
    } catch (error) {
      console.error('Failed to create container:', error.message);
      process.exit(1);
    }
  });

function collect(value, previous) {
  return previous.concat([value]);
}

program.parse();
```

## Testing Examples

### Jest Test Suite

```javascript
const { DockerOnDemandClient } = require('./docker-ondemand-client');

describe('Docker On-Demand API', () => {
  let client;
  let createdContainers = [];

  beforeAll(() => {
    client = new DockerOnDemandClient('http://localhost:3000');
  });

  afterAll(async () => {
    // Cleanup created containers
    for (const containerId of createdContainers) {
      try {
        await client.request(`/containers/${containerId}`, { method: 'DELETE' });
      } catch (error) {
        console.warn(`Failed to cleanup container ${containerId}:`, error.message);
      }
    }
  });

  test('should check system health', async () => {
    const response = await client.request('/health');
    
    expect(response.success).toBe(true);
    expect(response.data.status).toBe('healthy');
    expect(typeof response.data.containers.active).toBe('number');
  });

  test('should create a container', async () => {
    const config = {
      image: 'nginx:alpine',
      environment: { TEST_VAR: 'test_value' }
    };
    
    const response = await client.request('/containers', {
      method: 'POST',
      body: JSON.stringify(config)
    });
    
    expect(response.success).toBe(true);
    expect(response.data.id).toBeDefined();
    expect(response.data.status).toBeDefined();
    expect(response.data.connection.url).toBeDefined();
    
    createdContainers.push(response.data.id);
  });

  test('should list containers', async () => {
    const response = await client.request('/containers');
    
    expect(response.success).toBe(true);
    expect(Array.isArray(response.data)).toBe(true);
  });

  test('should handle container not found', async () => {
    await expect(
      client.request('/containers/nonexistent_id')
    ).rejects.toThrow('CONTAINER_NOT_FOUND');
  });
});
```

## Best Practices

1. **Always handle errors gracefully** with try-catch blocks
2. **Use timeout values** to prevent hanging requests
3. **Implement retry logic** for network failures
4. **Clean up resources** after use to prevent resource leaks
5. **Use environment variables** for configuration
6. **Validate input data** before sending requests
7. **Log important operations** for debugging
8. **Test error scenarios** in addition to happy paths
9. **Use TypeScript** for better type safety in larger applications
10. **Implement proper authentication** when moving to production