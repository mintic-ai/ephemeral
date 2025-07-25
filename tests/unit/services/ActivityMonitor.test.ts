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

    it('should store custom activity thresholds when provided', () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';
      const thresholds = {
        minCpuPercent: 10,
        minMemoryMB: 100,
        minNetworkBytesPerSec: 1000
      };

      activityMonitor.startMonitoring(containerId, dockerId, thresholds);

      // Verify thresholds are stored (we'll test their usage in other tests)
      const record = activityMonitor.getActivityRecord(containerId);
      expect(record).toBeDefined();
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

  describe('Memory usage calculation', () => {
    it('should calculate memory usage in MB correctly', () => {
      const stats = {
        memory_stats: { usage: 1048576 } // 1 MB in bytes
      };

      const memoryUsage = (activityMonitor as any).calculateMemoryUsageMB(stats);
      expect(memoryUsage).toBe(1);
    });

    it('should return 0 for invalid memory stats', () => {
      const invalidStats = [
        null,
        undefined,
        {},
        { memory_stats: null },
        { memory_stats: {} },
        { memory_stats: { usage: null } }
      ];

      invalidStats.forEach(stats => {
        const memoryUsage = (activityMonitor as any).calculateMemoryUsageMB(stats);
        expect(memoryUsage).toBe(0);
      });
    });
  });

  describe('Network bytes per second calculation', () => {
    it('should calculate network bytes per second correctly', () => {
      const containerId = 'container-1';
      const stats1 = {
        networks: {
          eth0: { rx_bytes: 1000, tx_bytes: 2000 }
        }
      };
      const stats2 = {
        networks: {
          eth0: { rx_bytes: 2000, tx_bytes: 4000 }
        }
      };

      // First call establishes baseline
      const firstResult = (activityMonitor as any).calculateNetworkBytesPerSec(containerId, stats1);
      expect(firstResult).toBe(0);

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);

      // Second call should calculate rate
      const secondResult = (activityMonitor as any).calculateNetworkBytesPerSec(containerId, stats2);
      expect(secondResult).toBeGreaterThan(0);
    });

    it('should return 0 for invalid network stats', () => {
      const containerId = 'container-1';
      const invalidStats = [
        null,
        undefined,
        {},
        { networks: null },
        { networks: {} }
      ];

      invalidStats.forEach(stats => {
        const networkRate = (activityMonitor as any).calculateNetworkBytesPerSec(containerId, stats);
        expect(networkRate).toBe(0);
      });
    });
  });

  describe('Custom activity threshold evaluation', () => {
    it('should detect activity when CPU threshold is exceeded', async () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';
      const thresholds = { minCpuPercent: 10 };

      const stats = {
        cpu_stats: {
          cpu_usage: { total_usage: 2000000 },
          system_cpu_usage: 4000000,
          online_cpus: 1
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000
        },
        memory_stats: { usage: 0 },
        networks: {}
      };

      mockContainer.stats.mockResolvedValue(stats);
      activityMonitor.startMonitoring(containerId, dockerId, thresholds);

      // Advance time to trigger stats check and wait for async operations
      vi.advanceTimersByTime(30000);
      await vi.runOnlyPendingTimersAsync();

      // Should detect activity due to CPU usage (50% > 10%)
      const record = activityMonitor.getActivityRecord(containerId);
      expect(record?.activityType).toBe('resource_usage');
    });

    it('should detect activity when memory threshold is exceeded', async () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';
      const thresholds = { minMemoryMB: 50 };

      const stats = {
        cpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000,
          online_cpus: 1
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000
        },
        memory_stats: { usage: 104857600 }, // 100 MB
        networks: {}
      };

      mockContainer.stats.mockResolvedValue(stats);
      activityMonitor.startMonitoring(containerId, dockerId, thresholds);

      // Advance time to trigger stats check and wait for async operations
      vi.advanceTimersByTime(30000);
      await vi.runOnlyPendingTimersAsync();

      // Should detect activity due to memory usage (100 MB > 50 MB)
      const record = activityMonitor.getActivityRecord(containerId);
      expect(record?.activityType).toBe('resource_usage');
    });

    it('should detect activity when network threshold is exceeded', async () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';
      const thresholds = { minNetworkBytesPerSec: 100 };

      const stats1 = {
        cpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000,
          online_cpus: 1
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000
        },
        memory_stats: { usage: 0 },
        networks: {
          eth0: { rx_bytes: 1000, tx_bytes: 1000 }
        }
      };

      const stats2 = {
        cpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000,
          online_cpus: 1
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000
        },
        memory_stats: { usage: 0 },
        networks: {
          eth0: { rx_bytes: 5000, tx_bytes: 5000 } // Much higher values to ensure threshold is exceeded
        }
      };

      mockContainer.stats
        .mockResolvedValueOnce(stats1)
        .mockResolvedValue(stats2);

      activityMonitor.startMonitoring(containerId, dockerId, thresholds);

      // First stats call establishes baseline
      vi.advanceTimersByTime(30000);
      await vi.runOnlyPendingTimersAsync();
      
      // Second stats call should detect network activity
      // The network rate should be (10000 - 2000) / 30 = 266.67 bytes/sec > 100 threshold
      vi.advanceTimersByTime(30000);
      await vi.runOnlyPendingTimersAsync();

      const record = activityMonitor.getActivityRecord(containerId);
      expect(record?.activityType).toBe('resource_usage');
    });

    it('should not detect activity when no thresholds are exceeded', () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';
      const thresholds = {
        minCpuPercent: 50,
        minMemoryMB: 100,
        minNetworkBytesPerSec: 1000
      };

      const stats = {
        cpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000,
          online_cpus: 1
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000
        },
        memory_stats: { usage: 1048576 }, // 1 MB
        networks: {
          eth0: { rx_bytes: 10, tx_bytes: 10 }
        }
      };

      mockContainer.stats.mockResolvedValue(stats);
      activityMonitor.startMonitoring(containerId, dockerId, thresholds);

      // Store initial activity record
      const initialRecord = activityMonitor.getActivityRecord(containerId);
      const initialTimestamp = initialRecord?.timestamp;

      // Advance time to trigger stats check
      vi.advanceTimersByTime(30000);

      // Should not update activity since no thresholds are exceeded
      const record = activityMonitor.getActivityRecord(containerId);
      expect(record?.timestamp).toEqual(initialTimestamp);
      expect(record?.activityType).toBe('manual'); // Still the initial monitoring_started record
    });

    it('should use any threshold that is exceeded (OR logic)', async () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';
      const thresholds = {
        minCpuPercent: 50, // High threshold, won't be exceeded
        minMemoryMB: 10,   // Low threshold, will be exceeded
        minNetworkBytesPerSec: 1000 // High threshold, won't be exceeded
      };

      const stats = {
        cpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000,
          online_cpus: 1
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000
        },
        memory_stats: { usage: 52428800 }, // 50 MB
        networks: {
          eth0: { rx_bytes: 10, tx_bytes: 10 }
        }
      };

      mockContainer.stats.mockResolvedValue(stats);
      activityMonitor.startMonitoring(containerId, dockerId, thresholds);

      // Advance time to trigger stats check and wait for async operations
      vi.advanceTimersByTime(30000);
      await vi.runOnlyPendingTimersAsync();

      // Should detect activity due to memory threshold being exceeded
      const record = activityMonitor.getActivityRecord(containerId);
      expect(record?.activityType).toBe('resource_usage');
    });
  });

  describe('Default activity detection fallback', () => {
    it('should use default detection when no custom thresholds are provided', async () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';

      const stats = {
        cpu_stats: {
          cpu_usage: { total_usage: 1100000 },
          system_cpu_usage: 2000000,
          online_cpus: 1
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000
        },
        memory_stats: { usage: 1048576 },
        networks: {
          eth0: { rx_bytes: 100, tx_bytes: 200 }
        }
      };

      mockContainer.stats.mockResolvedValue(stats);
      activityMonitor.startMonitoring(containerId, dockerId); // No thresholds provided

      // Advance time to trigger stats check and wait for async operations
      vi.advanceTimersByTime(30000);
      await vi.runOnlyPendingTimersAsync();

      // Should detect activity using default logic (CPU > 1% or network activity)
      const record = activityMonitor.getActivityRecord(containerId);
      expect(record?.activityType).toBe('resource_usage');
    });

    it('should not detect activity with default detection when usage is minimal', () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';

      const stats = {
        cpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000,
          online_cpus: 1
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000
        },
        memory_stats: { usage: 1048576 },
        networks: {
          eth0: { rx_bytes: 0, tx_bytes: 0 }
        }
      };

      mockContainer.stats.mockResolvedValue(stats);
      activityMonitor.startMonitoring(containerId, dockerId); // No thresholds provided

      // Store initial activity record
      const initialRecord = activityMonitor.getActivityRecord(containerId);
      const initialTimestamp = initialRecord?.timestamp;

      // Advance time to trigger stats check
      vi.advanceTimersByTime(30000);

      // Should not update activity since usage is minimal
      const record = activityMonitor.getActivityRecord(containerId);
      expect(record?.timestamp).toEqual(initialTimestamp);
      expect(record?.activityType).toBe('manual'); // Still the initial monitoring_started record
    });
  });

  describe('Activity evaluation integration', () => {
    it('should include detailed metrics in activity record when activity is detected', async () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';
      const thresholds = { minCpuPercent: 10 };

      const stats = {
        cpu_stats: {
          cpu_usage: { total_usage: 2000000 },
          system_cpu_usage: 4000000,
          online_cpus: 1
        },
        precpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000
        },
        memory_stats: { usage: 52428800 }, // 50 MB
        networks: {
          eth0: { rx_bytes: 1000, tx_bytes: 2000 }
        }
      };

      mockContainer.stats.mockResolvedValue(stats);
      activityMonitor.startMonitoring(containerId, dockerId, thresholds);

      // Advance time to trigger stats check and wait for async operations
      vi.advanceTimersByTime(30000);
      await vi.runOnlyPendingTimersAsync();

      const record = activityMonitor.getActivityRecord(containerId);
      expect(record?.activityType).toBe('resource_usage');
      expect(record?.details).toMatchObject({
        cpu_usage_percent: expect.any(Number),
        memory_usage_mb: expect.any(Number),
        network_bytes_per_sec: expect.any(Number),
        timestamp: expect.any(String)
      });
      expect(record?.details?.cpu_usage_percent).toBeGreaterThan(0);
      expect(record?.details?.memory_usage_mb).toBeGreaterThan(0);
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

    it('should clear custom thresholds and network stats on cleanup', () => {
      const containerId = 'container-1';
      const dockerId = 'docker-123';
      const thresholds = { minCpuPercent: 10 };

      activityMonitor.startMonitoring(containerId, dockerId, thresholds);
      
      // Verify cleanup clears all internal state
      activityMonitor.cleanup();
      
      // Start monitoring again - should work without issues
      activityMonitor.startMonitoring(containerId, dockerId, thresholds);
      const record = activityMonitor.getActivityRecord(containerId);
      expect(record).toBeDefined();
    });
  });
});