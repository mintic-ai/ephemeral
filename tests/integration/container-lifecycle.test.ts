import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Docker from 'dockerode';
import { ApiServer } from '../../src/api/server.js';
import { ContainerManager } from '../../src/services/ContainerManager.js';
import { ActivityMonitor } from '../../src/services/ActivityMonitor.js';
import { CleanupScheduler } from '../../src/services/CleanupScheduler.js';
import { ConfigManager } from '../../src/services/ConfigManager.js';

describe('Container Lifecycle Integration Tests', () => {
  let apiServer: ApiServer;
  let containerManager: ContainerManager;
  let activityMonitor: ActivityMonitor;
  let cleanupScheduler: CleanupScheduler;
  let configManager: ConfigManager;
  let docker: Docker;
  let app: any;

  beforeAll(async () => {
    // Set test environment variables
    process.env.DOCKER_DEFAULT_IMAGE = 'alpine:latest';
    process.env.CLEANUP_INTERVAL = '5'; // 5 seconds for faster testing
    process.env.CLEANUP_INACTIVITY_TIMEOUT = '10'; // 10 seconds for faster testing
    process.env.API_PORT = '3001'; // Use specific port for testing
    process.env.DOCKER_PORT_RANGE_START = '9000';
    process.env.DOCKER_PORT_RANGE_END = '9100';

    // Initialize services
    configManager = ConfigManager.getInstance();
    configManager.reset();
    const config = configManager.loadConfig();
    
    docker = new Docker({ socketPath: config.docker.socketPath });
    
    // Verify Docker is available
    try {
      await docker.ping();
    } catch (error) {
      throw new Error('Docker daemon is not available. Integration tests require Docker to be running.');
    }

    containerManager = new ContainerManager(configManager);
    activityMonitor = new ActivityMonitor(docker);
    cleanupScheduler = new CleanupScheduler(containerManager, activityMonitor, configManager);
    
    apiServer = new ApiServer(containerManager, activityMonitor, configManager);
    app = apiServer.getApp();
  });

  afterAll(async () => {
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
    if (cleanupScheduler.isSchedulerRunning()) {
      cleanupScheduler.stop();
    }
    activityMonitor.cleanup();
    
    // Reset config
    configManager.reset();
  });

  beforeEach(() => {
    // Clear any existing containers before each test
    containerManager.clear();
  });

  afterEach(async () => {
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

  describe('Complete Container Lifecycle', () => {
    it('should create, monitor, and automatically cleanup inactive containers', async () => {
      // Step 1: Create a container via API
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

      // Step 2: Verify container is running and monitored
      const getResponse = await request(app)
        .get(`/containers/${containerId}`)
        .expect(200);

      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.id).toBe(containerId);
      expect(getResponse.body.data.status).toBe('running');

      // Step 3: Verify activity monitoring is working
      const lastActivity = activityMonitor.getLastActivity(containerId);
      expect(lastActivity).toBeTruthy();

      // Step 4: List containers and verify it appears
      const listResponse = await request(app)
        .get('/containers')
        .expect(200);

      expect(listResponse.body.success).toBe(true);
      expect(listResponse.body.data).toHaveLength(1);
      expect(listResponse.body.data[0].id).toBe(containerId);

      // Step 5: Start cleanup scheduler and wait for automatic cleanup
      cleanupScheduler.start();
      
      // Wait for cleanup to occur (inactivity timeout + some buffer)
      await new Promise(resolve => setTimeout(resolve, 12000));

      // Step 6: Verify container was automatically removed
      const finalListResponse = await request(app)
        .get('/containers')
        .expect(200);

      expect(finalListResponse.body.success).toBe(true);
      expect(finalListResponse.body.data).toHaveLength(0);

      // Step 7: Verify cleanup history
      const cleanupHistory = cleanupScheduler.getCleanupHistory();
      expect(cleanupHistory.length).toBeGreaterThan(0);
      
      const lastCleanup = cleanupHistory[cleanupHistory.length - 1];
      expect(lastCleanup.containersRemoved).toBeGreaterThan(0);

      cleanupScheduler.stop();
    }, 20000); // Increased timeout for this comprehensive test

    it('should handle manual container removal', async () => {
      // Create container
      const createResponse = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const containerId = createResponse.body.data.id;

      // Verify container exists
      await request(app)
        .get(`/containers/${containerId}`)
        .expect(200);

      // Manually remove container
      const deleteResponse = await request(app)
        .delete(`/containers/${containerId}`)
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);
      expect(deleteResponse.body.data.id).toBe(containerId);

      // Verify container no longer exists
      await request(app)
        .get(`/containers/${containerId}`)
        .expect(404);

      // Verify it's not in the list
      const listResponse = await request(app)
        .get('/containers')
        .expect(200);

      expect(listResponse.body.data).toHaveLength(0);
    });

    it('should update activity when container is accessed', async () => {
      // Create container
      const createResponse = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const containerId = createResponse.body.data.id;
      const initialActivity = activityMonitor.getLastActivity(containerId);

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Access container (simulates activity)
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

  describe('Container State Synchronization', () => {
    it('should detect when Docker containers are removed externally', async () => {
      // Create container through our system
      const createResponse = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const containerId = createResponse.body.data.id;
      const container = await containerManager.getContainer(containerId);
      expect(container).toBeTruthy();

      // Remove container directly through Docker (simulating external removal)
      const dockerContainer = docker.getContainer(container!.dockerId);
      await dockerContainer.stop();
      await dockerContainer.remove();

      // Our system should detect the container is gone
      const updatedContainer = await containerManager.getContainer(containerId);
      expect(updatedContainer).toBeNull();

      // Should not appear in list
      const containers = await containerManager.listContainers();
      expect(containers).toHaveLength(0);
    });

    it('should handle Docker container state changes', async () => {
      // Create container
      const createResponse = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const containerId = createResponse.body.data.id;
      let container = await containerManager.getContainer(containerId);
      expect(container!.status).toBe('running');

      // Stop container directly through Docker
      const dockerContainer = docker.getContainer(container!.dockerId);
      await dockerContainer.stop();

      // Our system should detect the status change
      container = await containerManager.getContainer(containerId);
      expect(container!.status).toBe('stopped');

      // Cleanup
      await dockerContainer.remove();
    });
  });
});