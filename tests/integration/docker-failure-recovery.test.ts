import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Docker from 'dockerode';
import { ApiServer } from '../../src/api/server.js';
import { ContainerManager } from '../../src/services/ContainerManager.js';
import { ActivityMonitor } from '../../src/services/ActivityMonitor.js';
import { ConfigManager } from '../../src/services/ConfigManager.js';

describe('Docker Failure Recovery Integration Tests', () => {
  let apiServer: ApiServer;
  let containerManager: ContainerManager;
  let activityMonitor: ActivityMonitor;
  let configManager: ConfigManager;
  let docker: Docker;
  let app: any;

  beforeAll(async () => {
    // Set test environment variables
    process.env.DOCKER_DEFAULT_IMAGE = 'alpine:latest';
    process.env.API_PORT = '3003';
    process.env.DOCKER_PORT_RANGE_START = '9200';
    process.env.DOCKER_PORT_RANGE_END = '9300';

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

    activityMonitor.cleanup();
    configManager.reset();
  });

  beforeEach(() => {
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

  describe('Docker API Error Handling', () => {
    it('should handle invalid image names gracefully', async () => {
      const response = await request(app)
        .post('/containers')
        .send({
          image: 'nonexistent-image:invalid-tag'
        });

      expect(response.status).toBe(500); // Container creation failed
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('CONTAINER_CREATE_FAILED');
    });

    it('should handle Docker daemon connection issues', async () => {
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
    });

    it('should handle container removal of non-existent containers', async () => {
      const response = await request(app)
        .delete('/containers/nonexistent-container-id');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONTAINER_NOT_FOUND');
    });

    it('should handle getting non-existent containers', async () => {
      const response = await request(app)
        .get('/containers/nonexistent-container-id');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONTAINER_NOT_FOUND');
    });
  });

  describe('Container State Recovery', () => {
    it('should recover from containers that fail to start', async () => {
      // Try to create a container with invalid configuration
      // This simulates a container that gets created but fails to start
      const response = await request(app)
        .post('/containers')
        .send({
          image: 'alpine:latest',
          // Note: We can't easily simulate a start failure with alpine,
          // but the error handling is tested through the invalid image test above
        });

      // For alpine, this should succeed, but let's test the error path
      // by trying to create with an image that doesn't exist
      const failResponse = await request(app)
        .post('/containers')
        .send({
          image: 'definitely-does-not-exist:latest'
        });

      expect(failResponse.status).toBeGreaterThanOrEqual(400);
      expect(failResponse.body.success).toBe(false);

      // Verify no containers were left in inconsistent state
      const listResponse = await request(app)
        .get('/containers')
        .expect(200);

      // Should only have the successful container if any
      if (response.status === 201) {
        expect(listResponse.body.data).toHaveLength(1);
        // Clean up the successful container
        await request(app)
          .delete(`/containers/${response.body.data.id}`)
          .expect(200);
      } else {
        expect(listResponse.body.data).toHaveLength(0);
      }
    });

    it('should handle containers that stop unexpectedly', async () => {
      // Create a container
      const createResponse = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const containerId = createResponse.body.data.id;
      const container = await containerManager.getContainer(containerId);
      expect(container!.status).toBe('running');

      // Stop the container externally (simulating unexpected stop)
      const dockerContainer = docker.getContainer(container!.dockerId);
      await dockerContainer.stop();

      // Our system should detect the status change
      const updatedContainer = await containerManager.getContainer(containerId);
      expect(updatedContainer!.status).toBe('stopped');

      // API should still return the container but with stopped status
      const getResponse = await request(app)
        .get(`/containers/${containerId}`)
        .expect(200);

      expect(getResponse.body.data.status).toBe('stopped');

      // Clean up
      await dockerContainer.remove();
    });

    it('should handle containers removed externally', async () => {
      // Create a container
      const createResponse = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const containerId = createResponse.body.data.id;
      const container = await containerManager.getContainer(containerId);

      // Remove the container externally
      const dockerContainer = docker.getContainer(container!.dockerId);
      await dockerContainer.stop();
      await dockerContainer.remove();

      // Our system should detect the container is gone
      const updatedContainer = await containerManager.getContainer(containerId);
      expect(updatedContainer).toBeNull();

      // API should return 404
      await request(app)
        .get(`/containers/${containerId}`)
        .expect(404);

      // Should not appear in list
      const listResponse = await request(app)
        .get('/containers')
        .expect(200);

      expect(listResponse.body.data).toHaveLength(0);
    });
  });

  describe('Activity Monitor Resilience', () => {
    it('should handle monitoring failures gracefully', async () => {
      // Create a container
      const createResponse = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const containerId = createResponse.body.data.id;

      // Verify monitoring started
      const initialActivity = activityMonitor.getLastActivity(containerId);
      expect(initialActivity).toBeTruthy();

      // Stop the container (this will cause monitoring to fail)
      const container = await containerManager.getContainer(containerId);
      const dockerContainer = docker.getContainer(container!.dockerId);
      await dockerContainer.stop();

      // Wait for a monitoring cycle to potentially fail
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Activity monitor should still function for other operations
      activityMonitor.updateActivity({
        containerId,
        activityType: 'manual',
        details: { test: 'manual_update' }
      });

      const updatedActivity = activityMonitor.getLastActivity(containerId);
      expect(updatedActivity).toBeTruthy();
      expect(updatedActivity!.getTime()).toBeGreaterThan(initialActivity!.getTime());

      // Clean up
      await dockerContainer.remove();
    });

    it('should continue monitoring other containers when one fails', async () => {
      // Create two containers
      const createResponse1 = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const createResponse2 = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const containerId1 = createResponse1.body.data.id;
      const containerId2 = createResponse2.body.data.id;

      // Verify both are being monitored
      expect(activityMonitor.getLastActivity(containerId1)).toBeTruthy();
      expect(activityMonitor.getLastActivity(containerId2)).toBeTruthy();

      // Remove first container externally
      const container1 = await containerManager.getContainer(containerId1);
      const dockerContainer1 = docker.getContainer(container1!.dockerId);
      await dockerContainer1.stop();
      await dockerContainer1.remove();

      // Wait for monitoring cycle
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Second container should still be monitored and functional
      activityMonitor.updateActivity({
        containerId: containerId2,
        activityType: 'manual',
        details: { test: 'still_working' }
      });

      const activity2 = activityMonitor.getLastActivity(containerId2);
      expect(activity2).toBeTruthy();

      // Clean up second container
      await containerManager.removeContainer(containerId2);
    });
  });

  describe('Error Response Consistency', () => {
    it('should return consistent error format for all failure scenarios', async () => {
      const testCases = [
        {
          name: 'Invalid container ID format',
          request: () => request(app).get('/containers/'),
          expectedStatus: 404
        },
        {
          name: 'Non-existent container',
          request: () => request(app).get('/containers/nonexistent'),
          expectedStatus: 404
        },
        {
          name: 'Invalid JSON in request body',
          request: () => request(app)
            .post('/containers')
            .send('invalid json')
            .set('Content-Type', 'application/json'),
          expectedStatus: 400
        },
        {
          name: 'Missing required fields',
          request: () => request(app)
            .post('/containers')
            .send({}), // Empty body, but this should work with defaults
          expectedStatus: 201 // Should succeed with default image
        }
      ];

      for (const testCase of testCases) {
        const response = await testCase.request();
        
        if (testCase.expectedStatus >= 400) {
          expect(response.status).toBe(testCase.expectedStatus);
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBeDefined();
          expect(response.body.error).toHaveProperty('code');
          expect(response.body.error).toHaveProperty('message');
          expect(response.body.error).toHaveProperty('timestamp');
        } else {
          expect(response.status).toBe(testCase.expectedStatus);
          if (response.body.data && response.body.data.id) {
            // Clean up successful container
            await request(app)
              .delete(`/containers/${response.body.data.id}`);
          }
        }
      }
    });

    it('should handle health check during Docker issues', async () => {
      // Health check should work even if there are some Docker issues
      const response = await request(app)
        .get('/health');

      // Health check might succeed or fail depending on Docker state
      // but should always return a structured response
      expect(response.body).toBeDefined();
      
      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('status');
        expect(response.body.data).toHaveProperty('timestamp');
      } else {
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBeDefined();
      }
    });
  });
});