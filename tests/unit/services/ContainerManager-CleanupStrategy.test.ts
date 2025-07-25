import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContainerManager, ContainerManagerError } from '../../../src/services/ContainerManager';
import { ConfigManager } from '../../../src/services/ConfigManager';
import { CleanupStrategy } from '../../../src/models/Container';

// Mock Docker
vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      createContainer: vi.fn(),
      getContainer: vi.fn()
    }))
  };
});

describe('ContainerManager - Cleanup Strategy Integration', () => {
  let containerManager: ContainerManager;
  let mockConfigManager: ConfigManager;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    
    // Create mock config manager
    mockConfigManager = {
      getConfig: vi.fn().mockReturnValue({
        docker: {
          socketPath: '/var/run/docker.sock',
          defaultImage: 'alpine:latest',
          networkMode: 'bridge',
          portRange: { start: 8000, end: 8010 }
        },
        api: {
          host: 'localhost',
          port: 3000
        }
      })
    } as any;

    containerManager = new ContainerManager(mockConfigManager);
  });

  describe('cleanup strategy validation', () => {
    it('should reject invalid cleanup strategy type', async () => {
      const invalidStrategy: any = {
        type: 'invalid-type',
        activityTimeout: 300
      };

      await expect(
        containerManager.createContainer({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
      ).rejects.toThrow(ContainerManagerError);

      await expect(
        containerManager.createContainer({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
      ).rejects.toThrow('Invalid cleanup strategy: type must be one of: activity, lifetime, hybrid');
    });

    it('should normalize activity strategy without activityTimeout', async () => {
      // Mock successful Docker operations
      const mockDockerContainer = {
        start: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          Id: 'docker-container-id-123',
          State: { Running: true }
        })
      };

      const mockDocker = containerManager['docker'] as any;
      mockDocker.createContainer = vi.fn().mockResolvedValue(mockDockerContainer);

      const strategy: CleanupStrategy = {
        type: 'activity'
        // Missing activityTimeout - should be normalized to 300
      };

      const container = await containerManager.createContainer({
        image: 'alpine:latest',
        cleanupStrategy: strategy
      });

      // Should normalize to include default activityTimeout
      expect(container.cleanupStrategy).toEqual({
        type: 'activity',
        activityTimeout: 300,
        maxLifetime: undefined,
        activityThresholds: undefined
      });
    });

    it('should reject lifetime strategy without maxLifetime', async () => {
      const invalidStrategy: CleanupStrategy = {
        type: 'lifetime'
        // Missing maxLifetime
      };

      await expect(
        containerManager.createContainer({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
      ).rejects.toThrow(ContainerManagerError);

      await expect(
        containerManager.createContainer({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
      ).rejects.toThrow('Invalid cleanup strategy: maxLifetime is required for lifetime-based cleanup strategy');
    });

    it('should reject hybrid strategy without any parameters', async () => {
      const invalidStrategy: CleanupStrategy = {
        type: 'hybrid'
        // Missing both maxLifetime and activityTimeout
      };

      await expect(
        containerManager.createContainer({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
      ).rejects.toThrow(ContainerManagerError);

      await expect(
        containerManager.createContainer({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
      ).rejects.toThrow('Invalid cleanup strategy: hybrid cleanup strategy requires either maxLifetime or activityTimeout (or both)');
    });

    it('should reject invalid activity thresholds', async () => {
      const invalidStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 300,
        activityThresholds: {
          minCpuPercent: 150 // Invalid - over 100%
        }
      };

      await expect(
        containerManager.createContainer({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
      ).rejects.toThrow(ContainerManagerError);

      await expect(
        containerManager.createContainer({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
      ).rejects.toThrow('Invalid cleanup strategy: activityThresholds.minCpuPercent must be a number between 0 and 100');
    });

    it('should reject negative values in cleanup strategy', async () => {
      const invalidStrategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: -300 // Invalid - negative
      };

      await expect(
        containerManager.createContainer({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
      ).rejects.toThrow(ContainerManagerError);

      await expect(
        containerManager.createContainer({
          image: 'alpine:latest',
          cleanupStrategy: invalidStrategy
        })
      ).rejects.toThrow('Invalid cleanup strategy: activityTimeout must be a positive number');
    });
  });

  describe('cleanup strategy normalization', () => {
    it('should apply default cleanup strategy when none provided', async () => {
      // Mock successful Docker operations
      const mockDockerContainer = {
        start: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          Id: 'docker-container-id-123',
          State: { Running: true }
        })
      };

      const mockDocker = containerManager['docker'] as any;
      mockDocker.createContainer = vi.fn().mockResolvedValue(mockDockerContainer);

      const container = await containerManager.createContainer({
        image: 'alpine:latest'
        // No cleanup strategy provided
      });

      expect(container.cleanupStrategy).toEqual({
        type: 'activity',
        activityTimeout: 300
      });
    });

    it('should normalize activity strategy without timeout', async () => {
      // Mock successful Docker operations
      const mockDockerContainer = {
        start: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          Id: 'docker-container-id-123',
          State: { Running: true }
        })
      };

      const mockDocker = containerManager['docker'] as any;
      mockDocker.createContainer = vi.fn().mockResolvedValue(mockDockerContainer);

      const container = await containerManager.createContainer({
        image: 'alpine:latest',
        cleanupStrategy: {
          type: 'activity'
          // No activityTimeout provided - should be normalized
        }
      });

      expect(container.cleanupStrategy).toEqual({
        type: 'activity',
        activityTimeout: 300
      });
    });

    it('should preserve provided cleanup strategy values', async () => {
      // Mock successful Docker operations
      const mockDockerContainer = {
        start: vi.fn().mockResolvedValue(undefined),
        inspect: vi.fn().mockResolvedValue({
          Id: 'docker-container-id-123',
          State: { Running: true }
        })
      };

      const mockDocker = containerManager['docker'] as any;
      mockDocker.createContainer = vi.fn().mockResolvedValue(mockDockerContainer);

      const customStrategy: CleanupStrategy = {
        type: 'hybrid',
        maxLifetime: 7200,
        activityTimeout: 600,
        activityThresholds: {
          minCpuPercent: 10,
          minMemoryMB: 100,
          minNetworkBytesPerSec: 1024
        }
      };

      const container = await containerManager.createContainer({
        image: 'alpine:latest',
        cleanupStrategy: customStrategy
      });

      expect(container.cleanupStrategy).toEqual(customStrategy);
    });
  });
});