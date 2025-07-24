import * as cron from 'node-cron';
import { ContainerManager } from './ContainerManager.js';
import { ActivityMonitor } from './ActivityMonitor.js';
import { ConfigManager } from './ConfigManager.js';
import { SystemConfig } from '../models/SystemConfig.js';
import { Logger } from '../utils/Logger.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';

export interface CleanupResult {
  containerId: string;
  success: boolean;
  error?: string;
  retryCount: number;
}

export interface CleanupSummary {
  totalContainersChecked: number;
  containersRemoved: number;
  containersFailed: number;
  results: CleanupResult[];
  timestamp: Date;
}

export class CleanupSchedulerError extends Error {
  constructor(message: string, public code: string, public cause?: Error) {
    super(message);
    this.name = 'CleanupSchedulerError';
  }
}

export class CleanupScheduler {
  private containerManager: ContainerManager;
  private activityMonitor: ActivityMonitor;
  private config: SystemConfig;
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private retryQueue: Map<string, number> = new Map(); // containerId -> retry count
  private cleanupHistory: CleanupSummary[] = [];
  private readonly MAX_HISTORY_SIZE = 100;
  private logger: Logger;

  constructor(
    containerManager: ContainerManager,
    activityMonitor: ActivityMonitor,
    configManager?: ConfigManager
  ) {
    this.containerManager = containerManager;
    this.activityMonitor = activityMonitor;
    this.config = configManager ? configManager.getConfig() : ConfigManager.getInstance().getConfig();
    this.logger = Logger.getInstance();
  }

  /**
   * Start the cleanup scheduler with configurable intervals
   */
  public start(): void {
    if (this.isRunning) {
      throw new CleanupSchedulerError('Cleanup scheduler is already running', 'ALREADY_RUNNING');
    }

    // Create cron expression for the configured interval (in seconds)
    const cronExpression = this.createCronExpression(this.config.cleanup.interval);
    
    this.cronJob = cron.schedule(cronExpression, async () => {
      await this.performCleanup();
    }, {
      scheduled: false // Don't start immediately
    });

    this.cronJob.start();
    this.isRunning = true;
    
    this.logger.logSystemEvent('cleanup_scheduler_started', 'CleanupScheduler', {
      interval: this.config.cleanup.interval,
      cronExpression
    });
  }

  /**
   * Stop the cleanup scheduler
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }

    this.isRunning = false;
    this.retryQueue.clear();
    
    this.logger.logSystemEvent('cleanup_scheduler_stopped', 'CleanupScheduler');
  }

  /**
   * Perform a manual cleanup operation
   */
  public async performManualCleanup(): Promise<CleanupSummary> {
    this.logger.info('CleanupScheduler', 'Starting manual cleanup operation');
    return await this.performCleanup();
  }

  /**
   * Get cleanup history
   */
  public getCleanupHistory(): CleanupSummary[] {
    return [...this.cleanupHistory];
  }

  /**
   * Get the current retry queue status
   */
  public getRetryQueueStatus(): Map<string, number> {
    return new Map(this.retryQueue);
  }

  /**
   * Check if the scheduler is running
   */
  public isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Perform the actual cleanup operation
   */
  private async performCleanup(): Promise<CleanupSummary> {
    const startTime = new Date();
    const results: CleanupResult[] = [];
    
    try {
      this.logger.info('CleanupScheduler', 'Starting cleanup operation');
      
      // Get all containers with retry logic for Docker API failures
      const containers = await ErrorHandler.executeDockerOperation(
        () => this.containerManager.listContainers(),
        'list containers for cleanup'
      );
      const currentTime = new Date();
      
      this.logger.info('CleanupScheduler', `Checking ${containers.length} containers for inactivity`, {
        containerCount: containers.length,
        inactivityTimeout: this.config.cleanup.inactivityTimeout
      });
      
      // Check each container for inactivity
      for (const container of containers) {
        const lastActivity = this.activityMonitor.getLastActivity(container.id);
        
        if (this.shouldRemoveContainer(container.id, lastActivity, currentTime)) {
          const result = await this.attemptContainerRemoval(container.id);
          results.push(result);
        }
      }
      
      // Process retry queue
      await this.processRetryQueue(results);
      
      const summary: CleanupSummary = {
        totalContainersChecked: containers.length,
        containersRemoved: results.filter(r => r.success).length,
        containersFailed: results.filter(r => !r.success).length,
        results,
        timestamp: startTime
      };
      
      // Store in history
      this.addToHistory(summary);
      
      this.logger.info('CleanupScheduler', `Cleanup completed: ${summary.containersRemoved} removed, ${summary.containersFailed} failed`, {
        containersRemoved: summary.containersRemoved,
        containersFailed: summary.containersFailed,
        totalChecked: summary.totalContainersChecked,
        duration: Date.now() - startTime.getTime()
      });
      
      return summary;
      
    } catch (error) {
      const containerError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('CleanupScheduler', 'Cleanup operation failed', containerError, {
        duration: Date.now() - startTime.getTime()
      });
      
      const summary: CleanupSummary = {
        totalContainersChecked: 0,
        containersRemoved: 0,
        containersFailed: 0,
        results,
        timestamp: startTime
      };
      
      this.addToHistory(summary);
      return summary;
    }
  }

  /**
   * Check if a container should be removed based on inactivity
   */
  private shouldRemoveContainer(containerId: string, lastActivity: Date | null, currentTime: Date): boolean {
    if (!lastActivity) {
      // No activity recorded, use container creation time or current time
      this.logger.warn('CleanupScheduler', `No activity recorded for container ${containerId}, marking for removal`, {
        containerId
      });
      return true;
    }

    const inactivityPeriod = currentTime.getTime() - lastActivity.getTime();
    const timeoutMs = this.config.cleanup.inactivityTimeout * 1000;
    
    const shouldRemove = inactivityPeriod > timeoutMs;
    
    if (shouldRemove) {
      this.logger.info('CleanupScheduler', `Container ${containerId} inactive for ${Math.round(inactivityPeriod / 1000)}s (timeout: ${this.config.cleanup.inactivityTimeout}s)`, {
        containerId,
        inactivityPeriodMs: inactivityPeriod,
        inactivityPeriodSeconds: Math.round(inactivityPeriod / 1000),
        timeoutSeconds: this.config.cleanup.inactivityTimeout
      });
    }
    
    return shouldRemove;
  }

  /**
   * Attempt to remove a container with retry logic
   */
  private async attemptContainerRemoval(containerId: string): Promise<CleanupResult> {
    const retryCount = this.retryQueue.get(containerId) || 0;
    
    try {
      this.logger.info('CleanupScheduler', `Attempting to remove container ${containerId} (attempt ${retryCount + 1})`, {
        containerId,
        attempt: retryCount + 1,
        maxAttempts: this.config.cleanup.maxRetryAttempts
      });
      
      // Remove container with retry logic for Docker API failures
      await ErrorHandler.executeDockerOperation(
        () => this.containerManager.removeContainer(containerId),
        `remove container ${containerId} during cleanup`
      );
      
      // Remove from activity monitor
      this.activityMonitor.removeActivityRecord(containerId);
      
      // Remove from retry queue if successful
      this.retryQueue.delete(containerId);
      
      this.logger.logContainerOperation('cleanup_remove', containerId, true, {
        attempt: retryCount + 1,
        source: 'cleanup_scheduler'
      });
      
      return {
        containerId,
        success: true,
        retryCount: retryCount + 1
      };
      
    } catch (error) {
      const containerError = error instanceof Error ? error : new Error(String(error));
      this.logger.logContainerOperation('cleanup_remove', containerId, false, {
        attempt: retryCount + 1,
        source: 'cleanup_scheduler'
      }, containerError);
      
      // Add to retry queue if under max attempts
      if (retryCount < this.config.cleanup.maxRetryAttempts - 1) {
        this.retryQueue.set(containerId, retryCount + 1);
        this.logger.info('CleanupScheduler', `Added container ${containerId} to retry queue`, {
          containerId,
          currentAttempt: retryCount + 1,
          maxAttempts: this.config.cleanup.maxRetryAttempts,
          nextAttempt: retryCount + 2
        });
      } else {
        this.retryQueue.delete(containerId);
        this.logger.error('CleanupScheduler', `Container ${containerId} exceeded max retry attempts, giving up`, containerError, {
          containerId,
          maxAttempts: this.config.cleanup.maxRetryAttempts,
          finalAttempt: retryCount + 1
        });
      }
      
      return {
        containerId,
        success: false,
        error: containerError.message,
        retryCount: retryCount + 1
      };
    }
  }

  /**
   * Process containers in the retry queue
   */
  private async processRetryQueue(results: CleanupResult[]): Promise<void> {
    if (this.retryQueue.size === 0) {
      return;
    }
    
    this.logger.info('CleanupScheduler', `Processing retry queue with ${this.retryQueue.size} containers`, {
      retryQueueSize: this.retryQueue.size,
      containerIds: Array.from(this.retryQueue.keys())
    });
    
    // Create a copy of the retry queue keys to avoid modification during iteration
    const retryContainerIds = Array.from(this.retryQueue.keys());
    
    for (const containerId of retryContainerIds) {
      // Only retry if the container is still in the retry queue (might have been removed by a previous retry)
      if (this.retryQueue.has(containerId)) {
        const result = await this.attemptContainerRemoval(containerId);
        results.push(result);
      }
    }
  }

  /**
   * Create a cron expression for the given interval in seconds
   */
  private createCronExpression(intervalSeconds: number): string {
    if (intervalSeconds < 60) {
      // For intervals less than 60 seconds, use every N seconds
      return `*/${intervalSeconds} * * * * *`;
    } else if (intervalSeconds < 3600) {
      // For intervals less than 1 hour, use every N minutes
      const minutes = Math.floor(intervalSeconds / 60);
      return `0 */${minutes} * * * *`;
    } else {
      // For longer intervals, use every N hours
      const hours = Math.floor(intervalSeconds / 3600);
      return `0 0 */${hours} * * *`;
    }
  }

  /**
   * Add cleanup summary to history
   */
  private addToHistory(summary: CleanupSummary): void {
    this.cleanupHistory.push(summary);
    
    // Keep only the most recent entries
    if (this.cleanupHistory.length > this.MAX_HISTORY_SIZE) {
      this.cleanupHistory.shift();
    }
  }


}