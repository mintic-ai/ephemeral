import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Docker from 'dockerode';
import { ApiServer } from '../../src/api/server.js';
import { ContainerManager } from '../../src/services/ContainerManager.js';
import { ActivityMonitor } from '../../src/services/ActivityMonitor.js';
import { CleanupScheduler } from '../../src/services/CleanupScheduler.js';
import { ConfigManager } from '../../src/services/ConfigManager.js';

describe('System Integration Tests', () => {
  let apiServer: ApiServer;
  let containerManager: ContainerManager;
  let activityMonitor: ActivityMonitor;
  let cleanupScheduler: CleanupScheduler;
  let configManager: ConfigManager;
  let docker: Docker;
  let app: any;
  let dockerAvailable = false;

  beforeAll(async () => {
    // Set test environment variables
    process.env.DOCKER_DEFAULT_IMAGE = 'alpine:latest';
    process.env.CLEANUP_INTERVAL = '5'; // 5 seconds for faster testing
    process.env.CLEANUP_INACTIVITY_TIMEOUT = '10'; // 10 seconds for faster testing
    process.env.API_PORT = '3010'; // Use specific port for testing
    process.env.DOCKER_PORT_RANGE_START = '9000';
    process.env.DOCKER_PORT_RANGE_END = '9100';

    // Initialize services
    configManager = ConfigManager.getInstance();
    configManager.reset();
    const config = configManager.loadConfig();
    
    docker = new Docker({ socketPath: config.docker.socketPath });
    
    // Check if Docker is available
    try {
      await docker.ping();
      dockerAvailable = true;
      console.log('Docker is available - running full integration tests');
    } catch (error) {
      dockerAvailable = false;
      console.warn('Docker is not available - running limited integration tests');
    }

    containerManager = new ContainerManager(configManager);
    activityMonitor = new ActivityMonitor(docker);
    cleanupScheduler = new CleanupScheduler(containerManager, activityMonitor, configManager);
    
    apiServer = new ApiServer(containerManager, activityMonitor, configManager);
    app = apiServer.getApp();
  });

  afterAll(async () => {
    // Cleanup any remaining test containers
    if (dockerAvailable) {
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
    // Clear any existing containers before each test
    if (containerManager) {
      containerManager.clear();
    }
  });

  afterEach(async () => {
    // Cleanup containers after each test
    if (dockerAvailable && containerManager) {
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
    }
  });

  describe('API Endpoints (No Docker Required)', () => {
    it('should return health check even without Docker', async () => {
      const response = await request(app)
        .get('/health');

      // Health check should return some response regardless of Docker status
      expect(response.body).toBeDefined();
      
      if (dockerAvailable) {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('status');
      } else {
        // May fail but should return structured error
        if (response.status >= 400) {
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBeDefined();
        }
      }
    });

    it('should handle invalid endpoints', async () => {
      const response = await request(app)
        .get('/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ENDPOINT_NOT_FOUND');
    });

    it('should validate request bodies', async () => {
      const response = await request(app)
        .post('/containers')
        .send('invalid json')
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_JSON');
    });
  });

  describe('Container Operations (Docker Required)', () => {
    it('should create and manage containers when Docker is available', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      // Create a container
      const createResponse = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          environment: { TEST_VAR: 'integration_test' }
        })
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data).toHaveProperty('id');
      expect(createResponse.body.data).toHaveProperty('connection');
      expect(createResponse.body.data.status).toBe('running');

      const containerId = createResponse.body.data.id;

      // Get container details
      const getResponse = await request(app)
        .get(`/containers/${containerId}`)
        .expect(200);

      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.id).toBe(containerId);
      expect(getResponse.body.data.status).toBe('running');

      // List containers
      const listResponse = await request(app)
        .get('/containers')
        .expect(200);

      expect(listResponse.body.success).toBe(true);
      expect(listResponse.body.data).toHaveLength(1);
      expect(listResponse.body.data[0].id).toBe(containerId);

      // Delete container
      const deleteResponse = await request(app)
        .delete(`/containers/${containerId}`)
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);
      expect(deleteResponse.body.data.id).toBe(containerId);

      // Verify container is gone
      await request(app)
        .get(`/containers/${containerId}`)
        .expect(404);
    });

    it('should handle concurrent container creation when Docker is available', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      const numberOfContainers = 3;
      const createPromises: Promise<any>[] = [];

      // Create multiple containers simultaneously
      for (let i = 0; i < numberOfContainers; i++) {
        const promise = request(app)
          .post('/containers')
          .send({
            image: 'alpine:latest',
            environment: { CONTAINER_INDEX: i.toString() }
          });
        createPromises.push(promise);
      }

      // Wait for all containers to be created
      const responses = await Promise.all(createPromises);

      // Verify all containers were created successfully
      responses.forEach((response, index) => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.environment.CONTAINER_INDEX).toBe(index.toString());
      });

      // Verify all containers have unique IDs and ports
      const containerIds = responses.map(r => r.body.data.id);
      const ports = responses.map(r => r.body.data.connection.port);
      
      expect(new Set(containerIds).size).toBe(numberOfContainers);
      expect(new Set(ports).size).toBe(numberOfContainers);

      // Cleanup
      for (const response of responses) {
        await request(app)
          .delete(`/containers/${response.body.data.id}`)
          .expect(200);
      }
    });

    it('should handle automatic cleanup when Docker is available', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      // Create a container
      const createResponse = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const containerId = createResponse.body.data.id;

      // Verify activity monitoring is working
      const lastActivity = activityMonitor.getLastActivity(containerId);
      expect(lastActivity).toBeTruthy();

      // Start cleanup scheduler
      cleanupScheduler.start();
      
      // Wait for cleanup to occur (inactivity timeout + some buffer)
      await new Promise(resolve => setTimeout(resolve, 12000));

      // Verify container was automatically removed
      const finalListResponse = await request(app)
        .get('/containers')
        .expect(200);

      expect(finalListResponse.body.success).toBe(true);
      expect(finalListResponse.body.data).toHaveLength(0);

      // Verify cleanup history
      const cleanupHistory = cleanupScheduler.getCleanupHistory();
      expect(cleanupHistory.length).toBeGreaterThan(0);

      cleanupScheduler.stop();
    }, 20000); // Increased timeout for this comprehensive test
  });

  describe('Error Handling', () => {
    it('should handle Docker connection errors gracefully', async () => {
      if (dockerAvailable) {
        // Create a container manager with invalid socket path
        process.env.DOCKER_SOCKET_PATH = '/invalid/docker.sock';
        configManager.reset();
        
        const invalidContainerManager = new ContainerManager(configManager);
        const invalidApiServer = new ApiServer(invalidContainerManager, activityMonitor, configManager);
        const invalidApp = invalidApiServer.getApp();

        const response = await request(invalidApp)
          .post('/containers')
          .send({ image: 'alpine:latest' });

        expect(response.status).toBe(503); // Service unavailable
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBeDefined();

        // Reset to valid socket path
        delete process.env.DOCKER_SOCKET_PATH;
        configManager.reset();
      } else {
        // If Docker is not available, container creation should fail
        const response = await request(app)
          .post('/containers')
          .send({ image: 'alpine:latest' });

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(response.body.success).toBe(false);
      }
    });

    it('should return consistent error format', async () => {
      const response = await request(app)
        .get('/containers/nonexistent-container-id');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('timestamp');
    });
  });

  describe('Configuration Management', () => {
    it('should load configuration with defaults', () => {
      const config = configManager.getConfig();
      
      expect(config).toBeDefined();
      expect(config.docker).toBeDefined();
      expect(config.cleanup).toBeDefined();
      expect(config.api).toBeDefined();
      
      // Verify some key defaults
      expect(config.docker.defaultImage).toBe('alpine:latest');
      expect(config.cleanup.interval).toBe(5); // From our test env
      expect(config.api.port).toBe(3010); // From our test env
    });

    it('should validate configuration', () => {
      // Test invalid port range
      process.env.DOCKER_PORT_RANGE_START = '9000';
      process.env.DOCKER_PORT_RANGE_END = '8000'; // End before start

      const testConfigManager = ConfigManager.getInstance();
      testConfigManager.reset();

      expect(() => {
        testConfigManager.loadConfig();
      }).toThrow('Docker port range start must be less than end');

      // Reset
      process.env.DOCKER_PORT_RANGE_START = '9000';
      process.env.DOCKER_PORT_RANGE_END = '9100';
      testConfigManager.reset();
    });
  });

  describe('Activity Monitoring', () => {
    it('should track container activity', async function() {
      if (!dockerAvailable) {
        this.skip();
        return;
      }

      // Create a container
      const createResponse = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const containerId = createResponse.body.data.id;
      const initialActivity = activityMonitor.getLastActivity(containerId);
      expect(initialActivity).toBeTruthy();

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update activity manually
      activityMonitor.updateActivity({
        containerId,
        activityType: 'http_request',
        details: { method: 'GET', path: '/test' }
      });

      const updatedActivity = activityMonitor.getLastActivity(containerId);
      expect(updatedActivity).toBeTruthy();
      expect(updatedActivity!.getTime()).toBeGreaterThan(initialActivity!.getTime());

      // Cleanup
      await containerManager.removeContainer(containerId);
    });
  });
});