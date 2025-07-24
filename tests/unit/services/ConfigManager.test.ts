import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager, ConfigValidationError } from '../../../src/services/ConfigManager.js';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear environment variables
    delete process.env.DOCKER_SOCKET_PATH;
    delete process.env.DOCKER_DEFAULT_IMAGE;
    delete process.env.DOCKER_NETWORK_MODE;
    delete process.env.DOCKER_PORT_RANGE_START;
    delete process.env.DOCKER_PORT_RANGE_END;
    delete process.env.CLEANUP_INTERVAL;
    delete process.env.CLEANUP_INACTIVITY_TIMEOUT;
    delete process.env.CLEANUP_MAX_RETRY_ATTEMPTS;
    delete process.env.CLEANUP_FORCE_REMOVAL_TIMEOUT;
    delete process.env.API_PORT;
    delete process.env.API_HOST;
    delete process.env.API_AUTH_ENABLED;

    configManager = ConfigManager.getInstance();
    configManager.reset();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    configManager.reset();
  });

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = ConfigManager.getInstance();
      const instance2 = ConfigManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('loadConfig with defaults', () => {
    it('should load configuration with default values when no environment variables are set', () => {
      const config = configManager.loadConfig();

      expect(config).toEqual({
        docker: {
          socketPath: '/var/run/docker.sock',
          defaultImage: 'alpine:latest',
          networkMode: 'bridge',
          portRange: {
            start: 8000,
            end: 9000
          }
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
      });
    });
  });

  describe('loadConfig with environment variables', () => {
    it('should load configuration from environment variables', () => {
      process.env.DOCKER_SOCKET_PATH = '/custom/docker.sock';
      process.env.DOCKER_DEFAULT_IMAGE = 'ubuntu:20.04';
      process.env.DOCKER_NETWORK_MODE = 'host';
      process.env.DOCKER_PORT_RANGE_START = '9000';
      process.env.DOCKER_PORT_RANGE_END = '10000';
      process.env.CLEANUP_INTERVAL = '120';
      process.env.CLEANUP_INACTIVITY_TIMEOUT = '600';
      process.env.CLEANUP_MAX_RETRY_ATTEMPTS = '5';
      process.env.CLEANUP_FORCE_REMOVAL_TIMEOUT = '60';
      process.env.API_PORT = '4000';
      process.env.API_HOST = '127.0.0.1';
      process.env.API_AUTH_ENABLED = 'true';

      const config = configManager.loadConfig();

      expect(config).toEqual({
        docker: {
          socketPath: '/custom/docker.sock',
          defaultImage: 'ubuntu:20.04',
          networkMode: 'host',
          portRange: {
            start: 9000,
            end: 10000
          }
        },
        cleanup: {
          interval: 120,
          inactivityTimeout: 600,
          maxRetryAttempts: 5,
          forceRemovalTimeout: 60
        },
        api: {
          port: 4000,
          host: '127.0.0.1',
          authEnabled: true
        }
      });
    });
  });

  describe('getConfig', () => {
    it('should return cached config if already loaded', () => {
      const config1 = configManager.loadConfig();
      const config2 = configManager.getConfig();
      expect(config1).toBe(config2);
    });

    it('should load config if not already loaded', () => {
      const config = configManager.getConfig();
      expect(config).toBeDefined();
      expect(config.docker).toBeDefined();
      expect(config.cleanup).toBeDefined();
      expect(config.api).toBeDefined();
    });
  });

  describe('Docker configuration validation', () => {
    it('should throw error for invalid port range start', () => {
      process.env.DOCKER_PORT_RANGE_START = '0';
      
      expect(() => configManager.loadConfig()).toThrow(ConfigValidationError);
      expect(() => configManager.loadConfig()).toThrow('Docker port range start must be a valid port number (1-65535)');
    });

    it('should throw error for invalid port range end', () => {
      process.env.DOCKER_PORT_RANGE_END = '65536';
      
      expect(() => configManager.loadConfig()).toThrow(ConfigValidationError);
      expect(() => configManager.loadConfig()).toThrow('Docker port range end must be a valid port number (1-65535)');
    });

    it('should throw error when port range start >= end', () => {
      process.env.DOCKER_PORT_RANGE_START = '9000';
      process.env.DOCKER_PORT_RANGE_END = '8000';
      
      expect(() => configManager.loadConfig()).toThrow(ConfigValidationError);
      expect(() => configManager.loadConfig()).toThrow('Docker port range start must be less than end');
    });

    it('should throw error for non-numeric port range values', () => {
      process.env.DOCKER_PORT_RANGE_START = 'invalid';
      
      expect(() => configManager.loadConfig()).toThrow(ConfigValidationError);
    });
  });

  describe('Cleanup configuration validation', () => {
    it('should throw error for non-positive cleanup interval', () => {
      process.env.CLEANUP_INTERVAL = '0';
      
      expect(() => configManager.loadConfig()).toThrow(ConfigValidationError);
      expect(() => configManager.loadConfig()).toThrow('Cleanup interval must be a positive integer');
    });

    it('should throw error for non-positive inactivity timeout', () => {
      process.env.CLEANUP_INACTIVITY_TIMEOUT = '-1';
      
      expect(() => configManager.loadConfig()).toThrow(ConfigValidationError);
      expect(() => configManager.loadConfig()).toThrow('Cleanup inactivity timeout must be a positive integer');
    });

    it('should throw error for non-positive max retry attempts', () => {
      process.env.CLEANUP_MAX_RETRY_ATTEMPTS = '0';
      
      expect(() => configManager.loadConfig()).toThrow(ConfigValidationError);
      expect(() => configManager.loadConfig()).toThrow('Cleanup max retry attempts must be a positive integer');
    });

    it('should throw error for non-positive force removal timeout', () => {
      process.env.CLEANUP_FORCE_REMOVAL_TIMEOUT = '0';
      
      expect(() => configManager.loadConfig()).toThrow(ConfigValidationError);
      expect(() => configManager.loadConfig()).toThrow('Cleanup force removal timeout must be a positive integer');
    });

    it('should throw error for non-numeric cleanup values', () => {
      process.env.CLEANUP_INTERVAL = 'invalid';
      
      expect(() => configManager.loadConfig()).toThrow(ConfigValidationError);
    });
  });

  describe('API configuration validation', () => {
    it('should throw error for invalid API port', () => {
      process.env.API_PORT = '0';
      
      expect(() => configManager.loadConfig()).toThrow(ConfigValidationError);
      expect(() => configManager.loadConfig()).toThrow('API port must be a valid port number (1-65535)');
    });

    it('should throw error for port above 65535', () => {
      process.env.API_PORT = '65536';
      
      expect(() => configManager.loadConfig()).toThrow(ConfigValidationError);
      expect(() => configManager.loadConfig()).toThrow('API port must be a valid port number (1-65535)');
    });

    it('should throw error for non-numeric API port', () => {
      process.env.API_PORT = 'invalid';
      
      expect(() => configManager.loadConfig()).toThrow(ConfigValidationError);
    });
  });

  describe('ConfigValidationError', () => {
    it('should create error with field information', () => {
      const error = new ConfigValidationError('Test message', 'test.field');
      expect(error.message).toBe('Test message');
      expect(error.field).toBe('test.field');
      expect(error.name).toBe('ConfigValidationError');
    });
  });

  describe('Edge cases', () => {
    it('should handle boolean environment variables correctly', () => {
      process.env.API_AUTH_ENABLED = 'false';
      const config = configManager.loadConfig();
      expect(config.api.authEnabled).toBe(false);

      configManager.reset();
      process.env.API_AUTH_ENABLED = 'true';
      const config2 = configManager.loadConfig();
      expect(config2.api.authEnabled).toBe(true);
    });

    it('should handle empty string environment variables by using defaults', () => {
      process.env.DOCKER_SOCKET_PATH = '';
      process.env.DOCKER_DEFAULT_IMAGE = '';
      process.env.API_HOST = '';
      
      const config = configManager.loadConfig();
      
      // Should use default values when environment variables are empty
      expect(config.docker.socketPath).toBe('/var/run/docker.sock');
      expect(config.docker.defaultImage).toBe('alpine:latest');
      expect(config.api.host).toBe('0.0.0.0');
    });

    it('should validate that all required fields are present', () => {
      const config = configManager.loadConfig();
      
      // Verify all required fields exist
      expect(config.docker.socketPath).toBeDefined();
      expect(config.docker.defaultImage).toBeDefined();
      expect(config.docker.networkMode).toBeDefined();
      expect(config.docker.portRange.start).toBeDefined();
      expect(config.docker.portRange.end).toBeDefined();
      expect(config.cleanup.interval).toBeDefined();
      expect(config.cleanup.inactivityTimeout).toBeDefined();
      expect(config.cleanup.maxRetryAttempts).toBeDefined();
      expect(config.cleanup.forceRemovalTimeout).toBeDefined();
      expect(config.api.port).toBeDefined();
      expect(config.api.host).toBeDefined();
      expect(config.api.authEnabled).toBeDefined();
    });
  });
});