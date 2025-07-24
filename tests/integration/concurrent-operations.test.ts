import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Docker from 'dockerode';
import { ApiServer } from '../../src/api/server.js';
import { ContainerManager } from '../../src/services/ContainerManager.js';
import { ActivityMonitor } from '../../src/services/ActivityMonitor.js';
import { ConfigManager } from '../../src/services/ConfigManager.js';

describe('Concurrent Operations Integration Tests', () => {
  let apiServer: ApiServer;
  let containerManager: ContainerManager;
  let activityMonitor: ActivityMonitor;
  let configManager: ConfigManager;
  let docker: Docker;
  let app: any;

  beforeAll(async () => {
    // Set test environment variables for concurrent testing
    process.env.DOCKER_DEFAULT_IMAGE = 'alpine:latest';
    process.env.API_PORT = '3002'; // Use specific port for testing
    process.env.DOCKER_PORT_RANGE_START = '9100';
    process.env.DOCKER_PORT_RANGE_END = '9200';

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

  describe('Concurrent Container Creation', () => {
    it('should handle multiple simultaneous container creation requests', async () => {
      const numberOfContainers = 5;
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
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data).toHaveProperty('connection');
        expect(response.body.data.status).toBe('running');
        expect(response.body.data.environment.CONTAINER_INDEX).toBe(index.toString());
      });

      // Verify all containers have unique IDs and ports
      const containerIds = responses.map(r => r.body.data.id);
      const ports = responses.map(r => r.body.data.connection.port);
      
      expect(new Set(containerIds).size).toBe(numberOfContainers);
      expect(new Set(ports).size).toBe(numberOfContainers);

      // Verify all containers are listed
      const listResponse = await request(app)
        .get('/containers')
        .expect(200);

      expect(listResponse.body.success).toBe(true);
      expect(listResponse.body.data).toHaveLength(numberOfContainers);
    });

    it('should handle port allocation under concurrent load', async () => {
      const numberOfContainers = 10;
      const createPromises: Promise<any>[] = [];

      // Create many containers simultaneously to test port allocation
      for (let i = 0; i < numberOfContainers; i++) {
        const promise = request(app)
          .post('/containers')
          .send({ image: 'alpine:latest' });
        createPromises.push(promise);
      }

      const responses = await Promise.all(createPromises);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });

      // All should have unique ports
      const ports = responses.map(r => r.body.data.connection.port);
      expect(new Set(ports).size).toBe(numberOfContainers);

      // All ports should be within the configured range
      const config = configManager.getConfig();
      ports.forEach(port => {
        expect(port).toBeGreaterThanOrEqual(config.docker.portRange.start);
        expect(port).toBeLessThanOrEqual(config.docker.portRange.end);
      });
    });
  });

  describe('Concurrent Container Operations', () => {
    it('should handle mixed concurrent operations (create, get, delete)', async () => {
      // First, create some containers
      const initialContainers = 3;
      const createPromises = [];
      
      for (let i = 0; i < initialContainers; i++) {
        createPromises.push(
          request(app)
            .post('/containers')
            .send({ image: 'alpine:latest' })
        );
      }

      const createResponses = await Promise.all(createPromises);
      const containerIds = createResponses.map(r => r.body.data.id);

      // Now perform mixed operations concurrently
      const mixedPromises = [
        // Create new containers
        request(app).post('/containers').send({ image: 'alpine:latest' }),
        request(app).post('/containers').send({ image: 'alpine:latest' }),
        
        // Get existing containers
        request(app).get(`/containers/${containerIds[0]}`),
        request(app).get(`/containers/${containerIds[1]}`),
        
        // List all containers
        request(app).get('/containers'),
        
        // Delete a container
        request(app).delete(`/containers/${containerIds[2]}`)
      ];

      const mixedResponses = await Promise.all(mixedPromises);

      // Verify create operations succeeded
      expect(mixedResponses[0].status).toBe(201);
      expect(mixedResponses[1].status).toBe(201);

      // Verify get operations succeeded
      expect(mixedResponses[2].status).toBe(200);
      expect(mixedResponses[3].status).toBe(200);

      // Verify list operation succeeded
      expect(mixedResponses[4].status).toBe(200);

      // Verify delete operation succeeded
      expect(mixedResponses[5].status).toBe(200);

      // Final verification: should have 4 containers (3 initial - 1 deleted + 2 new)
      const finalListResponse = await request(app)
        .get('/containers')
        .expect(200);

      expect(finalListResponse.body.data).toHaveLength(4);
    });

    it('should handle concurrent access to the same container', async () => {
      // Create a container
      const createResponse = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const containerId = createResponse.body.data.id;

      // Perform multiple concurrent operations on the same container
      const concurrentPromises = [
        request(app).get(`/containers/${containerId}`),
        request(app).get(`/containers/${containerId}`),
        request(app).get(`/containers/${containerId}`),
        request(app).get(`/containers/${containerId}`),
        request(app).get(`/containers/${containerId}`)
      ];

      const responses = await Promise.all(concurrentPromises);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.id).toBe(containerId);
      });
    });
  });

  describe('Parallel Session Management', () => {
    it('should maintain isolation between parallel container sessions', async () => {
      const numberOfSessions = 5;
      const sessionPromises: Promise<any>[] = [];

      // Create multiple parallel sessions
      for (let i = 0; i < numberOfSessions; i++) {
        const sessionPromise = (async () => {
          // Create container for this session
          const createResponse = await request(app)
            .post('/containers')
            .send({
              image: 'alpine:latest',
              environment: { SESSION_ID: `session_${i}` }
            });

          expect(createResponse.status).toBe(201);
          const containerId = createResponse.body.data.id;

          // Simulate activity in this session
          activityMonitor.updateActivity({
            containerId,
            activityType: 'http_request',
            details: { session: `session_${i}`, action: 'work' }
          });

          // Get container details
          const getResponse = await request(app)
            .get(`/containers/${containerId}`);

          expect(getResponse.status).toBe(200);
          expect(getResponse.body.data.environment.SESSION_ID).toBe(`session_${i}`);

          return {
            sessionId: i,
            containerId,
            port: createResponse.body.data.connection.port
          };
        })();

        sessionPromises.push(sessionPromise);
      }

      // Wait for all sessions to complete
      const sessions = await Promise.all(sessionPromises);

      // Verify session isolation
      expect(sessions).toHaveLength(numberOfSessions);

      // All sessions should have unique container IDs
      const containerIds = sessions.map(s => s.containerId);
      expect(new Set(containerIds).size).toBe(numberOfSessions);

      // All sessions should have unique ports
      const ports = sessions.map(s => s.port);
      expect(new Set(ports).size).toBe(numberOfSessions);

      // Verify all containers are still running and isolated
      const listResponse = await request(app)
        .get('/containers')
        .expect(200);

      expect(listResponse.body.data).toHaveLength(numberOfSessions);

      // Each container should maintain its session-specific environment
      for (const session of sessions) {
        const containerResponse = await request(app)
          .get(`/containers/${session.containerId}`)
          .expect(200);

        expect(containerResponse.body.data.environment.SESSION_ID).toBe(`session_${session.sessionId}`);
      }
    });

    it('should handle session cleanup without affecting other sessions', async () => {
      // Create multiple sessions
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        const createResponse = await request(app)
          .post('/containers')
          .send({
            image: 'alpine:latest',
            environment: { SESSION_ID: `session_${i}` }
          })
          .expect(201);

        sessions.push({
          id: i,
          containerId: createResponse.body.data.id
        });
      }

      // Remove middle session
      await request(app)
        .delete(`/containers/${sessions[1].containerId}`)
        .expect(200);

      // Verify other sessions are unaffected
      const remainingContainers = await request(app)
        .get('/containers')
        .expect(200);

      expect(remainingContainers.body.data).toHaveLength(2);

      // Verify specific sessions still exist
      await request(app)
        .get(`/containers/${sessions[0].containerId}`)
        .expect(200);

      await request(app)
        .get(`/containers/${sessions[2].containerId}`)
        .expect(200);

      // Verify removed session is gone
      await request(app)
        .get(`/containers/${sessions[1].containerId}`)
        .expect(404);
    });
  });

  describe('Resource Management Under Load', () => {
    it('should handle resource constraints gracefully', async () => {
      // Set a very small port range to test resource exhaustion
      process.env.DOCKER_PORT_RANGE_START = '9150';
      process.env.DOCKER_PORT_RANGE_END = '9152'; // Only 3 ports available

      // Reset config to pick up new port range
      configManager.reset();
      const newContainerManager = new ContainerManager(configManager);
      const newApiServer = new ApiServer(newContainerManager, activityMonitor, configManager);
      const newApp = newApiServer.getApp();

      // Create containers up to the limit
      const createPromises = [];
      for (let i = 0; i < 3; i++) {
        createPromises.push(
          request(newApp)
            .post('/containers')
            .send({ image: 'alpine:latest' })
        );
      }

      const responses = await Promise.all(createPromises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });

      // Try to create one more (should fail due to port exhaustion)
      const failResponse = await request(newApp)
        .post('/containers')
        .send({ image: 'alpine:latest' });

      expect(failResponse.status).toBe(507); // Service Unavailable due to resource constraints

      // Cleanup the containers we created
      const containerIds = responses.map(r => r.body.data.id);
      for (const containerId of containerIds) {
        await newContainerManager.removeContainer(containerId);
      }

      // Reset environment for other tests
      process.env.DOCKER_PORT_RANGE_START = '9100';
      process.env.DOCKER_PORT_RANGE_END = '9200';
      configManager.reset();
    });
  });
});