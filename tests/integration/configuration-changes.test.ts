import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Docker from 'dockerode';
import { ApiServer } from '../../src/api/server.js';
import { ContainerManager } from '../../src/services/ContainerManager.js';
import { ActivityMonitor } from '../../src/services/ActivityMonitor.js';
import { CleanupScheduler } from '../../src/services/CleanupScheduler.js';
import { ConfigManager } from '../../src/services/ConfigManager.js';

describe('Configuration Changes Integration Tests', () => {
  let docker: Docker;
  let originalEnv: Record<string, string | undefined>;

  beforeAll(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Initialize Docker client
    docker = new Docker({ socketPath: '/var/run/docker.sock' });
    
    // Verify Docker is available - skip tests if not available
    try {
      await docker.ping();
    } catch (error) {
      console.warn('Docker daemon is not available. Skipping integration tests.');
      // We'll handle this in individual tests
    }
  });

  afterAll(() => {
    // Restore original environment
    Object.keys(process.env).forEach(key => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  });

  beforeEach(() => {
    // Reset environment to clean state for each test
    const keysToDelete = Object.keys(process.env).filter(key => 
      key.startsWith('DOCKER_') || 
      key.startsWith('CLEANUP_') || 
      key.startsWith('API_')
    );
    keysToDelete.forEach(key => delete process.env[key]);
  });

  afterEach(async () => {
    // Cleanup any containers that might have been created
    try {
      const containers = await docker.listContainers({ all: true });
      const testContainers = containers.filter(container => 
        container.Names.some(name => name.includes('docker-demand'))
      );
      
      for (const container of testContainers) {
        try {
          const dockerContainer = docker.getContainer(container.Id);
          await dockerContainer.stop();
          await dockerContainer.remove();
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Docker Configuration Changes', () => {
    it('should apply new default image configuration', async () => {
      // Set initial configuration
      process.env.DOCKER_DEFAULT_IMAGE = 'alpine:3.18';
      process.env.API_PORT = '0';
      process.env.DOCKER_PORT_RANGE_START = '9300';
      process.env.DOCKER_PORT_RANGE_END = '9400';

      // Initialize services with first config
      let configManager = ConfigManager.getInstance();
      let containerManager = new ContainerManager(configManager);
      let activityMonitor = new ActivityMonitor(docker);
      let apiServer = new ApiServer(containerManager, activityMonitor, configManager);
      let app = apiServer.getApp();

      // Create container with first image
      const response1 = await request(app)
        .post('/containers')
        .send({})
        .expect(201);

      expect(response1.body.data.image).toBe('alpine:3.18');
      const containerId1 = response1.body.data.id;

      // Change configuration
      process.env.DOCKER_DEFAULT_IMAGE = 'alpine:latest';
      
      // Reset config manager to pick up new values
      configManager.reset();
      configManager = ConfigManager.getInstance();
      containerManager = new ContainerManager(configManager);
      apiServer = new ApiServer(containerManager, activityMonitor, configManager);
      app = apiServer.getApp();

      // Create container with new image
      const response2 = await request(app)
        .post('/containers')
        .send({})
        .expect(201);

      expect(response2.body.data.image).toBe('alpine:latest');
      const containerId2 = response2.body.data.id;

      // Verify both containers exist with different images
      expect(containerId1).not.toBe(containerId2);

      // Cleanup
      await containerManager.removeContainer(containerId1);
      await containerManager.removeContainer(containerId2);
    });

    it('should apply new port range configuration', async () => {
      // Set narrow port range
      process.env.DOCKER_PORT_RANGE_START = '9350';
      process.env.DOCKER_PORT_RANGE_END = '9352';
      process.env.API_PORT = '0';

      let configManager = ConfigManager.getInstance();
      let containerManager = new ContainerManager(configManager);
      let activityMonitor = new ActivityMonitor(docker);
      let apiServer = new ApiServer(containerManager, activityMonitor, configManager);
      let app = apiServer.getApp();

      // Create containers to fill the range
      const response1 = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const response2 = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const response3 = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      // Verify ports are in expected range
      const ports = [
        response1.body.data.connection.port,
        response2.body.data.connection.port,
        response3.body.data.connection.port
      ];

      ports.forEach(port => {
        expect(port).toBeGreaterThanOrEqual(9350);
        expect(port).toBeLessThanOrEqual(9352);
      });

      // Next container should fail due to port exhaustion
      const response4 = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' });

      expect(response4.status).toBe(507);

      // Change to wider port range
      process.env.DOCKER_PORT_RANGE_START = '9360';
      process.env.DOCKER_PORT_RANGE_END = '9370';

      // Reset and create new services
      configManager.reset();
      configManager = ConfigManager.getInstance();
      containerManager = new ContainerManager(configManager);
      apiServer = new ApiServer(containerManager, activityMonitor, configManager);
      app = apiServer.getApp();

      // Now container creation should succeed
      const response5 = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      expect(response5.body.data.connection.port).toBeGreaterThanOrEqual(9360);
      expect(response5.body.data.connection.port).toBeLessThanOrEqual(9370);

      // Cleanup
      const containerIds = [
        response1.body.data.id,
        response2.body.data.id,
        response3.body.data.id,
        response5.body.data.id
      ];

      for (const containerId of containerIds) {
        try {
          await containerManager.removeContainer(containerId);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });

    it('should apply network mode configuration changes', async () => {
      // Test with bridge network mode
      process.env.DOCKER_NETWORK_MODE = 'bridge';
      process.env.API_PORT = '0';
      process.env.DOCKER_PORT_RANGE_START = '9400';
      process.env.DOCKER_PORT_RANGE_END = '9500';

      let configManager = ConfigManager.getInstance();
      let containerManager = new ContainerManager(configManager);
      let activityMonitor = new ActivityMonitor(docker);
      let apiServer = new ApiServer(containerManager, activityMonitor, configManager);
      let app = apiServer.getApp();

      const response1 = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const container1 = await containerManager.getContainer(response1.body.data.id);
      expect(container1!.metadata.networkMode).toBe('bridge');

      // Change to host network mode
      process.env.DOCKER_NETWORK_MODE = 'host';

      // Reset services
      configManager.reset();
      configManager = ConfigManager.getInstance();
      containerManager = new ContainerManager(configManager);
      apiServer = new ApiServer(containerManager, activityMonitor, configManager);
      app = apiServer.getApp();

      const response2 = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const container2 = await containerManager.getContainer(response2.body.data.id);
      expect(container2!.metadata.networkMode).toBe('host');

      // Cleanup
      await containerManager.removeContainer(response1.body.data.id);
      await containerManager.removeContainer(response2.body.data.id);
    });
  });

  describe('Cleanup Configuration Changes', () => {
    it('should apply new cleanup interval configuration', async () => {
      // Set fast cleanup for testing
      process.env.CLEANUP_INTERVAL = '2'; // 2 seconds
      process.env.CLEANUP_INACTIVITY_TIMEOUT = '3'; // 3 seconds
      process.env.API_PORT = '0';
      process.env.DOCKER_PORT_RANGE_START = '9500';
      process.env.DOCKER_PORT_RANGE_END = '9600';

      const configManager = ConfigManager.getInstance();
      const containerManager = new ContainerManager(configManager);
      const activityMonitor = new ActivityMonitor(docker);
      const cleanupScheduler = new CleanupScheduler(containerManager, activityMonitor, configManager);
      const apiServer = new ApiServer(containerManager, activityMonitor, configManager);
      const app = apiServer.getApp();

      // Create a container
      const response = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const containerId = response.body.data.id;

      // Start cleanup scheduler
      cleanupScheduler.start();

      // Wait for cleanup to occur (should happen within ~5 seconds)
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Container should be cleaned up
      const containers = await containerManager.listContainers();
      expect(containers).toHaveLength(0);

      // Verify cleanup history
      const history = cleanupScheduler.getCleanupHistory();
      expect(history.length).toBeGreaterThan(0);

      cleanupScheduler.stop();
    }, 10000);

    it('should apply new inactivity timeout configuration', async () => {
      // Set longer inactivity timeout
      process.env.CLEANUP_INTERVAL = '2';
      process.env.CLEANUP_INACTIVITY_TIMEOUT = '10'; // 10 seconds
      process.env.API_PORT = '0';
      process.env.DOCKER_PORT_RANGE_START = '9600';
      process.env.DOCKER_PORT_RANGE_END = '9700';

      const configManager = ConfigManager.getInstance();
      configManager.reset();
      const containerManager = new ContainerManager(configManager);
      const activityMonitor = new ActivityMonitor(docker);
      const cleanupScheduler = new CleanupScheduler(containerManager, activityMonitor, configManager);
      const apiServer = new ApiServer(containerManager, activityMonitor, configManager);
      const app = apiServer.getApp();

      // Create a container
      const response = await request(app)
        .post('/containers')
        .send({ image: 'alpine:latest' })
        .expect(201);

      const containerId = response.body.data.id;

      // Start cleanup scheduler
      cleanupScheduler.start();

      // Wait for a few cleanup cycles (should not clean up yet due to longer timeout)
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Container should still exist
      let containers = await containerManager.listContainers();
      expect(containers).toHaveLength(1);

      // Wait for the full timeout period
      await new Promise(resolve => setTimeout(resolve, 7000));

      // Now container should be cleaned up
      containers = await containerManager.listContainers();
      expect(containers).toHaveLength(0);

      cleanupScheduler.stop();
    }, 15000);

    it('should apply retry configuration changes', async () => {
      // Set low retry count
      process.env.CLEANUP_MAX_RETRY_ATTEMPTS = '1';
      process.env.CLEANUP_INTERVAL = '2';
      process.env.CLEANUP_INACTIVITY_TIMEOUT = '3';
      process.env.API_PORT = '0';
      process.env.DOCKER_PORT_RANGE_START = '9700';
      process.env.DOCKER_PORT_RANGE_END = '9800';

      const configManager = ConfigManager.getInstance();
      configManager.reset();
      const containerManager = new ContainerManager(configManager);
      const activityMonitor = new ActivityMonitor(docker);
      const cleanupScheduler = new CleanupScheduler(containerManager, activityMonitor, configManager);

      // Verify configuration was applied
      const config = configManager.getConfig();
      expect(config.cleanup.maxRetryAttempts).toBe(1);
      expect(config.cleanup.interval).toBe(2);
      expect(config.cleanup.inactivityTimeout).toBe(3);

      cleanupScheduler.stop();
    });
  });

  describe('API Configuration Changes', () => {
    it('should apply new API host configuration', async () => {
      // Test with localhost
      process.env.API_HOST = 'localhost';
      process.env.API_PORT = '0';
      process.env.DOCKER_PORT_RANGE_START = '9800';
      process.env.DOCKER_PORT_RANGE_END = '9900';

      let configManager = ConfigManager.getInstance();
      let config = configManager.getConfig();
      expect(config.api.host).toBe('localhost');

      // Change to 0.0.0.0
      process.env.API_HOST = '0.0.0.0';
      configManager.reset();
      configManager = ConfigManager.getInstance();
      config = configManager.getConfig();
      expect(config.api.host).toBe('0.0.0.0');
    });

    it('should apply authentication configuration changes', async () => {
      // Test with auth disabled
      process.env.API_AUTH_ENABLED = 'false';
      process.env.API_PORT = '0';

      let configManager = ConfigManager.getInstance();
      let config = configManager.getConfig();
      expect(config.api.authEnabled).toBe(false);

      // Change to auth enabled
      process.env.API_AUTH_ENABLED = 'true';
      configManager.reset();
      configManager = ConfigManager.getInstance();
      config = configManager.getConfig();
      expect(config.api.authEnabled).toBe(true);
    });
  });

  describe('Configuration Validation', () => {
    it('should reject invalid port range configurations', () => {
      process.env.DOCKER_PORT_RANGE_START = '9000';
      process.env.DOCKER_PORT_RANGE_END = '8000'; // End before start

      const configManager = ConfigManager.getInstance();
      configManager.reset();

      expect(() => {
        configManager.loadConfig();
      }).toThrow('Docker port range start must be less than end');
    });

    it('should reject invalid timeout configurations', () => {
      process.env.CLEANUP_INACTIVITY_TIMEOUT = '-1'; // Negative timeout

      const configManager = ConfigManager.getInstance();
      configManager.reset();

      expect(() => {
        configManager.loadConfig();
      }).toThrow('Cleanup inactivity timeout must be a positive integer');
    });

    it('should reject invalid port configurations', () => {
      process.env.API_PORT = '70000'; // Port out of range

      const configManager = ConfigManager.getInstance();
      configManager.reset();

      expect(() => {
        configManager.loadConfig();
      }).toThrow('API port must be a valid port number');
    });

    it('should use defaults for missing configuration', () => {
      // Clear all relevant environment variables
      const keysToDelete = Object.keys(process.env).filter(key => 
        key.startsWith('DOCKER_') || 
        key.startsWith('CLEANUP_') || 
        key.startsWith('API_')
      );
      keysToDelete.forEach(key => delete process.env[key]);

      const configManager = ConfigManager.getInstance();
      configManager.reset();
      const config = configManager.loadConfig();

      // Verify defaults are applied
      expect(config.docker.defaultImage).toBe('alpine:latest');
      expect(config.docker.socketPath).toBe('/var/run/docker.sock');
      expect(config.docker.networkMode).toBe('bridge');
      expect(config.docker.portRange.start).toBe(8000);
      expect(config.docker.portRange.end).toBe(9000);
      expect(config.cleanup.interval).toBe(60);
      expect(config.cleanup.inactivityTimeout).toBe(300);
      expect(config.cleanup.maxRetryAttempts).toBe(3);
      expect(config.api.port).toBe(3000);
      expect(config.api.host).toBe('0.0.0.0');
      expect(config.api.authEnabled).toBe(false);
    });
  });
});