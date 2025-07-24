import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { ApiServer } from '../../../src/api/server.js';
import { ContainerManager } from '../../../src/services/ContainerManager.js';
import { ActivityMonitor } from '../../../src/services/ActivityMonitor.js';
import { ConfigManager } from '../../../src/services/ConfigManager.js';
import { ErrorHandler } from '../../../src/utils/ErrorHandler.js';
import Docker from 'dockerode';

// Mock Docker
vi.mock('dockerode');

describe('ApiServer Error Handling', () => {
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

  beforeEach(() => {
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

  describe('Centralized Error Handling Middleware', () => {
    it('should handle ContainerManagerError with CONTAINER_NOT_FOUND code', async () => {
      const error = new Error('Container not found');
      error.name = 'ContainerManagerError';
      (error as any).code = 'CONTAINER_NOT_FOUND';
      
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'CONTAINER_NOT_FOUND',
          message: 'Container not found'
        }
      });

      expect(response.body.error.details.requestId).toBeDefined();
      expect(response.body.error.details.path).toBe('/containers');
      expect(response.body.error.details.method).toBe('POST');
    });

    it('should handle ContainerManagerError with IMAGE_NOT_FOUND code', async () => {
      const error = new Error('Docker image not found');
      error.name = 'ContainerManagerError';
      (error as any).code = 'IMAGE_NOT_FOUND';
      
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({ image: 'nonexistent:latest' })
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'IMAGE_NOT_FOUND',
          message: 'Docker image not found'
        }
      });
    });

    it('should handle ContainerManagerError with DOCKER_DAEMON_UNAVAILABLE code', async () => {
      const error = new Error('Docker daemon is not available');
      error.name = 'ContainerManagerError';
      (error as any).code = 'DOCKER_DAEMON_UNAVAILABLE';
      
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(503);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'DOCKER_DAEMON_UNAVAILABLE',
          message: 'Docker daemon is not available'
        }
      });
    });

    it('should handle ContainerManagerError with RESOURCE_EXHAUSTED code', async () => {
      const error = new Error('No available ports');
      error.name = 'ContainerManagerError';
      (error as any).code = 'RESOURCE_EXHAUSTED';
      
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(507);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'RESOURCE_EXHAUSTED',
          message: 'No available ports'
        }
      });
    });

    it('should handle Docker connection errors (ECONNREFUSED)', async () => {
      const error = new Error('Connection refused');
      (error as any).code = 'ECONNREFUSED';
      
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(503);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Docker service is temporarily unavailable'
        }
      });
    });

    it('should handle Docker permission errors (EACCES)', async () => {
      const error = new Error('Permission denied');
      (error as any).code = 'EACCES';
      
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: 'Insufficient permissions to access Docker'
        }
      });
    });

    it('should handle disk space errors (ENOSPC)', async () => {
      const error = new Error('No space left on device');
      (error as any).code = 'ENOSPC';
      
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(507);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INSUFFICIENT_STORAGE',
          message: 'Insufficient disk space'
        }
      });
    });

    it('should handle timeout errors', async () => {
      const error = new Error('Operation timed out');
      error.name = 'TimeoutError';
      
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(408);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'REQUEST_TIMEOUT',
          message: 'Operation timed out'
        }
      });
    });

    it('should handle rate limit errors', async () => {
      const error = new Error('Rate limit exceeded');
      error.name = 'RateLimitError';
      
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(429);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded'
        }
      });
    });

    it('should handle validation errors', async () => {
      const error = new Error('Invalid input data');
      error.name = 'ValidationError';
      
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data'
        }
      });
    });

    it('should generate unique request IDs for error tracking', async () => {
      const error = new Error('Test error');
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response1 = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(500);

      const response2 = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(500);

      expect(response1.body.error.details.requestId).toBeDefined();
      expect(response2.body.error.details.requestId).toBeDefined();
      expect(response1.body.error.details.requestId).not.toBe(response2.body.error.details.requestId);
    });

    it('should include request context in error details', async () => {
      const error = new Error('Test error');
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({ image: 'test:latest' })
        .expect(500);

      expect(response.body.error.details).toMatchObject({
        path: '/containers',
        method: 'POST'
      });
      expect(response.body.error.details.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
    });

    it('should not interfere with successful responses', async () => {
      const mockContainer = {
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
        environment: {},
        metadata: {}
      };

      mockContainerManager.createContainer = vi.fn().mockResolvedValue(mockContainer);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('test-123');
      expect(response.body.error).toBeUndefined();
    });
  });

  describe('Error Response Structure', () => {
    it('should include timestamp in error responses', async () => {
      const error = new Error('Test error');
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(500);

      expect(response.body.error.timestamp).toBeDefined();
      expect(new Date(response.body.error.timestamp)).toBeInstanceOf(Date);
    });

    it('should maintain consistent error response format', async () => {
      const error = new Error('Test error');
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('timestamp');
      expect(response.body.error).toHaveProperty('details');
      expect(response.body).not.toHaveProperty('data');
    });
  });

  describe('Error Handler Integration', () => {
    it('should use ErrorHandler.extractErrorInfo for error processing', async () => {
      const extractErrorInfoSpy = vi.spyOn(ErrorHandler, 'extractErrorInfo');
      
      const error = ErrorHandler.createError('Test error', 'TEST_CODE', undefined, { key: 'value' });
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(500);

      expect(extractErrorInfoSpy).toHaveBeenCalledWith(error);
    });

    it('should handle errors created by ErrorHandler.createError', async () => {
      const error = ErrorHandler.createError(
        'Custom error message',
        'CUSTOM_ERROR_CODE',
        new Error('Original cause'),
        { context: 'test', userId: '123' }
      );
      
      mockContainerManager.createContainer = vi.fn().mockRejectedValue(error);

      const response = await request(apiServer.getApp())
        .post('/containers')
        .send({})
        .expect(500);

      expect(response.body.error.code).toBe('CUSTOM_ERROR_CODE');
      expect(response.body.error.message).toBe('Custom error message');
      expect(response.body.error.details).toMatchObject({
        context: 'test',
        userId: '123'
      });
    });
  });
});