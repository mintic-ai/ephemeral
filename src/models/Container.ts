export interface ActivityThresholds {
  minCpuPercent?: number; // minimum CPU usage % to consider active
  minMemoryMB?: number; // minimum memory usage in MB to consider active
  minNetworkBytesPerSec?: number; // minimum network I/O bytes/sec to consider active
}

export interface CleanupStrategy {
  type: 'activity' | 'lifetime' | 'hybrid';
  maxLifetime?: number; // seconds
  activityTimeout?: number; // seconds
  activityThresholds?: ActivityThresholds;
}

export interface Container {
  id: string;
  dockerId: string;
  image: string;
  status: 'creating' | 'running' | 'stopping' | 'stopped' | 'error';
  createdAt: Date;
  lastActivity: Date;
  connection: {
    host: string;
    port: number;
    url?: string;
  };
  environment: Record<string, string>;
  metadata: Record<string, any>;
  cleanupStrategy: CleanupStrategy;
}

export interface ContainerCreateRequest {
  image: string;
  environment?: Record<string, string>;
  ports?: number[];
  cleanupStrategy?: CleanupStrategy;
}

export interface ContainerResponse {
  id: string;
  status: 'running' | 'stopped' | 'error';
  connection: {
    host: string;
    port: number;
    url?: string;
  };
  created_at: string;
  last_activity: string;
  cleanup_strategy: {
    type: 'activity' | 'lifetime' | 'hybrid';
    max_lifetime?: number;
    activity_timeout?: number;
    activity_thresholds?: {
      min_cpu_percent?: number;
      min_memory_mb?: number;
      min_network_bytes_per_sec?: number;
    };
  };
}

// Validation functions for cleanup strategies and activity thresholds

export function validateActivityThresholds(thresholds: ActivityThresholds): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (thresholds.minCpuPercent !== undefined) {
    if (typeof thresholds.minCpuPercent !== 'number' || thresholds.minCpuPercent < 0 || thresholds.minCpuPercent > 100) {
      errors.push('minCpuPercent must be a number between 0 and 100');
    }
  }

  if (thresholds.minMemoryMB !== undefined) {
    if (typeof thresholds.minMemoryMB !== 'number' || thresholds.minMemoryMB < 0) {
      errors.push('minMemoryMB must be a positive number');
    }
  }

  if (thresholds.minNetworkBytesPerSec !== undefined) {
    if (typeof thresholds.minNetworkBytesPerSec !== 'number' || thresholds.minNetworkBytesPerSec < 0) {
      errors.push('minNetworkBytesPerSec must be a positive number');
    }
  }

  return { isValid: errors.length === 0, errors };
}

export function validateCleanupStrategy(strategy: CleanupStrategy): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate strategy type
  if (!['activity', 'lifetime', 'hybrid'].includes(strategy.type)) {
    errors.push('type must be one of: activity, lifetime, hybrid');
  }

  // Validate maxLifetime
  if (strategy.maxLifetime !== undefined) {
    if (typeof strategy.maxLifetime !== 'number' || strategy.maxLifetime <= 0) {
      errors.push('maxLifetime must be a positive number');
    }
  }

  // Validate activityTimeout
  if (strategy.activityTimeout !== undefined) {
    if (typeof strategy.activityTimeout !== 'number' || strategy.activityTimeout <= 0) {
      errors.push('activityTimeout must be a positive number');
    }
  }

  // Validate activity thresholds if provided
  if (strategy.activityThresholds) {
    const thresholdValidation = validateActivityThresholds(strategy.activityThresholds);
    if (!thresholdValidation.isValid) {
      errors.push(...thresholdValidation.errors.map(error => `activityThresholds.${error}`));
    }
  }

  // Strategy-specific validations
  if (strategy.type === 'lifetime' && strategy.maxLifetime === undefined) {
    errors.push('maxLifetime is required for lifetime-based cleanup strategy');
  }

  if (strategy.type === 'activity' && strategy.activityTimeout === undefined) {
    errors.push('activityTimeout is required for activity-based cleanup strategy');
  }

  if (strategy.type === 'hybrid') {
    if (strategy.maxLifetime === undefined && strategy.activityTimeout === undefined) {
      errors.push('hybrid cleanup strategy requires either maxLifetime or activityTimeout (or both)');
    }
  }

  return { isValid: errors.length === 0, errors };
}

export function createDefaultCleanupStrategy(): CleanupStrategy {
  return {
    type: 'activity',
    activityTimeout: 300 // 5 minutes default
  };
}

export function normalizeCleanupStrategy(strategy?: CleanupStrategy): CleanupStrategy {
  if (!strategy) {
    return createDefaultCleanupStrategy();
  }

  // Return a copy with defaults applied where needed
  const normalized: CleanupStrategy = {
    type: strategy.type,
    maxLifetime: strategy.maxLifetime,
    activityTimeout: strategy.activityTimeout,
    activityThresholds: strategy.activityThresholds
  };

  // Apply defaults based on strategy type
  if (normalized.type === 'activity' && normalized.activityTimeout === undefined) {
    normalized.activityTimeout = 300; // 5 minutes default
  }

  return normalized;
}