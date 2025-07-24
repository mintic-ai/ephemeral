import { SystemConfig, DockerConfig, CleanupConfig, ApiConfig } from '../models/SystemConfig.js';

export class ConfigValidationError extends Error {
  constructor(message: string, public field: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: SystemConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load configuration from environment variables with defaults
   */
  public loadConfig(): SystemConfig {
    try {
      const dockerConfig = this.loadDockerConfig();
      const cleanupConfig = this.loadCleanupConfig();
      const apiConfig = this.loadApiConfig();

      this.config = {
        docker: dockerConfig,
        cleanup: cleanupConfig,
        api: apiConfig
      };

      this.validateConfig(this.config);
      return this.config;
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new ConfigValidationError(`Failed to load configuration: ${message}`, 'general');
    }
  }

  /**
   * Get the current configuration
   */
  public getConfig(): SystemConfig {
    if (!this.config) {
      return this.loadConfig();
    }
    return this.config;
  }

  /**
   * Load Docker configuration from environment variables
   */
  private loadDockerConfig(): DockerConfig {
    const socketPath = this.getStringEnvVar('DOCKER_SOCKET_PATH', '/var/run/docker.sock');
    const defaultImage = this.getStringEnvVar('DOCKER_DEFAULT_IMAGE', 'alpine:latest');
    const networkMode = this.getStringEnvVar('DOCKER_NETWORK_MODE', 'bridge');
    const portRangeStart = parseInt(process.env.DOCKER_PORT_RANGE_START || '8000', 10);
    const portRangeEnd = parseInt(process.env.DOCKER_PORT_RANGE_END || '9000', 10);

    return {
      socketPath,
      defaultImage,
      networkMode,
      portRange: {
        start: portRangeStart,
        end: portRangeEnd
      }
    };
  }

  /**
   * Load cleanup configuration from environment variables
   */
  private loadCleanupConfig(): CleanupConfig {
    const interval = parseInt(process.env.CLEANUP_INTERVAL || '60', 10);
    const inactivityTimeout = parseInt(process.env.CLEANUP_INACTIVITY_TIMEOUT || '300', 10);
    const maxRetryAttempts = parseInt(process.env.CLEANUP_MAX_RETRY_ATTEMPTS || '3', 10);
    const forceRemovalTimeout = parseInt(process.env.CLEANUP_FORCE_REMOVAL_TIMEOUT || '30', 10);

    return {
      interval,
      inactivityTimeout,
      maxRetryAttempts,
      forceRemovalTimeout
    };
  }

  /**
   * Load API configuration from environment variables
   */
  private loadApiConfig(): ApiConfig {
    const port = parseInt(process.env.API_PORT || '3000', 10);
    const host = this.getStringEnvVar('API_HOST', '0.0.0.0');
    const authEnabled = process.env.API_AUTH_ENABLED === 'true';

    return {
      port,
      host,
      authEnabled
    };
  }

  /**
   * Validate the complete configuration
   */
  private validateConfig(config: SystemConfig): void {
    this.validateDockerConfig(config.docker);
    this.validateCleanupConfig(config.cleanup);
    this.validateApiConfig(config.api);
  }

  /**
   * Validate Docker configuration
   */
  private validateDockerConfig(config: DockerConfig): void {
    if (!config.socketPath || typeof config.socketPath !== 'string' || config.socketPath.trim() === '') {
      throw new ConfigValidationError('Docker socket path must be a non-empty string', 'docker.socketPath');
    }

    if (!config.defaultImage || typeof config.defaultImage !== 'string' || config.defaultImage.trim() === '') {
      throw new ConfigValidationError('Docker default image must be a non-empty string', 'docker.defaultImage');
    }

    if (!config.networkMode || typeof config.networkMode !== 'string' || config.networkMode.trim() === '') {
      throw new ConfigValidationError('Docker network mode must be a non-empty string', 'docker.networkMode');
    }

    if (!Number.isInteger(config.portRange.start) || config.portRange.start < 1 || config.portRange.start > 65535) {
      throw new ConfigValidationError('Docker port range start must be a valid port number (1-65535)', 'docker.portRange.start');
    }

    if (!Number.isInteger(config.portRange.end) || config.portRange.end < 1 || config.portRange.end > 65535) {
      throw new ConfigValidationError('Docker port range end must be a valid port number (1-65535)', 'docker.portRange.end');
    }

    if (config.portRange.start >= config.portRange.end) {
      throw new ConfigValidationError('Docker port range start must be less than end', 'docker.portRange');
    }
  }

  /**
   * Validate cleanup configuration
   */
  private validateCleanupConfig(config: CleanupConfig): void {
    if (!Number.isInteger(config.interval) || config.interval <= 0) {
      throw new ConfigValidationError('Cleanup interval must be a positive integer', 'cleanup.interval');
    }

    if (!Number.isInteger(config.inactivityTimeout) || config.inactivityTimeout <= 0) {
      throw new ConfigValidationError('Cleanup inactivity timeout must be a positive integer', 'cleanup.inactivityTimeout');
    }

    if (!Number.isInteger(config.maxRetryAttempts) || config.maxRetryAttempts <= 0) {
      throw new ConfigValidationError('Cleanup max retry attempts must be a positive integer', 'cleanup.maxRetryAttempts');
    }

    if (!Number.isInteger(config.forceRemovalTimeout) || config.forceRemovalTimeout <= 0) {
      throw new ConfigValidationError('Cleanup force removal timeout must be a positive integer', 'cleanup.forceRemovalTimeout');
    }
  }

  /**
   * Validate API configuration
   */
  private validateApiConfig(config: ApiConfig): void {
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
      throw new ConfigValidationError('API port must be a valid port number (1-65535)', 'api.port');
    }

    if (!config.host || typeof config.host !== 'string' || config.host.trim() === '') {
      throw new ConfigValidationError('API host must be a non-empty string', 'api.host');
    }

    if (typeof config.authEnabled !== 'boolean') {
      throw new ConfigValidationError('API auth enabled must be a boolean', 'api.authEnabled');
    }
  }

  /**
   * Helper method to get string environment variables with proper empty string handling
   */
  private getStringEnvVar(name: string, defaultValue: string): string {
    const value = process.env[name];
    if (!value || value.trim() === '') {
      return defaultValue;
    }
    return value.trim();
  }

  /**
   * Reset the configuration (useful for testing)
   */
  public reset(): void {
    this.config = null;
  }
}