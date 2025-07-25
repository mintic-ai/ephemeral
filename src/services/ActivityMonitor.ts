import Docker from 'dockerode';
import { ActivityRecord, ActivityUpdate } from '../models/ActivityRecord';
import { ActivityThresholds } from '../models/Container';
import { ErrorHandler } from '../utils/ErrorHandler';
import { Logger } from '../utils/Logger';

export class ActivityMonitor {
  private docker: Docker;
  private activityRecords: Map<string, ActivityRecord> = new Map();
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private containerThresholds: Map<string, ActivityThresholds> = new Map();
  private previousNetworkStats: Map<string, any> = new Map();
  private readonly STATS_MONITORING_INTERVAL = 30000; // 30 seconds
  private logger: Logger;

  constructor(docker: Docker) {
    this.docker = docker;
    this.logger = Logger.getInstance();
  }

  /**
   * Start monitoring a container for activity
   */
  public startMonitoring(containerId: string, dockerId: string, activityThresholds?: ActivityThresholds): void {
    // Store custom activity thresholds if provided
    if (activityThresholds) {
      this.containerThresholds.set(containerId, activityThresholds);
    }

    // Initialize activity record for the container
    this.activityRecords.set(containerId, {
      containerId,
      timestamp: new Date(),
      activityType: 'manual',
      details: { action: 'monitoring_started' }
    });

    // Start Docker stats monitoring
    this.startStatsMonitoring(containerId, dockerId);
  }

  /**
   * Stop monitoring a container
   */
  public stopMonitoring(containerId: string): void {
    const interval = this.monitoringIntervals.get(containerId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(containerId);
    }
    
    // Keep the last activity record but stop active monitoring
    this.updateActivity({
      containerId,
      activityType: 'manual',
      details: { action: 'monitoring_stopped' }
    });
  }

  /**
   * Update activity for a container
   */
  public updateActivity(update: ActivityUpdate): void {
    const activityRecord: ActivityRecord = {
      containerId: update.containerId,
      timestamp: new Date(),
      activityType: update.activityType,
      details: update.details || {}
    };

    this.activityRecords.set(update.containerId, activityRecord);
  }

  /**
   * Get the last activity timestamp for a container
   */
  public getLastActivity(containerId: string): Date | null {
    const record = this.activityRecords.get(containerId);
    return record ? record.timestamp : null;
  }

  /**
   * Get the full activity record for a container
   */
  public getActivityRecord(containerId: string): ActivityRecord | null {
    return this.activityRecords.get(containerId) || null;
  }

  /**
   * Get all activity records
   */
  public getAllActivityRecords(): Map<string, ActivityRecord> {
    return new Map(this.activityRecords);
  }

  /**
   * Remove activity record for a container (when container is removed)
   */
  public removeActivityRecord(containerId: string): void {
    this.stopMonitoring(containerId);
    this.activityRecords.delete(containerId);
  }

  /**
   * Start monitoring Docker stats for a container
   */
  private startStatsMonitoring(containerId: string, dockerId: string): void {
    this.logger.debug('ActivityMonitor', `Starting stats monitoring for container ${containerId}`, {
      containerId,
      dockerId,
      interval: this.STATS_MONITORING_INTERVAL
    });

    const interval = setInterval(async () => {
      try {
        await this.checkContainerStats(containerId, dockerId);
      } catch (error) {
        this.logger.warn('ActivityMonitor', `Error monitoring stats for container ${containerId}`, {
          containerId,
          dockerId,
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue monitoring despite errors
      }
    }, this.STATS_MONITORING_INTERVAL);

    this.monitoringIntervals.set(containerId, interval);
  }

  /**
   * Check container stats and update activity if there's resource usage
   */
  private async checkContainerStats(containerId: string, dockerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(dockerId);
      
      // Get container stats with retry logic for transient Docker API failures
      const stats = await ErrorHandler.executeDockerOperation(
        () => container.stats({ stream: false }),
        `get stats for container ${containerId}`,
        { 
          maxAttempts: 2, // Fewer retries for stats monitoring
          baseDelayMs: 500 // Shorter delay for monitoring
        }
      );

      // Check if container is active based on custom thresholds or default detection
      const isActive = this.evaluateContainerActivity(containerId, stats);

      if (isActive) {
        // Get detailed metrics for logging
        const cpuUsage = this.calculateCpuUsage(stats);
        const memoryUsageMB = this.calculateMemoryUsageMB(stats);
        const networkBytesPerSec = this.calculateNetworkBytesPerSec(containerId, stats);

        this.logger.debug('ActivityMonitor', `Detected activity for container ${containerId}`, {
          containerId,
          cpuUsage,
          memoryUsageMB,
          networkBytesPerSec,
          hasCustomThresholds: this.containerThresholds.has(containerId)
        });

        this.updateActivity({
          containerId,
          activityType: 'resource_usage',
          details: {
            cpu_usage_percent: cpuUsage * 100, // Convert to percentage
            memory_usage_mb: memoryUsageMB,
            network_bytes_per_sec: networkBytesPerSec,
            timestamp: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      // Container might be stopped or removed, which is expected
      if (error instanceof Error && !error.message.includes('No such container')) {
        this.logger.debug('ActivityMonitor', `Failed to get stats for container ${containerId}`, {
          containerId,
          dockerId,
          error: error.message
        });
        throw error;
      }
      
      // Container no longer exists, which is normal during cleanup
      this.logger.debug('ActivityMonitor', `Container ${containerId} no longer exists, stopping monitoring`, {
        containerId,
        dockerId
      });
    }
  }

  /**
   * Calculate CPU usage percentage from Docker stats
   */
  private calculateCpuUsage(stats: any): number {
    if (!stats || !stats.cpu_stats || !stats.precpu_stats) {
      return 0;
    }

    const cpuStats = stats.cpu_stats;
    const precpuStats = stats.precpu_stats;

    if (!cpuStats.cpu_usage || !precpuStats.cpu_usage) {
      return 0;
    }

    const cpuDelta = cpuStats.cpu_usage.total_usage - precpuStats.cpu_usage.total_usage;
    const systemDelta = cpuStats.system_cpu_usage - precpuStats.system_cpu_usage;
    const numberCpus = cpuStats.online_cpus || 1;

    if (systemDelta > 0 && cpuDelta > 0) {
      return (cpuDelta / systemDelta) * numberCpus;
    }

    return 0;
  }

  /**
   * Calculate memory usage in MB from Docker stats
   */
  private calculateMemoryUsageMB(stats: any): number {
    if (!stats || !stats.memory_stats || typeof stats.memory_stats.usage !== 'number') {
      return 0;
    }

    // Convert bytes to MB
    return stats.memory_stats.usage / (1024 * 1024);
  }

  /**
   * Calculate network bytes per second from Docker stats
   */
  private calculateNetworkBytesPerSec(containerId: string, stats: any): number {
    if (!stats || !stats.networks) {
      return 0;
    }

    let totalBytes = 0;
    for (const network of Object.values(stats.networks) as any[]) {
      if (network) {
        totalBytes += (network.rx_bytes || 0) + (network.tx_bytes || 0);
      }
    }

    // Calculate bytes per second based on previous measurement
    const previousStats = this.previousNetworkStats.get(containerId);
    if (previousStats) {
      const timeDelta = (Date.now() - previousStats.timestamp) / 1000; // seconds
      const bytesDelta = totalBytes - previousStats.totalBytes;
      
      // Store current stats for next calculation
      this.previousNetworkStats.set(containerId, {
        totalBytes,
        timestamp: Date.now()
      });

      return timeDelta > 0 ? bytesDelta / timeDelta : 0;
    } else {
      // First measurement, store baseline
      this.previousNetworkStats.set(containerId, {
        totalBytes,
        timestamp: Date.now()
      });
      return 0;
    }
  }

  /**
   * Evaluate container activity based on custom thresholds or default detection
   */
  private evaluateContainerActivity(containerId: string, stats: any): boolean {
    const customThresholds = this.containerThresholds.get(containerId);
    
    if (customThresholds) {
      return this.evaluateCustomThresholds(containerId, stats, customThresholds);
    } else {
      return this.evaluateDefaultActivity(stats);
    }
  }

  /**
   * Evaluate activity using custom thresholds
   */
  private evaluateCustomThresholds(containerId: string, stats: any, thresholds: ActivityThresholds): boolean {
    // Check CPU threshold
    if (thresholds.minCpuPercent !== undefined) {
      const cpuUsage = this.calculateCpuUsage(stats);
      const cpuPercent = cpuUsage * 100; // Convert to percentage
      if (cpuPercent >= thresholds.minCpuPercent) {
        this.logger.debug('ActivityMonitor', `Container ${containerId} active due to CPU threshold`, {
          containerId,
          cpuPercent,
          threshold: thresholds.minCpuPercent
        });
        return true;
      }
    }

    // Check memory threshold
    if (thresholds.minMemoryMB !== undefined) {
      const memoryUsageMB = this.calculateMemoryUsageMB(stats);
      if (memoryUsageMB >= thresholds.minMemoryMB) {
        this.logger.debug('ActivityMonitor', `Container ${containerId} active due to memory threshold`, {
          containerId,
          memoryUsageMB,
          threshold: thresholds.minMemoryMB
        });
        return true;
      }
    }

    // Check network threshold
    if (thresholds.minNetworkBytesPerSec !== undefined) {
      const networkBytesPerSec = this.calculateNetworkBytesPerSec(containerId, stats);
      if (networkBytesPerSec >= thresholds.minNetworkBytesPerSec) {
        this.logger.debug('ActivityMonitor', `Container ${containerId} active due to network threshold`, {
          containerId,
          networkBytesPerSec,
          threshold: thresholds.minNetworkBytesPerSec
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Evaluate activity using default detection methods
   */
  private evaluateDefaultActivity(stats: any): boolean {
    // Default activity detection: any CPU usage or network activity
    const cpuUsage = this.calculateCpuUsage(stats);
    if (cpuUsage > 0.01) { // More than 1% CPU usage
      return true;
    }

    return this.checkNetworkActivity(stats);
  }

  /**
   * Check for network activity in Docker stats
   */
  private checkNetworkActivity(stats: any): boolean {
    if (!stats || !stats.networks) {
      return false;
    }

    // Check if there's any network I/O
    for (const network of Object.values(stats.networks) as any[]) {
      if (network && (network.rx_bytes > 0 || network.tx_bytes > 0)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Cleanup all monitoring intervals (for graceful shutdown)
   */
  public cleanup(): void {
    for (const [containerId] of this.monitoringIntervals) {
      this.stopMonitoring(containerId);
    }
    this.activityRecords.clear();
    this.containerThresholds.clear();
    this.previousNetworkStats.clear();
  }
}