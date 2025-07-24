import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CleanupScheduler, CleanupSchedulerError } from '../../../src/services/CleanupScheduler.js';
import { ContainerManager } from '../../../src/services/ContainerManager.js';
import { ActivityMonitor } from '../../../src/services/ActivityMonitor.js';
import { ConfigManager } from '../../../src/services/ConfigManager.js';
import { Container } from '../../../src/models/Container.js';
import { SystemConfig } from '../../../src/models/SystemConfig.js';

// Mock node-cron
vi.mock('node-cron', () => {
  const mockCronTask = {
    start: vi.fn(),
    stop: vi.fn()
  };
  
  return {
    schedule: vi.fn().mockReturnValue(mockCronTask)
  };
});

describe('CleanupScheduler', () => {
  let cleanupScheduler: CleanupScheduler;
  let mockContainerManager: ContainerManager;
  let mockActivityMonitor: ActivityMonitor;
  let mockConfigManager: ConfigManager;
  let mockConfig: SystemConfig;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock config
    mockConfig = {
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

    // Create mock services
    mockContainerManager = {
      listContainers: vi.fn(),
      removeContainer: vi.fn(),
      createContainer: vi.fn(),
      getContainer: vi.fn(),
      getActiveContainerCount: vi.fn(),
      getContainerIds: vi.fn(),
      hasContainer: vi.fn(),
      clear: vi.fn()
    } as any;

    mockActivityMonitor = {
      getLastActivity: vi.fn(),
      removeActivityRecord: vi.fn(),
      startMonitoring: vi.fn(),
      stopMonitoring: vi.fn(),
      updateActivity: vi.fn(),
      getActivityRecord: vi.fn(),
      getAllActivityRecords: vi.fn(),
      cleanup: vi.fn()
    } as any;

    mockConfigManager = {
      getConfig: vi.fn().mockReturnValue(mockConfig),
      loadConfig: vi.fn().mockReturnValue(mockConfig),
      reset: vi.fn()
    } as any;

    cleanupScheduler = new CleanupScheduler(
      mockContainerManager,
      mockActivityMonitor,
      mockConfigManager
    );
  });

  afterEach(() => {
    // Ensure scheduler is stopped after each test
    cleanupScheduler.stop();
  });

  describe('Constructor', () => {
    it('should create CleanupScheduler with provided dependencies', () => {
      expect(cleanupScheduler).toBeInstanceOf(CleanupScheduler);
      expect(cleanupScheduler.isSchedulerRunning()).toBe(false);
    });

    it('should use ConfigManager singleton if no config manager provided', () => {
      const scheduler = new CleanupScheduler(mockContainerManager, mockActivityMonitor);
      expect(scheduler).toBeInstanceOf(CleanupScheduler);
    });
  });

  describe('start()', () => {
    it('should start the cleanup scheduler successfully', async () => {
      const cron = await import('node-cron');
      
      cleanupScheduler.start();

      expect(cron.schedule).toHaveBeenCalledWith(
        '0 */1 * * * *', // Every 1 minute for 60 second interval
        expect.any(Function),
        { scheduled: false }
      );
      expect(cleanupScheduler.isSchedulerRunning()).toBe(true);
    });

    it('should throw error if scheduler is already running', () => {
      cleanupScheduler.start();

      expect(() => cleanupScheduler.start()).toThrow(CleanupSchedulerError);
      expect(() => cleanupScheduler.start()).toThrow('Cleanup scheduler is already running');
    });

    it('should create correct cron expression for different intervals', async () => {
      const cron = await import('node-cron');
      
      // Test 30 second interval
      mockConfig.cleanup.interval = 30;
      cleanupScheduler = new CleanupScheduler(mockContainerManager, mockActivityMonitor, mockConfigManager);
      cleanupScheduler.start();
      expect(cron.schedule).toHaveBeenCalledWith(
        '*/30 * * * * *',
        expect.any(Function),
        { scheduled: false }
      );
      cleanupScheduler.stop();

      // Test 2 hour interval
      mockConfig.cleanup.interval = 7200;
      cleanupScheduler = new CleanupScheduler(mockContainerManager, mockActivityMonitor, mockConfigManager);
      cleanupScheduler.start();
      expect(cron.schedule).toHaveBeenCalledWith(
        '0 0 */2 * * *',
        expect.any(Function),
        { scheduled: false }
      );
    });
  });

  describe('stop()', () => {
    it('should stop the cleanup scheduler', async () => {
      const cron = await import('node-cron');
      const mockTask = vi.mocked(cron.schedule).mock.results[0]?.value;
      
      cleanupScheduler.start();
      cleanupScheduler.stop();

      if (mockTask) {
        expect(mockTask.stop).toHaveBeenCalled();
      }
      expect(cleanupScheduler.isSchedulerRunning()).toBe(false);
    });

    it('should handle stopping when not running', () => {
      expect(() => cleanupScheduler.stop()).not.toThrow();
      expect(cleanupScheduler.isSchedulerRunning()).toBe(false);
    });
  });

  describe('performManualCleanup()', () => {
    const mockContainers: Container[] = [
      {
        id: 'container1',
        dockerId: 'docker1',
        image: 'alpine:latest',
        status: 'running',
        createdAt: new Date('2025-01-23T10:00:00Z'),
        lastActivity: new Date('2025-01-23T10:00:00Z'),
        connection: { host: 'localhost', port: 8001 },
        environment: {},
        metadata: {}
      },
      {
        id: 'container2',
        dockerId: 'docker2',
        image: 'alpine:latest',
        status: 'running',
        createdAt: new Date('2025-01-23T10:00:00Z'),
        lastActivity: new Date('2025-01-23T10:00:00Z'),
        connection: { host: 'localhost', port: 8002 },
        environment: {},
        metadata: {}
      }
    ];

    beforeEach(() => {
      mockContainerManager.listContainers.mockResolvedValue(mockContainers);
    });

    it('should perform cleanup and remove inactive containers', async () => {
      // Mock current time to be 10 minutes after last activity (exceeds 5 minute timeout)
      const currentTime = new Date('2025-01-23T10:10:00Z');
      vi.setSystemTime(currentTime);

      // Mock last activity times - container1 is inactive, container2 is active
      mockActivityMonitor.getLastActivity
        .mockReturnValueOnce(new Date('2025-01-23T10:04:00Z')) // 6 minutes ago - should be removed
        .mockReturnValueOnce(new Date('2025-01-23T10:09:00Z')); // 1 minute ago - should not be removed

      mockContainerManager.removeContainer.mockResolvedValue(undefined);

      const result = await cleanupScheduler.performManualCleanup();

      expect(result.totalContainersChecked).toBe(2);
      expect(result.containersRemoved).toBe(1);
      expect(result.containersFailed).toBe(0);
      expect(mockContainerManager.removeContainer).toHaveBeenCalledWith('container1');
      expect(mockActivityMonitor.removeActivityRecord).toHaveBeenCalledWith('container1');
    });

    it('should handle containers with no activity records', async () => {
      mockActivityMonitor.getLastActivity.mockReturnValue(null);
      mockContainerManager.removeContainer.mockResolvedValue(undefined);

      const result = await cleanupScheduler.performManualCleanup();

      expect(result.totalContainersChecked).toBe(2);
      expect(result.containersRemoved).toBe(2);
      expect(mockContainerManager.removeContainer).toHaveBeenCalledTimes(2);
    });

    it('should handle container removal failures and retry logic', async () => {
      const currentTime = new Date('2025-01-23T10:10:00Z');
      vi.setSystemTime(currentTime);

      mockActivityMonitor.getLastActivity.mockReturnValue(new Date('2025-01-23T10:04:00Z'));
      mockContainerManager.removeContainer
        .mockRejectedValueOnce(new Error('Docker daemon error'))
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined); // For retry queue processing

      const result = await cleanupScheduler.performManualCleanup();

      expect(result.totalContainersChecked).toBe(2);
      expect(result.containersRemoved).toBe(2); // container2 succeeds, container1 succeeds on retry
      expect(result.containersFailed).toBe(1); // container1 fails initially
      expect(result.results).toHaveLength(3); // 2 initial attempts + 1 retry
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('Docker daemon error');
    });

    it('should process retry queue on subsequent cleanups', async () => {
      const currentTime = new Date('2025-01-23T10:10:00Z');
      vi.setSystemTime(currentTime);

      mockActivityMonitor.getLastActivity.mockReturnValue(new Date('2025-01-23T10:04:00Z'));
      
      // First cleanup - container1 fails, container2 succeeds, then retry fails again
      mockContainerManager.removeContainer
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Temporary failure')); // Retry also fails

      const firstResult = await cleanupScheduler.performManualCleanup();
      expect(firstResult.containersFailed).toBe(2); // Initial failure + retry failure
      expect(cleanupScheduler.getRetryQueueStatus().has('container1')).toBe(true);

      // Second cleanup - retry container1 successfully
      mockContainerManager.listContainers.mockResolvedValue([]);
      mockContainerManager.removeContainer.mockResolvedValueOnce(undefined);

      const secondResult = await cleanupScheduler.performManualCleanup();
      expect(secondResult.containersRemoved).toBe(1);
      expect(cleanupScheduler.getRetryQueueStatus().has('container1')).toBe(false);
    });

    it('should give up after max retry attempts', async () => {
      const currentTime = new Date('2025-01-23T10:10:00Z');
      vi.setSystemTime(currentTime);

      mockActivityMonitor.getLastActivity.mockReturnValue(new Date('2025-01-23T10:04:00Z'));
      mockContainerManager.removeContainer.mockRejectedValue(new Error('Persistent failure'));

      // Perform cleanups up to max retry attempts
      for (let i = 0; i < mockConfig.cleanup.maxRetryAttempts; i++) {
        mockContainerManager.listContainers.mockResolvedValue(i === 0 ? [mockContainers[0]] : []);
        await cleanupScheduler.performManualCleanup();
      }

      // Container should be removed from retry queue after max attempts
      expect(cleanupScheduler.getRetryQueueStatus().has('container1')).toBe(false);
    });
  });

  describe('timeout calculations', () => {
    it('should correctly identify inactive containers based on timeout', async () => {
      const container: Container = {
        id: 'test-container',
        dockerId: 'docker-test',
        image: 'alpine:latest',
        status: 'running',
        createdAt: new Date('2025-01-23T10:00:00Z'),
        lastActivity: new Date('2025-01-23T10:00:00Z'),
        connection: { host: 'localhost', port: 8001 },
        environment: {},
        metadata: {}
      };

      mockContainerManager.listContainers.mockResolvedValue([container]);

      // Test case 1: Container is still active (within timeout)
      let currentTime = new Date('2025-01-23T10:04:00Z'); // 4 minutes after last activity
      vi.setSystemTime(currentTime);
      mockActivityMonitor.getLastActivity.mockReturnValue(new Date('2025-01-23T10:00:00Z'));

      let result = await cleanupScheduler.performManualCleanup();
      expect(result.containersRemoved).toBe(0);

      // Test case 2: Container is inactive (exceeds timeout)
      currentTime = new Date('2025-01-23T10:06:00Z'); // 6 minutes after last activity
      vi.setSystemTime(currentTime);
      mockContainerManager.removeContainer.mockResolvedValue(undefined);

      result = await cleanupScheduler.performManualCleanup();
      expect(result.containersRemoved).toBe(1);
    });

    it('should use different timeout values from config', async () => {
      // Set shorter timeout
      mockConfig.cleanup.inactivityTimeout = 60; // 1 minute
      cleanupScheduler = new CleanupScheduler(mockContainerManager, mockActivityMonitor, mockConfigManager);

      const container: Container = {
        id: 'test-container',
        dockerId: 'docker-test',
        image: 'alpine:latest',
        status: 'running',
        createdAt: new Date('2025-01-23T10:00:00Z'),
        lastActivity: new Date('2025-01-23T10:00:00Z'),
        connection: { host: 'localhost', port: 8001 },
        environment: {},
        metadata: {}
      };

      mockContainerManager.listContainers.mockResolvedValue([container]);
      mockActivityMonitor.getLastActivity.mockReturnValue(new Date('2025-01-23T10:00:00Z'));
      mockContainerManager.removeContainer.mockResolvedValue(undefined);

      // 2 minutes after last activity should trigger removal with 1 minute timeout
      const currentTime = new Date('2025-01-23T10:02:00Z');
      vi.setSystemTime(currentTime);

      const result = await cleanupScheduler.performManualCleanup();
      expect(result.containersRemoved).toBe(1);
    });
  });

  describe('cleanup history and monitoring', () => {
    it('should maintain cleanup history', async () => {
      mockContainerManager.listContainers.mockResolvedValue([]);

      await cleanupScheduler.performManualCleanup();
      await cleanupScheduler.performManualCleanup();

      const history = cleanupScheduler.getCleanupHistory();
      expect(history).toHaveLength(2);
      expect(history[0].timestamp).toBeInstanceOf(Date);
      expect(history[1].timestamp).toBeInstanceOf(Date);
    });

    it('should limit history size', async () => {
      mockContainerManager.listContainers.mockResolvedValue([]);

      // Perform more cleanups than the max history size (100)
      for (let i = 0; i < 105; i++) {
        await cleanupScheduler.performManualCleanup();
      }

      const history = cleanupScheduler.getCleanupHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });

    it('should provide retry queue status', () => {
      const retryStatus = cleanupScheduler.getRetryQueueStatus();
      expect(retryStatus).toBeInstanceOf(Map);
      expect(retryStatus.size).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle errors during container listing', async () => {
      mockContainerManager.listContainers.mockRejectedValue(new Error('Docker connection failed'));

      const result = await cleanupScheduler.performManualCleanup();
      
      expect(result.totalContainersChecked).toBe(0);
      expect(result.containersRemoved).toBe(0);
      expect(result.containersFailed).toBe(0);
    });

    it('should handle errors gracefully and continue operation', async () => {
      const containers: Container[] = [
        {
          id: 'container1',
          dockerId: 'docker1',
          image: 'alpine:latest',
          status: 'running',
          createdAt: new Date(),
          lastActivity: new Date(),
          connection: { host: 'localhost', port: 8001 },
          environment: {},
          metadata: {}
        }
      ];

      mockContainerManager.listContainers.mockResolvedValue(containers);
      mockActivityMonitor.getLastActivity.mockReturnValue(new Date('2025-01-23T10:00:00Z'));
      
      // Mock current time to trigger cleanup
      vi.setSystemTime(new Date('2025-01-23T10:10:00Z'));
      
      // Mock removal to throw error (both initial attempt and retry)
      mockContainerManager.removeContainer.mockRejectedValue(new Error('Removal failed'));

      const result = await cleanupScheduler.performManualCleanup();
      
      expect(result.totalContainersChecked).toBe(1);
      expect(result.containersRemoved).toBe(0);
      expect(result.containersFailed).toBe(2); // Initial failure + retry failure
      expect(result.results[0].error).toBe('Removal failed');
    });
  });
});