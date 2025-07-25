import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Docker from 'dockerode';
import { ApiServer } from '../../src/api/server.js';
import { ContainerManager } from '../../src/services/ContainerManager.js';
import { ActivityMonitor } from '../../src/services/ActivityMonitor.js';
import { CleanupScheduler } from '../../src/services/CleanupScheduler.js';
import { ConfigManager } from '../../src/services/ConfigManager.js';
import { CleanupStrategy, ActivityThresholds } from '../../src/models/Container.js';

describe('Cleanup Strategy Integration Tests', () => {
  let apiServer: ApiServer;
  let containerManager: ContainerManager;
  let activityMonitor: ActivityMonitor;
  let cleanupScheduler: CleanupScheduler;
  let configManager: ConfigManager;
  let docker: Docker;
  let app: any;
  let dockerAvailable = false;

  beforeAll(async () => {
    // Set test environment variables for faster testing
    process.env.DOCKER_DEFAULT_IMAGE = 'alpine:latest';
    process.env.CLEANUP_INTERVAL = '2'; // 2 seconds for faster testing
    process.env.CLEANUP_INACTIVITY_TIMEOUT = '5'; // 5 seconds default timeout
    process.env.API_PORT = '3002'; // Use specific port for testing
    process.env.DOCKER_PORT_RANGE_START = '9200';
    process.env.DOCKER_PORT_RANGE_END = '9300';

    // Initialize services
    configManager = ConfigManager.getInstance();
    configManager.reset();
    const config = configManager.loadConfig();
    
    docker = new Docker({ socketPath: config.docker.socketPath });
    
    // Check if Docker is available
    try {
      await docker.ping();
      dockerAvailable = true;
      console.log('Docker is available - running cleanup strategy integration tests');
    } catch (error) {
      dockerAvailable = false;
      console.warn('Docker is not available - skipping cleanup strategy integration tests');
    }

    if (dockerAvailable) {
      containerManager = new ContainerManager(configManager);
      activityMonitor = new ActivityMonitor(docker);
      cleanupScheduler = new CleanupScheduler(containerManager, activityMonitor, configManager);
      
      apiServer = new ApiServer(containerManager, activityMonitor, configManager);
      app = apiServer.getApp();
    }
  });

  afterAll(async () => {
    if (!dockerAvailable) return;

    // Cleanup any remaining test containers
    try {
      const containers = await containerManager.listContainers();
      for (const container of containers) {
        try {
          await containerManager.removeContainer(container.id);
        } catch (error) {
          console.warn(`Failed to cleanup container ${container.id}:`, error);
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup containers:', error);
    }

    // Stop services
    if (cleanupScheduler && cleanupScheduler.isSchedulerRunning()) {
      cleanupScheduler.stop();
    }
    if (activityMonitor) {
      activityMonitor.cleanup();
    }
    
    // Reset config
    configManager.reset();
  });

  beforeEach(() => {
    if (!dockerAvailable) return;
    // Clear any existing containers before each test
    containerManager.clear();
  });

  afterEach(async () => {
    if (!dockerAvailable) return;
    
    // Stop cleanup scheduler if running
    if (cleanupScheduler && cleanupScheduler.isSchedulerRunning()) {
      cleanupScheduler.stop();
    }

    // Cleanup containers after each test
    try {
      const containers = await containerManager.listContainers();
      for (const container of containers) {
        try {
          await containerManager.removeContainer(container.id);
        } catch (error) {
          // Ignore cleanup errors in tests
        }
      }
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  describe('Activity-based Cleanup Strategy', () => {
    it('should create container with activity-based cleanup strategy', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 3 // 3 seconds
      };

      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.cleanup_strategy.type).toBe('activity');
      expect(createResponse.body.data.cleanup_strategy.activity_timeout).toBe(3);
      expect(createResponse.body.data.cleanup_strategy.max_lifetime).toBeUndefined();
    });

    it('should automatically cleanup inactive containers with activity strategy', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 3 // 3 seconds
      };

      // Create container with short activity timeout
      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      const containerId = createResponse.body.data.id;

      // Verify container exists
      await request(app)
        .get(`/containers/${containerId}`)
        .expect(200);

      // Start cleanup scheduler
      cleanupScheduler.start();

      // Wait for cleanup to occur (activity timeout + buffer)
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Verify container was automatically removed
      await request(app)
        .get(`/containers/${containerId}`)
        .expect(404);

      // Verify cleanup history
      const cleanupHistory = cleanupScheduler.getCleanupHistory();
      expect(cleanupHistory.length).toBeGreaterThan(0);
      
      const lastCleanup = cleanupHistory[cleanupHistory.length - 1];
      expect(lastCleanup.containersRemoved).toBeGreaterThan(0);
    }, 10000);

    it('should not cleanup active containers with activity strategy', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 3 // 3 seconds
      };

      // Create container
      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      const containerId = createResponse.body.data.id;

      // Start cleanup scheduler
      cleanupScheduler.start();

      // Simulate activity by updating activity timestamp
      const updateActivity = () => {
        activityMonitor.updateActivity({
          containerId,
          activityType: 'http_request',
          details: { method: 'GET', path: '/test' }
        });
      };

      // Update activity every 2 seconds to keep container active
      const activityInterval = setInterval(updateActivity, 2000);

      // Wait for potential cleanup period
      await new Promise(resolve => setTimeout(resolve, 6000));

      clearInterval(activityInterval);

      // Verify container still exists
      const getResponse = await request(app)
        .get(`/containers/${containerId}`)
        .expect(200);

      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.id).toBe(containerId);
    }, 10000);
  });

  describe('Lifetime-based Cleanup Strategy', () => {
    it('should create container with lifetime-based cleanup strategy', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'lifetime',
        maxLifetime: 5 // 5 seconds
      };

      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.cleanup_strategy.type).toBe('lifetime');
      expect(createResponse.body.data.cleanup_strategy.max_lifetime).toBe(5);
      expect(createResponse.body.data.cleanup_strategy.activity_timeout).toBeUndefined();
    });

    it('should automatically cleanup containers after maximum lifetime', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'lifetime',
        maxLifetime: 3 // 3 seconds
      };

      // Create container with short lifetime
      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      const containerId = createResponse.body.data.id;

      // Start cleanup scheduler
      cleanupScheduler.start();

      // Keep container active but it should still be removed due to lifetime
      const activityInterval = setInterval(() => {
        activityMonitor.updateActivity({
          containerId,
          activityType: 'http_request',
          details: { method: 'GET', path: '/test' }
        });
      }, 1000);

      // Wait for lifetime to expire
      await new Promise(resolve => setTimeout(resolve, 6000));

      clearInterval(activityInterval);

      // Verify container was removed despite being active
      await request(app)
        .get(`/containers/${containerId}`)
        .expect(404);

      // Verify cleanup history
      const cleanupHistory = cleanupScheduler.getCleanupHistory();
      expect(cleanupHistory.length).toBeGreaterThan(0);
      
      const lastCleanup = cleanupHistory[cleanupHistory.length - 1];
      expect(lastCleanup.containersRemoved).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Hybrid Cleanup Strategy', () => {
    it('should create container with hybrid cleanup strategy', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'hybrid',
        maxLifetime: 10, // 10 seconds
        activityTimeout: 5 // 5 seconds
      };

      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.cleanup_strategy.type).toBe('hybrid');
      expect(createResponse.body.data.cleanup_strategy.max_lifetime).toBe(10);
      expect(createResponse.body.data.cleanup_strategy.activity_timeout).toBe(5);
    });

    it('should cleanup container when activity timeout is reached first', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'hybrid',
        maxLifetime: 10, // 10 seconds (longer)
        activityTimeout: 3 // 3 seconds (shorter, should trigger first)
      };

      // Create container
      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      const containerId = createResponse.body.data.id;

      // Start cleanup scheduler
      cleanupScheduler.start();

      // Wait for activity timeout (but not lifetime)
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Verify container was removed due to inactivity
      await request(app)
        .get(`/containers/${containerId}`)
        .expect(404);
    }, 10000);

    it('should cleanup container when lifetime is reached first', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'hybrid',
        maxLifetime: 3, // 3 seconds (shorter, should trigger first)
        activityTimeout: 10 // 10 seconds (longer)
      };

      // Create container
      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      const containerId = createResponse.body.data.id;

      // Start cleanup scheduler
      cleanupScheduler.start();

      // Keep container active
      const activityInterval = setInterval(() => {
        activityMonitor.updateActivity({
          containerId,
          activityType: 'http_request',
          details: { method: 'GET', path: '/test' }
        });
      }, 1000);

      // Wait for lifetime to expire
      await new Promise(resolve => setTimeout(resolve, 6000));

      clearInterval(activityInterval);

      // Verify container was removed due to lifetime despite being active
      await request(app)
        .get(`/containers/${containerId}`)
        .expect(404);
    }, 10000);
  });
 
 describe('Custom Activity Thresholds', () => {
    it('should create container with custom CPU threshold', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 5,
        activityThresholds: {
          minCpuPercent: 10 // 10% CPU threshold
        }
      };

      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.cleanup_strategy.activity_thresholds).toBeDefined();
      expect(createResponse.body.data.cleanup_strategy.activity_thresholds.min_cpu_percent).toBe(10);
    });

    it('should create container with custom memory threshold', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 5,
        activityThresholds: {
          minMemoryMB: 50 // 50MB memory threshold
        }
      };

      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.cleanup_strategy.activity_thresholds).toBeDefined();
      expect(createResponse.body.data.cleanup_strategy.activity_thresholds.min_memory_mb).toBe(50);
    });

    it('should create container with custom network threshold', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 5,
        activityThresholds: {
          minNetworkBytesPerSec: 1024 // 1KB/s network threshold
        }
      };

      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.cleanup_strategy.activity_thresholds).toBeDefined();
      expect(createResponse.body.data.cleanup_strategy.activity_thresholds.min_network_bytes_per_sec).toBe(1024);
    });

    it('should create container with multiple custom thresholds', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 5,
        activityThresholds: {
          minCpuPercent: 5,
          minMemoryMB: 25,
          minNetworkBytesPerSec: 512
        }
      };

      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      const thresholds = createResponse.body.data.cleanup_strategy.activity_thresholds;
      expect(thresholds.min_cpu_percent).toBe(5);
      expect(thresholds.min_memory_mb).toBe(25);
      expect(thresholds.min_network_bytes_per_sec).toBe(512);
    });

    it('should detect activity based on custom CPU threshold', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 3,
        activityThresholds: {
          minCpuPercent: 0.1 // Very low threshold to ensure detection
        }
      };

      // Create container
      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      const containerId = createResponse.body.data.id;

      // Simulate CPU activity by manually updating activity with resource usage
      activityMonitor.updateActivity({
        containerId,
        activityType: 'resource_usage',
        details: {
          cpu_usage_percent: 1.0, // Above threshold
          memory_usage_mb: 10,
          network_bytes_per_sec: 0
        }
      });

      // Start cleanup scheduler
      cleanupScheduler.start();

      // Wait for potential cleanup
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Container should still exist due to CPU activity
      const getResponse = await request(app)
        .get(`/containers/${containerId}`)
        .expect(200);

      expect(getResponse.body.success).toBe(true);
    }, 8000);

    it('should detect activity based on custom memory threshold', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 3,
        activityThresholds: {
          minMemoryMB: 5 // Low threshold
        }
      };

      // Create container
      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      const containerId = createResponse.body.data.id;

      // Simulate memory activity
      activityMonitor.updateActivity({
        containerId,
        activityType: 'resource_usage',
        details: {
          cpu_usage_percent: 0,
          memory_usage_mb: 10, // Above threshold
          network_bytes_per_sec: 0
        }
      });

      // Start cleanup scheduler
      cleanupScheduler.start();

      // Wait for potential cleanup
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Container should still exist due to memory activity
      const getResponse = await request(app)
        .get(`/containers/${containerId}`)
        .expect(200);

      expect(getResponse.body.success).toBe(true);
    }, 8000);

    it('should detect activity based on custom network threshold', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 3,
        activityThresholds: {
          minNetworkBytesPerSec: 100 // Low threshold
        }
      };

      // Create container
      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      const containerId = createResponse.body.data.id;

      // Simulate network activity
      activityMonitor.updateActivity({
        containerId,
        activityType: 'resource_usage',
        details: {
          cpu_usage_percent: 0,
          memory_usage_mb: 5,
          network_bytes_per_sec: 200 // Above threshold
        }
      });

      // Start cleanup scheduler
      cleanupScheduler.start();

      // Wait for potential cleanup
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Container should still exist due to network activity
      const getResponse = await request(app)
        .get(`/containers/${containerId}`)
        .expect(200);

      expect(getResponse.body.success).toBe(true);
    }, 8000);

    it('should cleanup container when no custom thresholds are met', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const cleanupStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 3,
        activityThresholds: {
          minCpuPercent: 50, // High threshold
          minMemoryMB: 100, // High threshold
          minNetworkBytesPerSec: 1000 // High threshold
        }
      };

      // Create container
      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy
        })
        .expect(201);

      const containerId = createResponse.body.data.id;

      // Simulate low resource usage (below all thresholds)
      activityMonitor.updateActivity({
        containerId,
        activityType: 'resource_usage',
        details: {
          cpu_usage_percent: 1, // Below 50%
          memory_usage_mb: 10, // Below 100MB
          network_bytes_per_sec: 50 // Below 1000 bytes/sec
        }
      });

      // Start cleanup scheduler
      cleanupScheduler.start();

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Container should be removed as no thresholds were met
      await request(app)
        .get(`/containers/${containerId}`)
        .expect(404);
    }, 10000);
  });

  describe('Error Handling for Invalid Cleanup Strategies', () => {
    it('should reject invalid cleanup strategy type', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const invalidStrategy = {
        type: 'invalid_type',
        activityTimeout: 5
      };

      const response = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('type must be one of: activity, lifetime, hybrid');
    });

    it('should reject negative activity timeout', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const invalidStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: -5 // Negative value
      };

      const response = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('activityTimeout must be a positive number');
    });

    it('should reject negative max lifetime', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const invalidStrategy: CleanupStrategy = {
        type: 'lifetime',
        maxLifetime: -10 // Negative value
      };

      const response = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('maxLifetime must be a positive number');
    });

    it('should reject invalid CPU threshold', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const invalidStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 5,
        activityThresholds: {
          minCpuPercent: 150 // Above 100%
        }
      };

      const response = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('minCpuPercent must be a number between 0 and 100');
    });

    it('should reject negative memory threshold', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const invalidStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 5,
        activityThresholds: {
          minMemoryMB: -10 // Negative value
        }
      };

      const response = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('minMemoryMB must be a positive number');
    });

    it('should reject negative network threshold', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const invalidStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 5,
        activityThresholds: {
          minNetworkBytesPerSec: -100 // Negative value
        }
      };

      const response = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('minNetworkBytesPerSec must be a positive number');
    });
  });

  describe('Mixed Cleanup Strategies', () => {
    it('should handle multiple containers with different cleanup strategies', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      // Create container with activity strategy
      const activityContainer = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy: {
            type: 'activity',
            activityTimeout: 4
          }
        })
        .expect(201);

      // Create container with lifetime strategy
      const lifetimeContainer = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy: {
            type: 'lifetime',
            maxLifetime: 4
          }
        })
        .expect(201);

      // Create container with hybrid strategy
      const hybridContainer = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy: {
            type: 'hybrid',
            activityTimeout: 6,
            maxLifetime: 6
          }
        })
        .expect(201);

      const activityId = activityContainer.body.data.id;
      const lifetimeId = lifetimeContainer.body.data.id;
      const hybridId = hybridContainer.body.data.id;

      // Verify all containers exist
      await request(app).get(`/containers/${activityId}`).expect(200);
      await request(app).get(`/containers/${lifetimeId}`).expect(200);
      await request(app).get(`/containers/${hybridId}`).expect(200);

      // Keep hybrid container active
      const activityInterval = setInterval(() => {
        activityMonitor.updateActivity({
          containerId: hybridId,
          activityType: 'http_request',
          details: { method: 'GET', path: '/test' }
        });
      }, 2000);

      // Start cleanup scheduler
      cleanupScheduler.start();

      // Wait for cleanup of activity and lifetime containers
      await new Promise(resolve => setTimeout(resolve, 7000));

      clearInterval(activityInterval);

      // Activity and lifetime containers should be removed
      await request(app).get(`/containers/${activityId}`).expect(404);
      await request(app).get(`/containers/${lifetimeId}`).expect(404);

      // Hybrid container should still exist (was kept active and within lifetime)
      await request(app).get(`/containers/${hybridId}`).expect(200);

      // Verify cleanup history shows correct removals
      const cleanupHistory = cleanupScheduler.getCleanupHistory();
      expect(cleanupHistory.length).toBeGreaterThan(0);
      
      const totalRemoved = cleanupHistory.reduce((sum, cleanup) => sum + cleanup.containersRemoved, 0);
      expect(totalRemoved).toBeGreaterThanOrEqual(2);
    }, 12000);

    it('should handle containers with different custom thresholds', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      // Create container with high CPU threshold (hard to meet)
      const highCpuContainer = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy: {
            type: 'activity',
            activityTimeout: 3,
            activityThresholds: {
              minCpuPercent: 80 // Very high threshold
            }
          }
        })
        .expect(201);

      // Create container with low memory threshold (easy to meet)
      const lowMemoryContainer = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy: {
            type: 'activity',
            activityTimeout: 3,
            activityThresholds: {
              minMemoryMB: 1 // Very low threshold
            }
          }
        })
        .expect(201);

      const highCpuId = highCpuContainer.body.data.id;
      const lowMemoryId = lowMemoryContainer.body.data.id;

      // Simulate moderate resource usage for both containers
      const simulateActivity = () => {
        // This should not meet high CPU threshold but should meet low memory threshold
        activityMonitor.updateActivity({
          containerId: highCpuId,
          activityType: 'resource_usage',
          details: {
            cpu_usage_percent: 10, // Below 80% threshold
            memory_usage_mb: 20,
            network_bytes_per_sec: 0
          }
        });

        activityMonitor.updateActivity({
          containerId: lowMemoryId,
          activityType: 'resource_usage',
          details: {
            cpu_usage_percent: 10,
            memory_usage_mb: 20, // Above 1MB threshold
            network_bytes_per_sec: 0
          }
        });
      };

      // Simulate activity
      const activityInterval = setInterval(simulateActivity, 1000);

      // Start cleanup scheduler
      cleanupScheduler.start();

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 6000));

      clearInterval(activityInterval);

      // High CPU threshold container should be removed (threshold not met)
      await request(app).get(`/containers/${highCpuId}`).expect(404);

      // Low memory threshold container should still exist (threshold met)
      await request(app).get(`/containers/${lowMemoryId}`).expect(200);
    }, 10000);

    it('should handle concurrent cleanup operations with mixed strategies', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const containerPromises = [];

      // Create multiple containers with different strategies concurrently
      for (let i = 0; i < 5; i++) {
        const strategy = i % 3 === 0 ? 'activity' : i % 3 === 1 ? 'lifetime' : 'hybrid';
        
        let cleanupStrategy: CleanupStrategy;
        switch (strategy) {
          case 'activity':
            cleanupStrategy = {
              type: 'activity',
              activityTimeout: 3
            };
            break;
          case 'lifetime':
            cleanupStrategy = {
              type: 'lifetime',
              maxLifetime: 3
            };
            break;
          case 'hybrid':
            cleanupStrategy = {
              type: 'hybrid',
              activityTimeout: 4,
              maxLifetime: 4
            };
            break;
        }

        const promise = request(app)
          .post('/containers')
          .send({
            image: 'alpine:latest',
            cleanupStrategy,
            environment: { CONTAINER_INDEX: i.toString(), STRATEGY: strategy }
          });
        
        containerPromises.push(promise);
      }

      // Wait for all containers to be created
      const responses = await Promise.all(containerPromises);
      
      // Verify all containers were created successfully
      responses.forEach((response, index) => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.environment.CONTAINER_INDEX).toBe(index.toString());
      });

      const containerIds = responses.map(r => r.body.data.id);

      // Start cleanup scheduler
      cleanupScheduler.start();

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 7000));

      // All containers should be removed due to their short timeouts
      for (const containerId of containerIds) {
        await request(app).get(`/containers/${containerId}`).expect(404);
      }

      // Verify cleanup history
      const cleanupHistory = cleanupScheduler.getCleanupHistory();
      expect(cleanupHistory.length).toBeGreaterThan(0);
      
      const totalRemoved = cleanupHistory.reduce((sum, cleanup) => sum + cleanup.containersRemoved, 0);
      expect(totalRemoved).toBe(5);
    }, 12000);

    it('should handle cleanup failures gracefully with mixed strategies', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      // Create containers with different strategies
      const container1 = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy: {
            type: 'activity',
            activityTimeout: 2
          }
        })
        .expect(201);

      const container2 = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          cleanupStrategy: {
            type: 'lifetime',
            maxLifetime: 2
          }
        })
        .expect(201);

      const containerId1 = container1.body.data.id;
      const containerId2 = container2.body.data.id;

      // Manually remove one container to simulate external removal
      await containerManager.removeContainer(containerId1);

      // Start cleanup scheduler
      cleanupScheduler.start();

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 5000));

      // First container should already be gone
      await request(app).get(`/containers/${containerId1}`).expect(404);

      // Second container should be cleaned up normally
      await request(app).get(`/containers/${containerId2}`).expect(404);

      // Verify cleanup history shows successful operations
      const cleanupHistory = cleanupScheduler.getCleanupHistory();
      expect(cleanupHistory.length).toBeGreaterThan(0);
    }, 8000);
  });
});