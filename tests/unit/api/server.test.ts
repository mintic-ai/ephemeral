import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { ApiServer } from '../../../src/api/server.js';
import { ContainerManager } from '../../../src/services/ContainerManager.js';
import { ActivityMonitor } from '../../../src/services/ActivityMonitor.js';
import { ConfigManager } from '../../../src/services/ConfigManager.js';
import { Container } from '../../../src/models/Container.js';
import Docker from 'dockerode';

// Mock Docker
vi.mock('dockerode');

describe('ApiServer', () => {
  let apiServer: ApiServer;
  let mockContainerManager: ContainerManager;
  let mockActivityMonitor: ActivityMonitor;
  let mockConfigManager: ConfigManager;
  let mockDocker: Docker;

  const mockConfig = {
    docker: {
      socketPath: '/var/run/docker.sock',
      defaultImage: 'alpine:latest',
      networkMode: 'bridge',
      portRange: { start: 8000, end: 9000 }
    },
    cleanup: {
      interval: 60,
      inactivityTimeout: 300,
      maxRetryAttempts: 3,
      forceRemovalTimeout: 30
    },
    api: {
      port: 3000,
      host: '0.0.0.0',
      authEnabled: false
    }
  };

  const mockContainer: Container = {
    id: 'test-123',
    dockerId: 'docker-abc123',
    image: 'alpine:latest',
    status: 'running',
    createdAt: new Date('2025-01-23T10:00:00Z'),
    lastActivity: new Date('2025-01-23T10:05:00Z'),
    connection: {
      host: 'localhost',
      port: 8001,
      url: 'http://localhost:8001'
    },
    environment: { NODE_ENV: 'test' },
    metadata: { dockerName: 'ephemeral-test-123' },
    cleanupStrategy: {
      type: 'activity',
      activityTimeout: 300
    }
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock Docker constructor and instance
    const MockedDocker = vi.mocked(Docker);
    mockDocker = {
      info: vi.fn().mockResolvedValue({
        ServerVersion: '20.10.0',
        Containers: 5,
        Images: 10
      })
    } as any;
    MockedDocker.mockImplementation(() => mockDocker);

    // Mock ConfigManager
    mockConfigManager = {
      getConfig: vi.fn().mockReturnValue(mockConfig)
    } as any;

    // Mock ContainerManager
    mockContainerManager = {
      createContainer: vi.fn(),
      removeContainer: vi.fn(),
      getContainer: vi.fn(),
      listContainers: vi.fn(),
      getActiveContainerCount: vi.fn().mockReturnValue(2)
    } as any;

    // Mock ActivityMonitor
    mockActivityMonitor = {
      startMonitoring: vi.fn(),
      stopMonitoring: vi.fn(),
      removeActivityRecord: vi.fn(),
      getLastActivity: vi.fn()
    } as any;

    // Create API server with mocked dependencies
    apiServer = new ApiServer(mockContainerManager, mockActivityMonitor, mockConfigManager);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status successfully', async () => {
      const response = await request(apiServer.getApp())
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'healthy',
          containers: {
            active: 2,
            total: 2
          },
          docker: {
            version: '20.10.0',
            containers: 5,
            images: 10
          }
        }
      });

      expect(response.body.data.timestamp).toBeDefined();
      expect(response.body.data.system.uptime).toBeDefined();
      expect(response.body.data.system.memory).toBeDefined();
    });

    it('should handle Docker info failure gracefully', async () => {
      mockDocker.info = vi.fn().mockRejectedValue(new Error('Docker daemon not available'));

      const response = await request(apiServer.getApp())
        .get('/health')
        .expect(503);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'System health check failed'
        }
      });
    });
  });

  describe('POST /containers', () => {
    it('should create a container successfully', async () => {
      mockContainerManager.createContainer = vi.fn().mockResolvedValue(mockContainer);

      const createRequest = {
        image: 'alpine:latest',
        environment: { NODE_ENV: 'test' }
      };

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send(createRequest)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: 'test-123',
          status: 'running',
          connection: {
            host: 'localhost',
            port: 8001,
            url: 'http://localhost:8001'
          },
          created_at: '2025-01-23T10:00:00.000Z',
          last_activity: '2025-01-23T10:05:00.000Z',
          image: 'alpine:latest',
          environment: { NODE_ENV: 'test' },
          cleanup_strategy: {
            type: 'activity',
            activity_timeout: 300
          }
        }
      });

      expect(mockContainerManager.createContainer).toHaveBeenCalledWith(createRequest);
      expect(mockActivityMonitor.startMonitoring).toHaveBeenCalledWith('test-123', 'docker-abc123');
    });

    it('should create a container with minimal request', async () => {
      mockContainerManager.createContainer = vi.fn().mockResolvedValue(mockContainer);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(mockContainerManager.createContainer).toHaveBeenCalledWith({});
    });

    it('should validate request body', async () => {
      // Mock the container manager to return undefined to trigger the validation error
      mockContainerManager.createContainer = vi.fn().mockResolvedValue(undefined);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send('invalid json')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'CONTAINER_CREATE_FAILED',
          message: 'Failed to create container'
        }
      });
    });

    it('should validate image field', async () => {
      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({ image: '' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Image must be a non-empty string if provided'
        }
      });
    });

    it('should validate environment field', async () => {
      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({ environment: 'invalid' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Environment must be an object if provided'
        }
      });
    });

    it('should validate environment variable keys', async () => {
      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({ environment: { '': 'value' } })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Environment variable keys must be non-empty strings'
        }
      });
    });

    it('should validate environment variable values', async () => {
      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({ environment: { KEY: 123 } })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Environment variable values must be strings'
        }
      });
    });

    it('should validate ports field', async () => {
      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({ ports: 'invalid' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Ports must be an array if provided'
        }
      });
    });

    it('should validate port numbers', async () => {
      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({ ports: [0, 80, 70000] })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Ports must be valid port numbers (1-65535)'
        }
      });
    });

    it('should handle container creation errors', async () => {
      const error = new Error('Docker image not found');
      error.name = 'ContainerManagerError';
      (error as any).code = 'IMAGE_NOT_FOUND';
      
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({ image: 'nonexistent:latest' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'IMAGE_NOT_FOUND',
          message: 'Docker image not found'
        }
      });
    });

    it('should handle unexpected errors', async () => {
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(new Error('Unexpected error'));

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'CONTAINER_CREATE_FAILED',
          message: 'Failed to create container'
        }
      });
    });

    describe('Cleanup Strategy Validation', () => {
      it('should accept valid activity-based cleanup strategy', async () => {
        const containerWithActivityStrategy = {
          ...mockContainer,
          cleanupStrategy: {
            type: 'activity',
            activityTimeout: 600,
            activityThresholds: {
              minCpuPercent: 5,
              minMemoryMB: 100,
              minNetworkBytesPerSec: 1024
            }
          }
        };
        
        mockContainerManager.createContainer = vi.fn().mockResolvedValue(containerWithActivityStrategy);

        const createRequest = {
          image: 'alpine:latest',
          cleanupStrategy: {
            type: 'activity',
            activityTimeout: 600,
            activityThresholds: {
              minCpuPercent: 5,
              minMemoryMB: 100,
              minNetworkBytesPerSec: 1024
            }
          }
        };

        const response = await request(apiServer.getApp())
          .post('/containers')
          .send(createRequest)
          .expect(201);

        expect(response.body).toMatchObject({
          success: true,
          data: {
            cleanup_strategy: {
              type: 'activity',
              activity_timeout: 600,
              activity_thresholds: {
                min_cpu_percent: 5,
                min_memory_mb: 100,
                min_network_bytes_per_sec: 1024
              }
            }
          }
        });
      });

      it('should accept valid lifetime-based cleanup strategy', async () => {
        const containerWithLifetimeStrategy = {
          ...mockContainer,
          cleanupStrategy: {
            type: 'lifetime',
            maxLifetime: 3600
          }
        };
        
        mockContainerManager.createContainer = vi.fn().mockResolvedValue(containerWithLifetimeStrategy);

        const createRequest = {
          image: 'alpine:latest',
          cleanupStrategy: {
            type: 'lifetime',
            maxLifetime: 3600
          }
        };

        const response = await request(apiServer.getApp())
          .post('/containers')
          .send(createRequest)
          .expect(201);

        expect(response.body).toMatchObject({
          success: true,
          data: {
            cleanup_strategy: {
              type: 'lifetime',
              max_lifetime: 3600
            }
          }
        });
      });

      it('should accept valid hybrid cleanup strategy', async () => {
        const containerWithHybridStrategy = {
          ...mockContainer,
          cleanupStrategy: {
            type: 'hybrid',
            maxLifetime: 7200,
            activityTimeout: 900
          }
        };
        
        mockContainerManager.createContainer = vi.fn().mockResolvedValue(containerWithHybridStrategy);

        const createRequest = {
          image: 'alpine:latest',
          cleanupStrategy: {
            type: 'hybrid',
            maxLifetime: 7200,
            activityTimeout: 900
          }
        };

        const response = await request(apiServer.getApp())
          .post('/containers')
          .send(createRequest)
          .expect(201);

        expect(response.body).toMatchObject({
          success: true,
          data: {
            cleanup_strategy: {
              type: 'hybrid',
              max_lifetime: 7200,
              activity_timeout: 900
            }
          }
        });
      });

      it('should reject invalid cleanup strategy type', async () => {
        const response = await request(apiServer.getApp())
          .post('/containers')
          .send({
            cleanupStrategy: {
              type: 'invalid'
            }
          })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid cleanup strategy: type must be one of: activity, lifetime, hybrid'
          }
        });
      });

      it('should reject cleanup strategy that is not an object', async () => {
        const response = await request(apiServer.getApp())
          .post('/containers')
          .send({
            cleanupStrategy: 'invalid'
          })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'cleanupStrategy must be an object if provided'
          }
        });
      });

      it('should reject activity strategy without activityTimeout', async () => {
        const response = await request(apiServer.getApp())
          .post('/containers')
          .send({
            cleanupStrategy: {
              type: 'activity'
            }
          })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid cleanup strategy: activityTimeout is required for activity-based cleanup strategy'
          }
        });
      });

      it('should reject lifetime strategy without maxLifetime', async () => {
        const response = await request(apiServer.getApp())
          .post('/containers')
          .send({
            cleanupStrategy: {
              type: 'lifetime'
            }
          })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid cleanup strategy: maxLifetime is required for lifetime-based cleanup strategy'
          }
        });
      });

      it('should reject hybrid strategy without any timeout values', async () => {
        const response = await request(apiServer.getApp())
          .post('/containers')
          .send({
            cleanupStrategy: {
              type: 'hybrid'
            }
          })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid cleanup strategy: hybrid cleanup strategy requires either maxLifetime or activityTimeout (or both)'
          }
        });
      });

      it('should reject negative maxLifetime', async () => {
        const response = await request(apiServer.getApp())
          .post('/containers')
          .send({
            cleanupStrategy: {
              type: 'lifetime',
              maxLifetime: -100
            }
          })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid cleanup strategy: maxLifetime must be a positive number'
          }
        });
      });

      it('should reject negative activityTimeout', async () => {
        const response = await request(apiServer.getApp())
          .post('/containers')
          .send({
            cleanupStrategy: {
              type: 'activity',
              activityTimeout: -300
            }
          })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid cleanup strategy: activityTimeout must be a positive number'
          }
        });
      });

      it('should reject invalid CPU threshold', async () => {
        const response = await request(apiServer.getApp())
          .post('/containers')
          .send({
            cleanupStrategy: {
              type: 'activity',
              activityTimeout: 300,
              activityThresholds: {
                minCpuPercent: 150
              }
            }
          })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid cleanup strategy: activityThresholds.minCpuPercent must be a number between 0 and 100'
          }
        });
      });

      it('should reject negative memory threshold', async () => {
        const response = await request(apiServer.getApp())
          .post('/containers')
          .send({
            cleanupStrategy: {
              type: 'activity',
              activityTimeout: 300,
              activityThresholds: {
                minMemoryMB: -50
              }
            }
          })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid cleanup strategy: activityThresholds.minMemoryMB must be a positive number'
          }
        });
      });

      it('should reject negative network threshold', async () => {
        const response = await request(apiServer.getApp())
          .post('/containers')
          .send({
            cleanupStrategy: {
              type: 'activity',
              activityTimeout: 300,
              activityThresholds: {
                minNetworkBytesPerSec: -1024
              }
            }
          })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid cleanup strategy: activityThresholds.minNetworkBytesPerSec must be a positive number'
          }
        });
      });
    });
  });

  describe('GET /containers', () => {
    it('should list all containers successfully', async () => {
      const containers = [mockContainer];
      mockContainerManager.listContainers = vi.fn().mockResolvedValue(containers);

      const response = await request(apiServer.getApp())
        .get('/containers')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: [{
          id: 'test-123',
          status: 'running',
          connection: {
            host: 'localhost',
            port: 8001,
            url: 'http://localhost:8001'
          },
          created_at: '2025-01-23T10:00:00.000Z',
          last_activity: '2025-01-23T10:05:00.000Z',
          image: 'alpine:latest',
          environment: { NODE_ENV: 'test' },
          cleanup_strategy: {
            type: 'activity',
            activity_timeout: 300
          }
        }]
      });
    });

    it('should return empty array when no containers exist', async () => {
      mockContainerManager.listContainers = vi.fn().mockResolvedValue([]);

      const response = await request(apiServer.getApp())
        .get('/containers')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: []
      });
    });

    it('should handle listing errors', async () => {
      mockContainerManager.listContainers = vi.fn().mockRejectedValue(new Error('Docker daemon error'));

      const response = await request(apiServer.getApp())
        .get('/containers')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'CONTAINER_LIST_FAILED',
          message: 'Failed to list containers'
        }
      });
    });
  });

  describe('GET /containers/:id', () => {
    it('should get container details successfully', async () => {
      mockContainerManager.getContainer = vi.fn().mockResolvedValue(mockContainer);
      mockActivityMonitor.getLastActivity = vi.fn().mockReturnValue(new Date('2025-01-23T10:10:00Z'));

      const response = await request(apiServer.getApp())
        .get('/containers/test-123')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: 'test-123',
          status: 'running',
          connection: {
            host: 'localhost',
            port: 8001,
            url: 'http://localhost:8001'
          },
          created_at: '2025-01-23T10:00:00.000Z',
          last_activity: '2025-01-23T10:10:00.000Z',
          image: 'alpine:latest',
          environment: { NODE_ENV: 'test' },
          metadata: { dockerName: 'ephemeral-test-123' },
          cleanup_strategy: {
            type: 'activity',
            activity_timeout: 300
          }
        }
      });

      expect(mockContainerManager.getContainer).toHaveBeenCalledWith('test-123');
      expect(mockActivityMonitor.getLastActivity).toHaveBeenCalledWith('test-123');
    });

    it('should handle missing container ID', async () => {
      // When accessing /containers/ it actually hits the list endpoint, so we need to mock it
      mockContainerManager.listContainers = vi.fn().mockResolvedValue([]);
      
      const response = await request(apiServer.getApp())
        .get('/containers/')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: []
      });
    });

    it('should handle empty container ID', async () => {
      const response = await request(apiServer.getApp())
        .get('/containers/%20')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_CONTAINER_ID',
          message: 'Container ID is required and must be a non-empty string'
        }
      });
    });

    it('should handle container not found', async () => {
      mockContainerManager.getContainer = vi.fn().mockResolvedValue(null);

      const response = await request(apiServer.getApp())
        .get('/containers/nonexistent')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'CONTAINER_NOT_FOUND',
          message: 'Container with ID nonexistent not found'
        }
      });
    });

    it('should handle get container errors', async () => {
      mockContainerManager.getContainer = vi.fn().mockRejectedValue(new Error('Docker error'));

      const response = await request(apiServer.getApp())
        .get('/containers/test-123')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'CONTAINER_GET_FAILED',
          message: 'Failed to get container details'
        }
      });
    });
  });

  describe('DELETE /containers/:id', () => {
    it('should delete container successfully', async () => {
      mockContainerManager.getContainer = vi.fn().mockResolvedValue(mockContainer);
      mockContainerManager.removeContainer = vi.fn().mockResolvedValue(undefined);

      const response = await request(apiServer.getApp())
        .delete('/containers/test-123')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: 'test-123',
          message: 'Container removed successfully'
        }
      });

      expect(mockContainerManager.getContainer).toHaveBeenCalledWith('test-123');
      expect(mockActivityMonitor.stopMonitoring).toHaveBeenCalledWith('test-123');
      expect(mockContainerManager.removeContainer).toHaveBeenCalledWith('test-123');
      expect(mockActivityMonitor.removeActivityRecord).toHaveBeenCalledWith('test-123');
    });

    it('should handle missing container ID', async () => {
      const response = await request(apiServer.getApp())
        .delete('/containers/')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'ENDPOINT_NOT_FOUND'
        }
      });
    });

    it('should handle empty container ID', async () => {
      const response = await request(apiServer.getApp())
        .delete('/containers/%20')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_CONTAINER_ID',
          message: 'Container ID is required and must be a non-empty string'
        }
      });
    });

    it('should handle container not found', async () => {
      mockContainerManager.getContainer = vi.fn().mockResolvedValue(null);

      const response = await request(apiServer.getApp())
        .delete('/containers/nonexistent')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'CONTAINER_NOT_FOUND',
          message: 'Container with ID nonexistent not found'
        }
      });
    });

    it('should handle container manager errors', async () => {
      mockContainerManager.getContainer = vi.fn().mockResolvedValue(mockContainer);
      
      const error = new Error('Container removal failed');
      error.name = 'ContainerManagerError';
      (error as any).code = 'DOCKER_REMOVE_FAILED';
      
      mockContainerManager.removeContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .delete('/containers/test-123')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'DOCKER_REMOVE_FAILED',
          message: 'Container removal failed'
        }
      });
    });

    it('should handle unexpected errors', async () => {
      mockContainerManager.getContainer = vi.fn().mockResolvedValue(mockContainer);
      mockContainerManager.removeContainer = vi.fn().mockRejectedValue(new Error('Unexpected error'));

      const response = await request(apiServer.getApp())
        .delete('/containers/test-123')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'CONTAINER_DELETE_FAILED',
          message: 'Failed to delete container'
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown endpoints', async () => {
      const response = await request(apiServer.getApp())
        .get('/unknown-endpoint')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'ENDPOINT_NOT_FOUND',
          message: 'Endpoint GET /unknown-endpoint not found'
        }
      });
    });

    it('should handle CORS preflight requests', async () => {
      const response = await request(apiServer.getApp())
        .options('/containers')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toBe('GET, POST, PUT, DELETE, OPTIONS');
    });

    it('should include CORS headers in responses', async () => {
      mockContainerManager.listContainers = vi.fn().mockResolvedValue([]);

      const response = await request(apiServer.getApp())
        .get('/containers')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('*');
    });
  });

  describe('Request Validation', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(apiServer.getApp())
        .post('/containers')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle large request bodies', async () => {
      const largeEnvironment = {};
      for (let i = 0; i < 1000; i++) {
        largeEnvironment[`VAR_${i}`] = `value_${i}`;
      }

      mockContainerManager.createContainer = vi.fn().mockResolvedValue(mockContainer);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({ environment: largeEnvironment })
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });
});