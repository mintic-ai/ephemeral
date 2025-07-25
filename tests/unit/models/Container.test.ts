import { describe, it, expect } from 'vitest';
import {
  ActivityThresholds,
  CleanupStrategy,
  validateActivityThresholds,
  validateCleanupStrategy,
  createDefaultCleanupStrategy,
  normalizeCleanupStrategy
} from '../../../src/models/Container';

describe('Container Model - Cleanup Strategies and Activity Thresholds', () => {
  describe('validateActivityThresholds', () => {
    it('should validate valid activity thresholds', () => {
      const thresholds: ActivityThresholds = {
        minCpuPercent: 10,
        minMemoryMB: 100,
        minNetworkBytesPerSec: 1024
      };

      const result = validateActivityThresholds(thresholds);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate empty activity thresholds', () => {
      const thresholds: ActivityThresholds = {};

      const result = validateActivityThresholds(thresholds);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid CPU percentage', () => {
      const thresholds: ActivityThresholds = {
        minCpuPercent: -5
      };

      const result = validateActivityThresholds(thresholds);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('minCpuPercent must be a number between 0 and 100');
    });

    it('should reject CPU percentage over 100', () => {
      const thresholds: ActivityThresholds = {
        minCpuPercent: 150
      };

      const result = validateActivityThresholds(thresholds);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('minCpuPercent must be a number between 0 and 100');
    });

    it('should reject negative memory threshold', () => {
      const thresholds: ActivityThresholds = {
        minMemoryMB: -100
      };

      const result = validateActivityThresholds(thresholds);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('minMemoryMB must be a positive number');
    });

    it('should reject negative network threshold', () => {
      const thresholds: ActivityThresholds = {
        minNetworkBytesPerSec: -1024
      };

      const result = validateActivityThresholds(thresholds);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('minNetworkBytesPerSec must be a positive number');
    });

    it('should reject non-numeric values', () => {
      const thresholds: any = {
        minCpuPercent: 'invalid',
        minMemoryMB: 'invalid',
        minNetworkBytesPerSec: 'invalid'
      };

      const result = validateActivityThresholds(thresholds);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toContain('minCpuPercent must be a number between 0 and 100');
      expect(result.errors).toContain('minMemoryMB must be a positive number');
      expect(result.errors).toContain('minNetworkBytesPerSec must be a positive number');
    });
  });

  describe('validateCleanupStrategy', () => {
    it('should validate activity-based cleanup strategy', () => {
      const strategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 300
      };

      const result = validateCleanupStrategy(strategy);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate lifetime-based cleanup strategy', () => {
      const strategy: CleanupStrategy = {
        type: 'lifetime',
        maxLifetime: 3600
      };

      const result = validateCleanupStrategy(strategy);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate hybrid cleanup strategy', () => {
      const strategy: CleanupStrategy = {
        type: 'hybrid',
        maxLifetime: 3600,
        activityTimeout: 300
      };

      const result = validateCleanupStrategy(strategy);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate cleanup strategy with activity thresholds', () => {
      const strategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 300,
        activityThresholds: {
          minCpuPercent: 5,
          minMemoryMB: 50,
          minNetworkBytesPerSec: 512
        }
      };

      const result = validateCleanupStrategy(strategy);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid strategy type', () => {
      const strategy: any = {
        type: 'invalid',
        activityTimeout: 300
      };

      const result = validateCleanupStrategy(strategy);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('type must be one of: activity, lifetime, hybrid');
    });

    it('should reject negative maxLifetime', () => {
      const strategy: CleanupStrategy = {
        type: 'lifetime',
        maxLifetime: -100
      };

      const result = validateCleanupStrategy(strategy);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('maxLifetime must be a positive number');
    });

    it('should reject zero maxLifetime', () => {
      const strategy: CleanupStrategy = {
        type: 'lifetime',
        maxLifetime: 0
      };

      const result = validateCleanupStrategy(strategy);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('maxLifetime must be a positive number');
    });

    it('should reject negative activityTimeout', () => {
      const strategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: -300
      };

      const result = validateCleanupStrategy(strategy);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('activityTimeout must be a positive number');
    });

    it('should require maxLifetime for lifetime strategy', () => {
      const strategy: CleanupStrategy = {
        type: 'lifetime'
      };

      const result = validateCleanupStrategy(strategy);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('maxLifetime is required for lifetime-based cleanup strategy');
    });

    it('should require activityTimeout for activity strategy', () => {
      const strategy: CleanupStrategy = {
        type: 'activity'
      };

      const result = validateCleanupStrategy(strategy);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('activityTimeout is required for activity-based cleanup strategy');
    });

    it('should require at least one parameter for hybrid strategy', () => {
      const strategy: CleanupStrategy = {
        type: 'hybrid'
      };

      const result = validateCleanupStrategy(strategy);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('hybrid cleanup strategy requires either maxLifetime or activityTimeout (or both)');
    });

    it('should allow hybrid strategy with only maxLifetime', () => {
      const strategy: CleanupStrategy = {
        type: 'hybrid',
        maxLifetime: 3600
      };

      const result = validateCleanupStrategy(strategy);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow hybrid strategy with only activityTimeout', () => {
      const strategy: CleanupStrategy = {
        type: 'hybrid',
        activityTimeout: 300
      };

      const result = validateCleanupStrategy(strategy);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate activity thresholds within cleanup strategy', () => {
      const strategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 300,
        activityThresholds: {
          minCpuPercent: 150 // Invalid
        }
      };

      const result = validateCleanupStrategy(strategy);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('activityThresholds.minCpuPercent must be a number between 0 and 100');
    });
  });

  describe('createDefaultCleanupStrategy', () => {
    it('should create default activity-based cleanup strategy', () => {
      const defaultStrategy = createDefaultCleanupStrategy();
      
      expect(defaultStrategy.type).toBe('activity');
      expect(defaultStrategy.activityTimeout).toBe(300);
      expect(defaultStrategy.maxLifetime).toBeUndefined();
      expect(defaultStrategy.activityThresholds).toBeUndefined();
    });
  });

  describe('normalizeCleanupStrategy', () => {
    it('should return default strategy when no strategy provided', () => {
      const normalized = normalizeCleanupStrategy();
      
      expect(normalized.type).toBe('activity');
      expect(normalized.activityTimeout).toBe(300);
    });

    it('should return default strategy when undefined provided', () => {
      const normalized = normalizeCleanupStrategy(undefined);
      
      expect(normalized.type).toBe('activity');
      expect(normalized.activityTimeout).toBe(300);
    });

    it('should preserve provided strategy values', () => {
      const strategy: CleanupStrategy = {
        type: 'lifetime',
        maxLifetime: 7200,
        activityThresholds: {
          minCpuPercent: 10
        }
      };

      const normalized = normalizeCleanupStrategy(strategy);
      
      expect(normalized.type).toBe('lifetime');
      expect(normalized.maxLifetime).toBe(7200);
      expect(normalized.activityThresholds?.minCpuPercent).toBe(10);
    });

    it('should apply default activityTimeout for activity strategy without timeout', () => {
      const strategy: CleanupStrategy = {
        type: 'activity'
      };

      const normalized = normalizeCleanupStrategy(strategy);
      
      expect(normalized.type).toBe('activity');
      expect(normalized.activityTimeout).toBe(300);
    });

    it('should not override provided activityTimeout', () => {
      const strategy: CleanupStrategy = {
        type: 'activity',
        activityTimeout: 600
      };

      const normalized = normalizeCleanupStrategy(strategy);
      
      expect(normalized.type).toBe('activity');
      expect(normalized.activityTimeout).toBe(600);
    });

    it('should not apply default timeout for non-activity strategies', () => {
      const strategy: CleanupStrategy = {
        type: 'lifetime',
        maxLifetime: 3600
      };

      const normalized = normalizeCleanupStrategy(strategy);
      
      expect(normalized.type).toBe('lifetime');
      expect(normalized.maxLifetime).toBe(3600);
      expect(normalized.activityTimeout).toBeUndefined();
    });

    it('should preserve all fields for hybrid strategy', () => {
      const strategy: CleanupStrategy = {
        type: 'hybrid',
        maxLifetime: 7200,
        activityTimeout: 600,
        activityThresholds: {
          minCpuPercent: 15,
          minMemoryMB: 200,
          minNetworkBytesPerSec: 2048
        }
      };

      const normalized = normalizeCleanupStrategy(strategy);
      
      expect(normalized.type).toBe('hybrid');
      expect(normalized.maxLifetime).toBe(7200);
      expect(normalized.activityTimeout).toBe(600);
      expect(normalized.activityThresholds?.minCpuPercent).toBe(15);
      expect(normalized.activityThresholds?.minMemoryMB).toBe(200);
      expect(normalized.activityThresholds?.minNetworkBytesPerSec).toBe(2048);
    });
  });
});