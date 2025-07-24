---
title: "Configuration Management Guide"
description: "Comprehensive guide for managing configuration in the Ephemeral system, including environment variables, validation, and configuration patterns"
audience: ["developers", "devops", "administrators"]
last_updated: "2025-01-23"
version: "1.0.0"
related_docs:
  - "../development/setup.md"
  - "../deployment/production-setup.md"
  - "../architecture/components.md"
---

# Configuration Management Guide

This guide provides comprehensive instructions for managing configuration in the Ephemeral system, including environment variables, validation patterns, configuration extension, and best practices for different deployment environments.

## Configuration Architecture Overview

The Ephemeral system uses a centralized configuration management approach with the following characteristics:

- **Environment-Based**: Configuration is primarily driven by environment variables
- **Hierarchical**: Configuration is organized into logical sections (docker, cleanup, api)
- **Validated**: All configuration values are validated at startup
- **Type-Safe**: Configuration uses TypeScript interfaces for type safety
- **Defaulted**: Sensible defaults are provided for all configuration options

### Configuration Flow

```mermaid
graph TD
    A[Environment Variables] --> B[ConfigManager.loadConfig()]
    B --> C[Parse & Validate]
    C --> D[SystemConfig Object]
    D --> E[Services Initialize]
    E --> F[Application Starts]
    
    C --> G[Validation Error]
    G --> H[Application Fails to Start]
```

## Configuration Structure

### System Configuration Interface

```typescript
interface SystemConfig {
  docker: DockerConfig;
  cleanup: CleanupConfig;
  api: ApiConfig;
}

interface DockerConfig {
  socketPath: string;           // Path to Docker daemon socket
  defaultImage: string;         // Default container image
  networkMode: string;          // Docker network mode
  portRange: {
    start: number;              // Start of port allocation range
    end: number;                // End of port allocation range
  };
}

interface CleanupConfig {
  interval: number;             // Cleanup check interval (seconds)
  inactivityTimeout: number;    // Container inactivity timeout (seconds)
  maxRetryAttempts: number;     // Max cleanup retry attempts
  forceRemovalTimeout: number;  // Force removal timeout (seconds)
}

interface ApiConfig {
  port: number;                 // API server port
  host: string;                 // API server host
  authEnabled: boolean;         // Authentication enabled flag
}
```

## Environment Variables Reference

### Docker Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DOCKER_SOCKET_PATH` | string | `/var/run/docker.sock` | Path to Docker daemon socket |
| `DOCKER_DEFAULT_IMAGE` | string | `alpine:latest` | Default container image when none specified |
| `DOCKER_NETWORK_MODE` | string | `bridge` | Docker network mode for containers |
| `DOCKER_PORT_RANGE_START` | number | `8000` | Start of port allocation range |
| `DOCKER_PORT_RANGE_END` | number | `9000` | End of port allocation range |

### Cleanup Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CLEANUP_INTERVAL` | number | `60` | How often to check for inactive containers (seconds) |
| `CLEANUP_INACTIVITY_TIMEOUT` | number | `300` | Container inactivity timeout before cleanup (seconds) |
| `CLEANUP_MAX_RETRY_ATTEMPTS` | number | `3` | Maximum retry attempts for failed removals |
| `CLEANUP_FORCE_REMOVAL_TIMEOUT` | number | `30` | Timeout for force container removal (seconds) |

### API Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `API_PORT` | number | `3000` | Port for the REST API server |
| `API_HOST` | string | `0.0.0.0` | Host/interface to bind the API server |
| `API_AUTH_ENABLED` | boolean | `false` | Enable API authentication |

## Configuration Validation

### Built-in Validation Rules

The ConfigManager automatically validates all configuration values:

#### Docker Configuration Validation

```typescript
// Socket path validation
if (!config.socketPath || config.socketPath.trim() === '') {
  throw new ConfigValidationError('Docker socket path must be a non-empty string', 'docker.socketPath');
}

// Image validation
if (!config.defaultImage || config.defaultImage.trim() === '') {
  throw new ConfigValidationError('Docker default image must be a non-empty string', 'docker.defaultImage');
}

// Port range validation
if (config.portRange.start < 1 || config.portRange.start > 65535) {
  throw new ConfigValidationError('Docker port range start must be a valid port number (1-65535)', 'docker.portRange.start');
}

if (config.portRange.start >= config.portRange.end) {
  throw new ConfigValidationError('Docker port range start must be less than end', 'docker.portRange');
}
```

#### Cleanup Configuration Validation

```typescript
// Interval validation
if (!Number.isInteger(config.interval) || config.interval <= 0) {
  throw new ConfigValidationError('Cleanup interval must be a positive integer', 'cleanup.interval');
}

// Timeout validation
if (!Number.isInteger(config.inactivityTimeout) || config.inactivityTimeout <= 0) {
  throw new ConfigValidationError('Cleanup inactivity timeout must be a positive integer', 'cleanup.inactivityTimeout');
}
```

#### API Configuration Validation

```typescript
// Port validation
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new ConfigValidationError('API port must be a valid port number (1-65535)', 'api.port');
}

// Host validation
if (!config.host || config.host.trim() === '') {
  throw new ConfigValidationError('API host must be a non-empty string', 'api.host');
}
```

## Environment-Specific Configuration

### Development Configuration

Create a `.env` file in the project root:

```bash
# Development Configuration
DOCKER_SOCKET_PATH=/var/run/docker.sock
DOCKER_DEFAULT_IMAGE=nginx:alpine
DOCKER_NETWORK_MODE=bridge
DOCKER_PORT_RANGE_START=8000
DOCKER_PORT_RANGE_END=8100

# Frequent cleanup for development
CLEANUP_INTERVAL=30
CLEANUP_INACTIVITY_TIMEOUT=120

# Development API settings
API_PORT=3000
API_HOST=localhost
API_AUTH_ENABLED=false
```

### Testing Configuration

```bash
# Testing Configuration
DOCKER_SOCKET_PATH=/var/run/docker.sock
DOCKER_DEFAULT_IMAGE=alpine:latest
DOCKER_NETWORK_MODE=bridge
DOCKER_PORT_RANGE_START=9000
DOCKER_PORT_RANGE_END=9100

# Quick cleanup for tests
CLEANUP_INTERVAL=10
CLEANUP_INACTIVITY_TIMEOUT=30
CLEANUP_MAX_RETRY_ATTEMPTS=1

# Test API settings
API_PORT=3001
API_HOST=localhost
API_AUTH_ENABLED=false
```

### Production Configuration

```bash
# Production Configuration
DOCKER_SOCKET_PATH=/var/run/docker.sock
DOCKER_DEFAULT_IMAGE=nginx:alpine
DOCKER_NETWORK_MODE=bridge
DOCKER_PORT_RANGE_START=8000
DOCKER_PORT_RANGE_END=10000

# Conservative cleanup for production
CLEANUP_INTERVAL=300
CLEANUP_INACTIVITY_TIMEOUT=1800
CLEANUP_MAX_RETRY_ATTEMPTS=5
CLEANUP_FORCE_REMOVAL_TIMEOUT=60

# Production API settings
API_PORT=80
API_HOST=0.0.0.0
API_AUTH_ENABLED=true
```

### Docker Compose Configuration

```yaml
# docker-compose.yml
version: '3.8'
services:
  ephemeral:
    build: .
    environment:
      - DOCKER_SOCKET_PATH=/var/run/docker.sock
      - DOCKER_DEFAULT_IMAGE=nginx:alpine
      - DOCKER_PORT_RANGE_START=8000
      - DOCKER_PORT_RANGE_END=9000
      - CLEANUP_INTERVAL=300
      - CLEANUP_INACTIVITY_TIMEOUT=600
      - API_PORT=3000
      - API_HOST=0.0.0.0
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "3000:3000"
      - "8000-9000:8000-9000"
```

## Adding New Configuration Options

### Step 1: Extend Configuration Interfaces

Add new configuration options to the appropriate interface in `src/models/SystemConfig.ts`:

```typescript
// Add to existing interface or create new section
interface ApiConfig {
  port: number;
  host: string;
  authEnabled: boolean;
  // New configuration options
  corsEnabled: boolean;
  rateLimitEnabled: boolean;
  maxRequestSize: string;
  requestTimeout: number;
}

// Or create a new configuration section
interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
  destination: 'console' | 'file' | 'both';
  filePath?: string;
  maxFileSize: string;
  maxFiles: number;
}

// Add to SystemConfig
interface SystemConfig {
  docker: DockerConfig;
  cleanup: CleanupConfig;
  api: ApiConfig;
  logging: LoggingConfig; // New section
}
```

### Step 2: Update ConfigManager

Extend the ConfigManager to load and validate new configuration options:

```typescript
// In ConfigManager.ts
private loadApiConfig(): ApiConfig {
  const port = parseInt(process.env.API_PORT || '3000', 10);
  const host = this.getStringEnvVar('API_HOST', '0.0.0.0');
  const authEnabled = process.env.API_AUTH_ENABLED === 'true';
  
  // New configuration options
  const corsEnabled = process.env.API_CORS_ENABLED !== 'false'; // Default true
  const rateLimitEnabled = process.env.API_RATE_LIMIT_ENABLED === 'true';
  const maxRequestSize = this.getStringEnvVar('API_MAX_REQUEST_SIZE', '10mb');
  const requestTimeout = parseInt(process.env.API_REQUEST_TIMEOUT || '30000', 10);

  return {
    port,
    host,
    authEnabled,
    corsEnabled,
    rateLimitEnabled,
    maxRequestSize,
    requestTimeout
  };
}

private loadLoggingConfig(): LoggingConfig {
  const level = this.getStringEnvVar('LOG_LEVEL', 'info') as LoggingConfig['level'];
  const format = this.getStringEnvVar('LOG_FORMAT', 'json') as LoggingConfig['format'];
  const destination = this.getStringEnvVar('LOG_DESTINATION', 'console') as LoggingConfig['destination'];
  const filePath = process.env.LOG_FILE_PATH;
  const maxFileSize = this.getStringEnvVar('LOG_MAX_FILE_SIZE', '10mb');
  const maxFiles = parseInt(process.env.LOG_MAX_FILES || '5', 10);

  return {
    level,
    format,
    destination,
    filePath,
    maxFileSize,
    maxFiles
  };
}
```

### Step 3: Add Validation Rules

```typescript
private validateApiConfig(config: ApiConfig): void {
  // Existing validation...

  // New validation rules
  if (typeof config.corsEnabled !== 'boolean') {
    throw new ConfigValidationError('API CORS enabled must be a boolean', 'api.corsEnabled');
  }

  if (typeof config.rateLimitEnabled !== 'boolean') {
    throw new ConfigValidationError('API rate limit enabled must be a boolean', 'api.rateLimitEnabled');
  }

  if (!config.maxRequestSize || typeof config.maxRequestSize !== 'string') {
    throw new ConfigValidationError('API max request size must be a non-empty string', 'api.maxRequestSize');
  }

  if (!Number.isInteger(config.requestTimeout) || config.requestTimeout <= 0) {
    throw new ConfigValidationError('API request timeout must be a positive integer', 'api.requestTimeout');
  }
}

private validateLoggingConfig(config: LoggingConfig): void {
  const validLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLevels.includes(config.level)) {
    throw new ConfigValidationError(`Log level must be one of: ${validLevels.join(', ')}`, 'logging.level');
  }

  const validFormats = ['json', 'text'];
  if (!validFormats.includes(config.format)) {
    throw new ConfigValidationError(`Log format must be one of: ${validFormats.join(', ')}`, 'logging.format');
  }

  const validDestinations = ['console', 'file', 'both'];
  if (!validDestinations.includes(config.destination)) {
    throw new ConfigValidationError(`Log destination must be one of: ${validDestinations.join(', ')}`, 'logging.destination');
  }

  if ((config.destination === 'file' || config.destination === 'both') && !config.filePath) {
    throw new ConfigValidationError('Log file path is required when destination is file or both', 'logging.filePath');
  }

  if (!Number.isInteger(config.maxFiles) || config.maxFiles <= 0) {
    throw new ConfigValidationError('Log max files must be a positive integer', 'logging.maxFiles');
  }
}
```

### Step 4: Update Environment Variables Documentation

Add new environment variables to `.env.example`:

```bash
# =============================================================================
# API Configuration
# =============================================================================

# ... existing API config ...

# Enable CORS (Cross-Origin Resource Sharing)
API_CORS_ENABLED=true

# Enable rate limiting
API_RATE_LIMIT_ENABLED=false

# Maximum request body size
API_MAX_REQUEST_SIZE=10mb

# Request timeout in milliseconds
API_REQUEST_TIMEOUT=30000

# =============================================================================
# Logging Configuration
# =============================================================================

# Log level: debug, info, warn, error
LOG_LEVEL=info

# Log format: json, text
LOG_FORMAT=json

# Log destination: console, file, both
LOG_DESTINATION=console

# Log file path (required if destination is file or both)
# LOG_FILE_PATH=/var/log/ephemeral.log

# Maximum log file size
LOG_MAX_FILE_SIZE=10mb

# Maximum number of log files to keep
LOG_MAX_FILES=5
```

## Configuration Testing

### Unit Testing Configuration

```typescript
// tests/unit/services/ConfigManager.test.ts
describe('ConfigManager - New Configuration', () => {
  beforeEach(() => {
    // Clear environment
    delete process.env.API_CORS_ENABLED;
    delete process.env.LOG_LEVEL;
    // ... clear other new env vars
  });

  describe('API configuration', () => {
    it('should load CORS configuration with default value', () => {
      const config = configManager.loadConfig();
      expect(config.api.corsEnabled).toBe(true); // Default value
    });

    it('should load CORS configuration from environment', () => {
      process.env.API_CORS_ENABLED = 'false';
      const config = configManager.loadConfig();
      expect(config.api.corsEnabled).toBe(false);
    });

    it('should validate request timeout', () => {
      process.env.API_REQUEST_TIMEOUT = '0';
      expect(() => configManager.loadConfig()).toThrow(ConfigValidationError);
    });
  });

  describe('Logging configuration', () => {
    it('should validate log level', () => {
      process.env.LOG_LEVEL = 'invalid';
      expect(() => configManager.loadConfig()).toThrow('Log level must be one of: debug, info, warn, error');
    });

    it('should require file path for file destination', () => {
      process.env.LOG_DESTINATION = 'file';
      // Don't set LOG_FILE_PATH
      expect(() => configManager.loadConfig()).toThrow('Log file path is required');
    });
  });
});
```

### Integration Testing

```typescript
// tests/integration/configuration.test.ts
describe('Configuration Integration', () => {
  it('should work with complete configuration', async () => {
    // Set all environment variables
    process.env.DOCKER_SOCKET_PATH = '/var/run/docker.sock';
    process.env.API_PORT = '3000';
    process.env.LOG_LEVEL = 'debug';
    // ... set all required env vars

    const app = new DockerOnDemandApp();
    await expect(app.initialize()).resolves.not.toThrow();
    await app.shutdown();
  });

  it('should fail with invalid configuration', async () => {
    process.env.API_PORT = 'invalid';
    
    const app = new DockerOnDemandApp();
    await expect(app.initialize()).rejects.toThrow(ConfigValidationError);
  });
});
```

## Configuration Best Practices

### Security

1. **Sensitive Data**: Never commit sensitive configuration to version control
2. **Environment Isolation**: Use different configurations for different environments
3. **Validation**: Always validate configuration values at startup
4. **Defaults**: Provide secure defaults for all configuration options

### Performance

1. **Caching**: Cache configuration objects to avoid repeated parsing
2. **Lazy Loading**: Load configuration sections only when needed
3. **Validation Timing**: Validate configuration at startup, not runtime

### Maintainability

1. **Documentation**: Document all configuration options thoroughly
2. **Naming**: Use consistent and descriptive environment variable names
3. **Grouping**: Group related configuration options logically
4. **Versioning**: Version configuration schemas for backward compatibility

### Deployment

1. **Environment Files**: Use `.env` files for local development
2. **Container Orchestration**: Use environment variables in Docker/Kubernetes
3. **Configuration Management**: Use tools like Consul, etcd for distributed configuration
4. **Secrets Management**: Use dedicated secret management systems for sensitive data

## Configuration Patterns

### Feature Flags

```typescript
interface FeatureFlags {
  enableNewCleanupAlgorithm: boolean;
  enableAdvancedLogging: boolean;
  enableMetrics: boolean;
}

// In ConfigManager
private loadFeatureFlags(): FeatureFlags {
  return {
    enableNewCleanupAlgorithm: process.env.FEATURE_NEW_CLEANUP === 'true',
    enableAdvancedLogging: process.env.FEATURE_ADVANCED_LOGGING === 'true',
    enableMetrics: process.env.FEATURE_METRICS === 'true'
  };
}
```

### Environment-Specific Overrides

```typescript
// Load base configuration
const baseConfig = this.loadBaseConfig();

// Apply environment-specific overrides
const environment = process.env.NODE_ENV || 'development';
const overrides = this.loadEnvironmentOverrides(environment);

// Merge configurations
const config = { ...baseConfig, ...overrides };
```

### Configuration Profiles

```typescript
interface ConfigProfile {
  name: string;
  docker: Partial<DockerConfig>;
  cleanup: Partial<CleanupConfig>;
  api: Partial<ApiConfig>;
}

const profiles: Record<string, ConfigProfile> = {
  development: {
    name: 'development',
    cleanup: { interval: 30, inactivityTimeout: 120 },
    api: { host: 'localhost' }
  },
  production: {
    name: 'production',
    cleanup: { interval: 300, inactivityTimeout: 1800 },
    api: { host: '0.0.0.0', authEnabled: true }
  }
};
```

## Troubleshooting Configuration Issues

### Common Configuration Errors

1. **Invalid Port Numbers**: Ensure ports are within valid range (1-65535)
2. **Missing Docker Socket**: Verify Docker socket path exists and is accessible
3. **Environment Variable Types**: Ensure boolean values are 'true' or 'false'
4. **Port Range Conflicts**: Ensure port range start is less than end

### Debugging Configuration

```typescript
// Add debug logging to ConfigManager
public loadConfig(): SystemConfig {
  try {
    console.log('Loading configuration...');
    
    const dockerConfig = this.loadDockerConfig();
    console.log('Docker config loaded:', dockerConfig);
    
    const cleanupConfig = this.loadCleanupConfig();
    console.log('Cleanup config loaded:', cleanupConfig);
    
    const apiConfig = this.loadApiConfig();
    console.log('API config loaded:', apiConfig);
    
    const config = { docker: dockerConfig, cleanup: cleanupConfig, api: apiConfig };
    
    this.validateConfig(config);
    console.log('Configuration validation passed');
    
    return config;
  } catch (error) {
    console.error('Configuration loading failed:', error);
    throw error;
  }
}
```

### Configuration Validation Tools

```typescript
// Configuration validation utility
export class ConfigValidator {
  static validateEnvironment(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check required environment variables
    const required = ['DOCKER_SOCKET_PATH', 'API_PORT'];
    for (const envVar of required) {
      if (!process.env[envVar]) {
        errors.push(`Missing required environment variable: ${envVar}`);
      }
    }
    
    // Check port ranges
    const portStart = parseInt(process.env.DOCKER_PORT_RANGE_START || '8000');
    const portEnd = parseInt(process.env.DOCKER_PORT_RANGE_END || '9000');
    if (portStart >= portEnd) {
      errors.push('DOCKER_PORT_RANGE_START must be less than DOCKER_PORT_RANGE_END');
    }
    
    return { valid: errors.length === 0, errors };
  }
}
```

This guide provides a comprehensive foundation for managing configuration in the Ephemeral system, ensuring consistency, validation, and maintainability across all deployment environments.