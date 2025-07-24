import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger, LogLevel } from '../../../src/utils/Logger.js';

describe('Logger', () => {
  let logger: Logger;
  let consoleSpy: any;

  beforeEach(() => {
    // Get fresh instance for each test
    logger = Logger.getInstance();
    logger.clearHistory();
    logger.setLogLevel(LogLevel.DEBUG);

    // Mock console methods
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {})
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();
      expect(logger1).toBe(logger2);
    });
  });

  describe('Log Level Filtering', () => {
    it('should log messages at or below the set log level', () => {
      logger.setLogLevel(LogLevel.WARN);
      
      logger.error('TestComponent', 'Error message');
      logger.warn('TestComponent', 'Warning message');
      logger.info('TestComponent', 'Info message');
      logger.debug('TestComponent', 'Debug message');

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.log).toHaveBeenCalledTimes(0);
      expect(consoleSpy.debug).toHaveBeenCalledTimes(0);
    });

    it('should log all messages when set to DEBUG level', () => {
      logger.setLogLevel(LogLevel.DEBUG);
      
      logger.error('TestComponent', 'Error message');
      logger.warn('TestComponent', 'Warning message');
      logger.info('TestComponent', 'Info message');
      logger.debug('TestComponent', 'Debug message');

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      expect(consoleSpy.debug).toHaveBeenCalledTimes(1);
    });
  });

  describe('Log History', () => {
    it('should store log entries in history', () => {
      logger.info('TestComponent', 'Test message', { key: 'value' });
      
      const history = logger.getRecentLogs(1);
      expect(history).toHaveLength(1);
      expect(history[0].component).toBe('TestComponent');
      expect(history[0].message).toBe('Test message');
      expect(history[0].metadata).toEqual({ key: 'value' });
      expect(history[0].level).toBe(LogLevel.INFO);
    });

    it('should limit history size', () => {
      // Log more than the max history size (1000)
      for (let i = 0; i < 1100; i++) {
        logger.info('TestComponent', `Message ${i}`);
      }
      
      const history = logger.getRecentLogs();
      expect(history.length).toBeLessThanOrEqual(1000);
    });

    it('should filter logs by level', () => {
      logger.error('TestComponent', 'Error message');
      logger.warn('TestComponent', 'Warning message');
      logger.info('TestComponent', 'Info message');
      
      const errorLogs = logger.getLogsByLevel(LogLevel.ERROR);
      const warnLogs = logger.getLogsByLevel(LogLevel.WARN);
      
      expect(errorLogs).toHaveLength(1);
      expect(warnLogs).toHaveLength(1);
      expect(errorLogs[0].message).toBe('Error message');
      expect(warnLogs[0].message).toBe('Warning message');
    });

    it('should filter logs by component', () => {
      logger.info('ComponentA', 'Message from A');
      logger.info('ComponentB', 'Message from B');
      logger.info('ComponentA', 'Another message from A');
      
      const componentALogs = logger.getLogsByComponent('ComponentA');
      const componentBLogs = logger.getLogsByComponent('ComponentB');
      
      expect(componentALogs).toHaveLength(2);
      expect(componentBLogs).toHaveLength(1);
    });
  });

  describe('Container Operation Logging', () => {
    it('should log successful container operations', () => {
      logger.logContainerOperation('create', 'container-123', true, { port: 8080 });
      
      const history = logger.getRecentLogs(1);
      expect(history[0].component).toBe('ContainerManager');
      expect(history[0].message).toContain('Container create: container-123 - SUCCESS');
      expect(history[0].metadata.operation).toBe('create');
      expect(history[0].metadata.containerId).toBe('container-123');
      expect(history[0].metadata.success).toBe(true);
      expect(history[0].level).toBe(LogLevel.INFO);
    });

    it('should log failed container operations with error', () => {
      const testError = new Error('Docker connection failed');
      logger.logContainerOperation('remove', 'container-456', false, { port: 8081 }, testError);
      
      const history = logger.getRecentLogs(1);
      expect(history[0].component).toBe('ContainerManager');
      expect(history[0].message).toContain('Container remove: container-456 - FAILED');
      expect(history[0].metadata.operation).toBe('remove');
      expect(history[0].metadata.containerId).toBe('container-456');
      expect(history[0].metadata.success).toBe(false);
      expect(history[0].error).toBe(testError);
      expect(history[0].level).toBe(LogLevel.ERROR);
    });
  });

  describe('System Event Logging', () => {
    it('should log system events', () => {
      logger.logSystemEvent('server_started', 'ApiServer', { port: 3000 });
      
      const history = logger.getRecentLogs(1);
      expect(history[0].component).toBe('ApiServer');
      expect(history[0].message).toBe('System event: server_started');
      expect(history[0].metadata).toEqual({ port: 3000 });
      expect(history[0].level).toBe(LogLevel.INFO);
    });
  });

  describe('Error Logging', () => {
    it('should log errors with stack traces', () => {
      const testError = new Error('Test error');
      logger.error('TestComponent', 'An error occurred', testError, { context: 'test' });
      
      const history = logger.getRecentLogs(1);
      expect(history[0].level).toBe(LogLevel.ERROR);
      expect(history[0].error).toBe(testError);
      expect(history[0].metadata).toEqual({ context: 'test' });
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[TestComponent] [ERROR] An error occurred')
      );
      expect(consoleSpy.error).toHaveBeenCalledWith('Error details:', testError);
      expect(consoleSpy.error).toHaveBeenCalledWith('Metadata:', { context: 'test' });
    });
  });

  describe('Clear History', () => {
    it('should clear log history', () => {
      logger.info('TestComponent', 'Test message');
      expect(logger.getRecentLogs()).toHaveLength(1);
      
      logger.clearHistory();
      expect(logger.getRecentLogs()).toHaveLength(0);
    });
  });
});