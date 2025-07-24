import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorHandler, RetryOptions } from '../../../src/utils/ErrorHandler.js';

describe('ErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');
      
      const result = await ErrorHandler.executeWithRetry(mockOperation, {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2
      }, 'test operation');

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValue('success');
      
      const result = await ErrorHandler.executeWithRetry(mockOperation, {
        maxAttempts: 3,
        baseDelayMs: 10, // Small delay for testing
        maxDelayMs: 100,
        backoffMultiplier: 2,
        retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT']
      }, 'test operation');

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(3);
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max attempts', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Persistent error'));
      
      const result = await ErrorHandler.executeWithRetry(mockOperation, {
        maxAttempts: 2,
        baseDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2
      }, 'test operation');

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Persistent error');
      expect(result.attempts).toBe(2);
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-retryable errors', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('INVALID_INPUT'));
      
      const result = await ErrorHandler.executeWithRetry(mockOperation, {
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
        retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT']
      }, 'test operation');

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('INVALID_INPUT');
      expect(result.attempts).toBe(1);
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should handle non-Error objects', async () => {
      const mockOperation = vi.fn().mockRejectedValue('string error');
      
      const result = await ErrorHandler.executeWithRetry(mockOperation, {
        maxAttempts: 2,
        baseDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2
      }, 'test operation');

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('string error');
      expect(result.attempts).toBe(2);
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      const error = new Error('ECONNREFUSED: Connection refused');
      const retryableErrors = ['ECONNREFUSED', 'ETIMEDOUT'];
      
      expect(ErrorHandler.isRetryableError(error, retryableErrors)).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      const error = new Error('INVALID_INPUT: Bad request');
      const retryableErrors = ['ECONNREFUSED', 'ETIMEDOUT'];
      
      expect(ErrorHandler.isRetryableError(error, retryableErrors)).toBe(false);
    });

    it('should return true when no retryable patterns provided', () => {
      const error = new Error('Any error');
      
      expect(ErrorHandler.isRetryableError(error)).toBe(true);
      expect(ErrorHandler.isRetryableError(error, [])).toBe(true);
    });

    it('should check error code and name', () => {
      const error = new Error('Some message') as any;
      error.code = 'ECONNREFUSED';
      error.name = 'ConnectionError';
      
      expect(ErrorHandler.isRetryableError(error, ['ECONNREFUSED'])).toBe(true);
      expect(ErrorHandler.isRetryableError(error, ['ConnectionError'])).toBe(true);
    });
  });

  describe('calculateBackoffDelay', () => {
    const options: RetryOptions = {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2
    };

    it('should calculate exponential backoff', () => {
      const delay1 = ErrorHandler.calculateBackoffDelay(1, options);
      const delay2 = ErrorHandler.calculateBackoffDelay(2, options);
      const delay3 = ErrorHandler.calculateBackoffDelay(3, options);

      // First attempt should be around base delay (1000ms)
      expect(delay1).toBeGreaterThan(900);
      expect(delay1).toBeLessThan(1200);

      // Second attempt should be around 2x base delay (2000ms)
      expect(delay2).toBeGreaterThan(1800);
      expect(delay2).toBeLessThan(2400);

      // Third attempt should be around 4x base delay (4000ms)
      expect(delay3).toBeGreaterThan(3600);
      expect(delay3).toBeLessThan(4800);
    });

    it('should respect max delay', () => {
      const shortMaxOptions = { ...options, maxDelayMs: 1500 };
      const delay = ErrorHandler.calculateBackoffDelay(5, shortMaxOptions);
      
      expect(delay).toBeLessThanOrEqual(1500);
    });
  });

  describe('executeDockerOperation', () => {
    it('should execute Docker operation successfully', async () => {
      const mockOperation = vi.fn().mockResolvedValue('docker result');
      
      const result = await ErrorHandler.executeDockerOperation(
        mockOperation,
        'test docker operation'
      );

      expect(result).toBe('docker result');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should throw error after retries fail', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Docker error'));
      
      await expect(
        ErrorHandler.executeDockerOperation(mockOperation, 'test docker operation')
      ).rejects.toThrow('Docker error');
    });

    it('should use custom retry options', async () => {
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');
      
      const result = await ErrorHandler.executeDockerOperation(
        mockOperation,
        'test operation',
        { maxAttempts: 2, baseDelayMs: 10 }
      );

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('createError', () => {
    it('should create error with additional properties', () => {
      const cause = new Error('Original error');
      const metadata = { context: 'test' };
      
      const error = ErrorHandler.createError(
        'Custom error message',
        'CUSTOM_ERROR',
        cause,
        metadata
      );

      expect(error.message).toBe('Custom error message');
      expect(error.code).toBe('CUSTOM_ERROR');
      expect(error.cause).toBe(cause);
      expect(error.metadata).toBe(metadata);
    });
  });

  describe('extractErrorInfo', () => {
    it('should extract error information from Error object', () => {
      const error = ErrorHandler.createError('Test error', 'TEST_CODE', undefined, { key: 'value' });
      
      const info = ErrorHandler.extractErrorInfo(error);
      
      expect(info.code).toBe('TEST_CODE');
      expect(info.message).toBe('Test error');
      expect(info.details).toEqual({ key: 'value' });
    });

    it('should handle plain Error objects', () => {
      const error = new Error('Plain error');
      
      const info = ErrorHandler.extractErrorInfo(error);
      
      expect(info.code).toBe('UNKNOWN_ERROR');
      expect(info.message).toBe('Plain error');
      expect(info.details).toBeUndefined();
    });

    it('should handle non-Error objects', () => {
      const info1 = ErrorHandler.extractErrorInfo('string error');
      const info2 = ErrorHandler.extractErrorInfo(null);
      const info3 = ErrorHandler.extractErrorInfo(undefined);
      
      expect(info1.code).toBe('UNKNOWN_ERROR');
      expect(info1.message).toBe('string error');
      
      expect(info2.code).toBe('UNKNOWN_ERROR');
      expect(info2.message).toBe('An unknown error occurred');
      
      expect(info3.code).toBe('UNKNOWN_ERROR');
      expect(info3.message).toBe('An unknown error occurred');
    });
  });

  describe('sleep', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await ErrorHandler.sleep(50);
      const end = Date.now();
      
      expect(end - start).toBeGreaterThanOrEqual(45); // Allow some tolerance
      expect(end - start).toBeLessThan(100);
    });
  });
});