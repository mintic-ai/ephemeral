import Docker from 'dockerode';
import { ActivityRecord, ActivityUpdate } from '../models/ActivityRecord.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { Logger } from '../utils/Logger.js';

export class ActivityMonitor {
  private docker: Docker;
  private activityRecords: Map<string, ActivityRecord> = new Map();
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly STATS_MONITORING_INTERVAL = 30000; // 30 seconds
  private logger: Logger;

  constructor(docker: Docker) {
    this.docker = docker;
    this.logger = Logger.getInstance();
  }

  /**
   * Start monitoring a container for activity
   */
  public startMonitoring(containerId: string, dockerId: string): void {
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

      // Check for CPU activity
      const cpuUsage = this.calculateCpuUsage(stats);
      
      // Check for network activity
      const networkActivity = this.checkNetworkActivity(stats);
      
      // Check for memory changes (significant increases might indicate activity)
      const memoryUsage = (stats && stats.memory_stats && stats.memory_stats.usage) || 0;

      // Update activity if we detect significant resource usage
      if (cpuUsage > 0.01 || networkActivity || memoryUsage > 0) {
        this.logger.debug('ActivityMonitor', `Detected activity for container ${containerId}`, {
          containerId,
          cpuUsage,
          memoryUsage,
          networkActivity
        });

        this.updateActivity({
          containerId,
          activityType: 'resource_usage',
          details: {
            cpu_usage: cpuUsage,
            memory_usage: memoryUsage,
            network_activity: networkActivity,
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
  }
}