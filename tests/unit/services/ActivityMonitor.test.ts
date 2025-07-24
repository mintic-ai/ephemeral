import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Docker from 'dockerode';
import { ActivityMonitor } from '../../../src/services/ActivityMonitor.js';
import { ActivityUpdate } from '../../../src/models/ActivityRecord.js';

// Mock dockerode
vi.mock('dockerode');

describe('ActivityMonitor', () => {
  let activityMonitor: ActivityMonitor;
  let mockDocker: vi.Mocked<Docker>;
  let mockContainer: any;

  beforeEach(() => {
    // Clear all timers before each test
    vi.clearAllTimers();
    vi.useFakeTimers();

    mockContainer = {
      stats: vi.fn()
    };

    mockDocker = {
      getContainer: vi.fn().mockReturnValue(mockContainer)
    } as any;

    activityMonitor = new ActivityMonitor(mockDocker);
  });

  afterEach(() => {
    activityMonitor.cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('updateActivity', () => {
    it('should record activity for a container', () => {
      const update: ActivityUpdate = {
        containerId: 'container-1',
        activityType: 'manual',
        details: { action: 'test' }
      };

      activityMonitor.updateActivity(update);

      const record = activityMonitor.getActivityRecord('container-1');
      expect(record).toBeDefined();
      expect(record?.containerId).toBe('container-1');
      expect(record?.activityType).toBe('manual');
      expect(record?.details).toEqual({ action: 'test' });
      expect(record?.timestamp).toBeInstanceOf(Date);
    });

    it('should update existing activity record', () => {
      const firstUpdate: ActivityUpdate = {
        containerId: 'container-1',
        activityType: 'manual',
        details: { action: 'first' }
      };

      const secondUpdate: ActivityUpdate = {
        containerId: 'container-1',
        activityType: 'http_request',
        details: { action: 'second' }
      };

      activityMonitor.updateActivity(firstUpdate);
      const firstTimestamp = activityMonitor.getLastActivity('container-1');

      // Advance time to ensure different timestamp
      vi.advanceTimersByTime(1000);

      activityMonitor.updateActivity(secondUpdate);
      const secondTimestamp = activityMonitor.getLastActivity('container-1');

      expect(secondTimestamp).not.toEqual(firstTimestamp);
      
      const record = activityMonitor.getActivityRecord('container-1');
      expect(record?.activityType).toBe('http_request');
      expect(record?.details).toEqual({ action: 'second' });
    });
  });

  describe('getLastActivity', () => {
    it('should return last activity timestamp for existing container', () => {
      const update: ActivityUpdate = {
        containerId: 'container-1',
        activityType: 'heartbeat'
      };

      activityMonitor.updateActivity(update);
      const timestamp = activityMonitor.getLastActivity('container-1');

      expect(timestamp).toBeInstanceOf(Date);
    });

    it('should return null for non-existent container', () => {
      const timestamp = activityMonitor.getLastActivity('non-existent');
      expect(timestamp).toBeNull();
    });
  });

  describe('getActivityRecord', () => {
    it('should return full activity record for existing container', () => {
      const update: ActivityUpdate = {
        containerId: 'container-1',
        activityType: 'resource_usage',
        details: { cpu: 0.5, memory: 1024 }
      };

      activityMonitor.updateActivity(update);
      const record = activityMonitor.getActivityRecord('container-1');

      expect(record).toBeDefined();
      expect(record?.containerId).toBe('container-1');
      expect(record?.activityType).toBe('resource_usage');
      expect(record?.details).toEqual({ cpu: 0.5, memory: 1024 });
    });

    it('should return null for non-existent container', () => {
      const record = activityMonitor.getActivityRecord('non-existent');
      expect(record).toBeNull();
    });
  });

  describe('startMonitoring', () => {
    it('should initialize activity record and start stats monitoring', () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';

      activityMonitor.startMonitoring(containerId, dockerId);

      const record = activityMonitor.getActivityRecord(containerId);
      expect(record).toBeDefined();
      expect(record?.containerId).toBe(containerId);
      expect(record?.activityType).toBe('manual');
      expect(record?.details).toEqual({ action: 'monitoring_started' });
    });

    it('should set up periodic stats monitoring', () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';

      mockContainer.stats.mockResolvedValue({
        cpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000,
          online_cpus: 2
        },
        precpu_stats: {
          cpu_usage: { total_usage: 500000 },
          system_cpu_usage: 1000000
        },
        memory_stats: { usage: 1024 },
        networks: {
          eth0: { rx_bytes: 100, tx_bytes: 200 }
        }
      });

      activityMonitor.startMonitoring(containerId, dockerId);

      // Advance time to trigger stats check
      vi.advanceTimersByTime(30000);

      expect(mockDocker.getContainer).toHaveBeenCalledWith(dockerId);
      expect(mockContainer.stats).toHaveBeenCalledWith({ stream: false });
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring and update activity record', () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';

      activityMonitor.startMonitoring(containerId, dockerId);
      activityMonitor.stopMonitoring(containerId);

      const record = activityMonitor.getActivityRecord(containerId);
      expect(record?.details).toEqual({ action: 'monitoring_stopped' });
    });

    it('should clear monitoring interval', () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';

      activityMonitor.startMonitoring(containerId, dockerId);
      
      // Verify interval is set up
      vi.advanceTimersByTime(30000);
      expect(mockContainer.stats).toHaveBeenCalled();

      mockContainer.stats.mockClear();
      activityMonitor.stopMonitoring(containerId);

      // Advance time and verify stats are no longer called
      vi.advanceTimersByTime(30000);
      expect(mockContainer.stats).not.toHaveBeenCalled();
    });
  });

  describe('removeActivityRecord', () => {
    it('should remove activity record and stop monitoring', () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';

      activityMonitor.startMonitoring(containerId, dockerId);
      expect(activityMonitor.getActivityRecord(containerId)).toBeDefined();

      activityMonitor.removeActivityRecord(containerId);
      expect(activityMonitor.getActivityRecord(containerId)).toBeNull();
    });
  });

  describe('getAllActivityRecords', () => {
    it('should return all activity records', () => {
      const update1: ActivityUpdate = {
        containerId: 'container-1',
        activityType: 'manual'
      };

      const update2: ActivityUpdate = {
        containerId: 'container-2',
        activityType: 'heartbeat'
      };

      activityMonitor.updateActivity(update1);
      activityMonitor.updateActivity(update2);

      const allRecords = activityMonitor.getAllActivityRecords();
      expect(allRecords.size).toBe(2);
      expect(allRecords.has('container-1')).toBe(true);
      expect(allRecords.has('container-2')).toBe(true);
    });

    it('should return empty map when no records exist', () => {
      const allRecords = activityMonitor.getAllActivityRecords();
      expect(allRecords.size).toBe(0);
    });
  });

  describe('Docker stats monitoring', () => {
    it('should set up monitoring interval when starting monitoring', () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';

      activityMonitor.startMonitoring(containerId, dockerId);

      // Verify that the interval was set up by checking if Docker API is called after time advance
      vi.advanceTimersByTime(30000);
      expect(mockDocker.getContainer).toHaveBeenCalledWith(dockerId);
    });

    it('should call Docker stats API during monitoring', () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';

      mockContainer.stats.mockResolvedValue({
        cpu_stats: { cpu_usage: { total_usage: 1000000 }, system_cpu_usage: 2000000, online_cpus: 1 },
        precpu_stats: { cpu_usage: { total_usage: 1000000 }, system_cpu_usage: 2000000 },
        memory_stats: { usage: 0 },
        networks: {}
      });

      activityMonitor.startMonitoring(containerId, dockerId);

      // Advance time to trigger stats check
      vi.advanceTimersByTime(30000);

      expect(mockContainer.stats).toHaveBeenCalledWith({ stream: false });
    });

    it('should handle Docker API errors gracefully during monitoring', () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';

      mockContainer.stats.mockRejectedValue(new Error('No such container'));

      activityMonitor.startMonitoring(containerId, dockerId);

      // Advance time to trigger stats check - should not throw
      expect(() => {
        vi.advanceTimersByTime(30000);
      }).not.toThrow();

      expect(mockContainer.stats).toHaveBeenCalled();
    });

    it('should continue monitoring after non-fatal errors', () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';

      mockContainer.stats
        .mockRejectedValueOnce(new Error('No such container'))
        .mockResolvedValue({
          cpu_stats: { cpu_usage: { total_usage: 1000000 }, system_cpu_usage: 2000000, online_cpus: 1 },
          precpu_stats: { cpu_usage: { total_usage: 1000000 }, system_cpu_usage: 2000000 },
          memory_stats: { usage: 0 },
          networks: {}
        });

      activityMonitor.startMonitoring(containerId, dockerId);

      // First call should fail
      vi.advanceTimersByTime(30000);
      expect(mockContainer.stats).toHaveBeenCalledTimes(1);

      // Second call should succeed
      vi.advanceTimersByTime(30000);
      expect(mockContainer.stats).toHaveBeenCalledTimes(2);
    });
  });

  describe('CPU usage calculation', () => {
    it('should calculate CPU usage correctly', () => {
      const stats = {
        cpu_stats: {
          cpu_usage: { total_usage: 2000000 },
          system_cpu_usage: 4000000,
          online_cpus: 2
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000
        }
      };

      // Access private method for testing
      const cpuUsage = (activityMonitor as any).calculateCpuUsage(stats);
      expect(cpuUsage).toBeGreaterThan(0);
      expect(cpuUsage).toBe(1); // (2000000-1000000)/(4000000-2000000) * 2 = 1
    });

    it('should return 0 for invalid stats', () => {
      const invalidStats = [
        null,
        undefined,
        {},
        { cpu_stats: null },
        { cpu_stats: {}, precpu_stats: {} },
        { cpu_stats: { cpu_usage: null }, precpu_stats: { cpu_usage: null } }
      ];

      invalidStats.forEach(stats => {
        const cpuUsage = (activityMonitor as any).calculateCpuUsage(stats);
        expect(cpuUsage).toBe(0);
      });
    });
  });

  describe('Network activity detection', () => {
    it('should detect network activity when there is traffic', () => {
      const stats = {
        networks: {
          eth0: { rx_bytes: 100, tx_bytes: 200 }
        }
      };

      const hasActivity = (activityMonitor as any).checkNetworkActivity(stats);
      expect(hasActivity).toBe(true);
    });

    it('should not detect activity when there is no traffic', () => {
      const stats = {
        networks: {
          eth0: { rx_bytes: 0, tx_bytes: 0 }
        }
      };

      const hasActivity = (activityMonitor as any).checkNetworkActivity(stats);
      expect(hasActivity).toBe(false);
    });

    it('should handle missing or invalid network stats', () => {
      const invalidStats = [
        null,
        undefined,
        {},
        { networks: null },
        { networks: {} }
      ];

      invalidStats.forEach(stats => {
        const hasActivity = (activityMonitor as any).checkNetworkActivity(stats);
        expect(hasActivity).toBe(false);
      });
    });
  });

  describe('cleanup', () => {
    it('should stop all monitoring and clear records', () => {
      const containerId1 = 'container-1';
      const containerId2 = 'container-2';

      activityMonitor.startMonitoring(containerId1, 'docker-1');
      activityMonitor.startMonitoring(containerId2, 'docker-2');

      expect(activityMonitor.getAllActivityRecords().size).toBe(2);

      activityMonitor.cleanup();

      expect(activityMonitor.getAllActivityRecords().size).toBe(0);
      
      // Verify intervals are cleared
      vi.advanceTimersByTime(30000);
      expect(mockContainer.stats).not.toHaveBeenCalled();
    });
  });
});