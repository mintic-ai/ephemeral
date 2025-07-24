---
title: "Service Development Guide"
description: "Comprehensive guide for creating and integrating new services in the Ephemeral system"
audience: ["developers", "contributors"]
last_updated: "2025-01-23"
version: "1.0.0"
related_docs:
  - "../development/coding-standards.md"
  - "../development/testing.md"
  - "../architecture/components.md"
---

# Service Development Guide

This guide provides comprehensive instructions for creating new services in the Ephemeral system, including architecture patterns, dependency injection, testing strategies, and integration examples.

## Service Architecture Overview

The Ephemeral system follows a service-oriented architecture where each service has specific responsibilities and well-defined interfaces. Services are designed to be:

- **Single Responsibility**: Each service handles one specific domain
- **Loosely Coupled**: Services depend on interfaces, not concrete implementations
- **Testable**: Services can be easily mocked and unit tested
- **Injectable**: Dependencies are provided through constructor injection

### Core Service Patterns

All services in the system follow these architectural patterns:

1. **Constructor Dependency Injection**: Dependencies are injected through the constructor
2. **Interface Segregation**: Services expose minimal, focused interfaces
3. **Error Handling**: Services use custom error types with proper error codes
4. **Logging Integration**: All services integrate with the centralized logging system
5. **Configuration Management**: Services receive configuration through ConfigManager

## Service Structure Template

Here's the basic structure every service should follow:

```typescript
import { Logger } from '../utils/Logger.js';
import { ConfigManager } from './ConfigManager.js';
import { SystemConfig } from '../models/SystemConfig.js';

// Custom error type for the service
export class MyServiceError extends Error {
  constructor(message: string, public code: string, public cause?: Error) {
    super(message);
    this.name = 'MyServiceError';
  }
}

export class MyService {
  private config: SystemConfig;
  private logger: Logger;
  // Other private properties

  constructor(configManager?: ConfigManager) {
    this.config = configManager ? configManager.getConfig() : ConfigManager.getInstance().getConfig();
    this.logger = Logger.getInstance();
    
    // Initialize service-specific properties
    this.initializeService();
  }

  /**
   * Initialize service-specific configuration and state
   */
  private initializeService(): void {
    // Service initialization logic
  }

  /**
   * Public service methods
   */
  public async performOperation(params: any): Promise<any> {
    try {
      this.logger.info('MyService', 'Starting operation', { params });
      
      // Service logic here
      const result = await this.executeOperation(params);
      
      this.logger.info('MyService', 'Operation completed successfully', { result });
      return result;
      
    } catch (error) {
      const serviceError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('MyService', 'Operation failed', serviceError);
      
      throw new MyServiceError(
        `Operation failed: ${serviceError.message}`,
        'OPERATION_FAILED',
        serviceError
      );
    }
  }

  /**
   * Private helper methods
   */
  private async executeOperation(params: any): Promise<any> {
    // Implementation details
  }

  /**
   * Cleanup method for graceful shutdown
   */
  public cleanup(): void {
    // Cleanup resources, stop timers, etc.
  }
}
```

## Step-by-Step Service Creation

### Step 1: Define Service Requirements

Before creating a service, clearly define:

1. **Purpose**: What specific responsibility will this service handle?
2. **Dependencies**: What other services or utilities does it need?
3. **Interface**: What public methods will it expose?
4. **Error Scenarios**: What can go wrong and how should errors be handled?
5. **Configuration**: What configuration options does it need?

### Step 2: Create Service Models (if needed)

If your service needs custom data types, create them in the `src/models/` directory:

```typescript
// src/models/MyServiceData.ts
export interface MyServiceData {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface MyServiceRequest {
  name: string;
  options?: Record<string, any>;
}

export interface MyServiceResponse {
  success: boolean;
  data?: MyServiceData;
  message?: string;
}
```

### Step 3: Implement the Service

Create your service file in `src/services/`:

```typescript
// src/services/MyService.ts
import { Logger } from '../utils/Logger.js';
import { ConfigManager } from './ConfigManager.js';
import { SystemConfig } from '../models/SystemConfig.js';
import { MyServiceData, MyServiceRequest, MyServiceResponse } from '../models/MyServiceData.js';

export class MyServiceError extends Error {
  constructor(message: string, public code: string, public cause?: Error) {
    super(message);
    this.name = 'MyServiceError';
  }
}

export class MyService {
  private config: SystemConfig;
  private logger: Logger;
  private serviceData: Map<string, MyServiceData> = new Map();

  constructor(configManager?: ConfigManager) {
    this.config = configManager ? configManager.getConfig() : ConfigManager.getInstance().getConfig();
    this.logger = Logger.getInstance();
    
    this.logger.info('MyService', 'Service initialized');
  }

  /**
   * Create a new resource
   */
  public async create(request: MyServiceRequest): Promise<MyServiceResponse> {
    try {
      this.logger.info('MyService', 'Creating resource', { name: request.name });

      // Validate request
      this.validateRequest(request);

      // Generate unique ID
      const id = this.generateId();

      // Create resource
      const data: MyServiceData = {
        id,
        name: request.name,
        status: 'active',
        createdAt: new Date(),
        metadata: request.options || {}
      };

      // Store resource
      this.serviceData.set(id, data);

      this.logger.info('MyService', 'Resource created successfully', { id, name: request.name });

      return {
        success: true,
        data,
        message: 'Resource created successfully'
      };

    } catch (error) {
      const serviceError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('MyService', 'Failed to create resource', serviceError);

      if (error instanceof MyServiceError) {
        throw error;
      }

      throw new MyServiceError(
        `Failed to create resource: ${serviceError.message}`,
        'CREATE_FAILED',
        serviceError
      );
    }
  }

  /**
   * Get resource by ID
   */
  public async get(id: string): Promise<MyServiceData | null> {
    try {
      this.logger.debug('MyService', 'Getting resource', { id });

      const data = this.serviceData.get(id);
      if (!data) {
        return null;
      }

      return data;

    } catch (error) {
      const serviceError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('MyService', 'Failed to get resource', serviceError);
      
      throw new MyServiceError(
        `Failed to get resource: ${serviceError.message}`,
        'GET_FAILED',
        serviceError
      );
    }
  }

  /**
   * List all resources
   */
  public async list(): Promise<MyServiceData[]> {
    try {
      this.logger.debug('MyService', 'Listing resources');
      return Array.from(this.serviceData.values());
    } catch (error) {
      const serviceError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('MyService', 'Failed to list resources', serviceError);
      
      throw new MyServiceError(
        `Failed to list resources: ${serviceError.message}`,
        'LIST_FAILED',
        serviceError
      );
    }
  }

  /**
   * Delete resource by ID
   */
  public async delete(id: string): Promise<boolean> {
    try {
      this.logger.info('MyService', 'Deleting resource', { id });

      const exists = this.serviceData.has(id);
      if (!exists) {
        throw new MyServiceError(
          `Resource with ID ${id} not found`,
          'RESOURCE_NOT_FOUND'
        );
      }

      this.serviceData.delete(id);
      this.logger.info('MyService', 'Resource deleted successfully', { id });

      return true;

    } catch (error) {
      const serviceError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('MyService', 'Failed to delete resource', serviceError);

      if (error instanceof MyServiceError) {
        throw error;
      }

      throw new MyServiceError(
        `Failed to delete resource: ${serviceError.message}`,
        'DELETE_FAILED',
        serviceError
      );
    }
  }

  /**
   * Validate service request
   */
  private validateRequest(request: MyServiceRequest): void {
    if (!request.name || typeof request.name !== 'string' || request.name.trim() === '') {
      throw new MyServiceError('Name is required and must be a non-empty string', 'INVALID_REQUEST');
    }

    if (request.options && typeof request.options !== 'object') {
      throw new MyServiceError('Options must be an object if provided', 'INVALID_REQUEST');
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `myservice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get service statistics
   */
  public getStats(): { total: number; active: number; inactive: number } {
    const resources = Array.from(this.serviceData.values());
    return {
      total: resources.length,
      active: resources.filter(r => r.status === 'active').length,
      inactive: resources.filter(r => r.status === 'inactive').length
    };
  }

  /**
   * Cleanup service resources
   */
  public cleanup(): void {
    this.logger.info('MyService', 'Cleaning up service resources');
    this.serviceData.clear();
  }
}
```

### Step 4: Export the Service

Add your service to the services index file:

```typescript
// src/services/index.ts
export * from './ContainerManager.js';
export * from './ActivityMonitor.js';
export * from './CleanupScheduler.js';
export * from './ConfigManager.js';
export * from './MyService.js'; // Add your service here
```

### Step 5: Create Comprehensive Tests

Create unit tests in `tests/unit/services/`:

```typescript
// tests/unit/services/MyService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MyService, MyServiceError } from '../../../src/services/MyService.js';
import { ConfigManager } from '../../../src/services/ConfigManager.js';
import { MyServiceRequest } from '../../../src/models/MyServiceData.js';

// Mock ConfigManager
vi.mock('../../../src/services/ConfigManager.js');
const MockedConfigManager = ConfigManager as unknown as vi.Mock;

describe('MyService', () => {
  let myService: MyService;
  let mockConfigManager: any;
  let mockConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock configuration
    mockConfig = {
      docker: {
        socketPath: '/var/run/docker.sock',
        defaultImage: 'alpine:latest',
        networkMode: 'bridge',
        portRange: { start: 8000, end: 9000 }
      },
      api: { port: 3000, host: '0.0.0.0', authEnabled: false },
      cleanup: { interval: 60, inactivityTimeout: 300, maxRetryAttempts: 3, forceRemovalTimeout: 30 }
    };

    mockConfigManager = {
      getConfig: vi.fn().mockReturnValue(mockConfig)
    };
    MockedConfigManager.getInstance = vi.fn().mockReturnValue(mockConfigManager);

    myService = new MyService(mockConfigManager);
  });

  describe('create', () => {
    it('should create a resource successfully', async () => {
      const request: MyServiceRequest = {
        name: 'test-resource',
        options: { key: 'value' }
      };

      const response = await myService.create(request);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data!.name).toBe('test-resource');
      expect(response.data!.status).toBe('active');
      expect(response.data!.id).toBeDefined();
      expect(response.data!.createdAt).toBeInstanceOf(Date);
      expect(response.message).toBe('Resource created successfully');
    });

    it('should throw error for invalid request', async () => {
      const request: MyServiceRequest = {
        name: '', // Invalid empty name
      };

      await expect(myService.create(request)).rejects.toThrow(MyServiceError);
      await expect(myService.create(request)).rejects.toThrow('Name is required and must be a non-empty string');
    });

    it('should handle options correctly', async () => {
      const request: MyServiceRequest = {
        name: 'test-resource',
        options: { env: 'production', debug: 'true' }
      };

      const response = await myService.create(request);

      expect(response.data!.metadata).toEqual({ env: 'production', debug: 'true' });
    });
  });

  describe('get', () => {
    it('should return resource by ID', async () => {
      const request: MyServiceRequest = { name: 'test-resource' };
      const createResponse = await myService.create(request);
      const resourceId = createResponse.data!.id;

      const resource = await myService.get(resourceId);

      expect(resource).toBeDefined();
      expect(resource!.id).toBe(resourceId);
      expect(resource!.name).toBe('test-resource');
    });

    it('should return null for non-existent resource', async () => {
      const resource = await myService.get('non-existent-id');
      expect(resource).toBeNull();
    });
  });

  describe('list', () => {
    it('should return empty array when no resources exist', async () => {
      const resources = await myService.list();
      expect(resources).toEqual([]);
    });

    it('should return all resources', async () => {
      await myService.create({ name: 'resource-1' });
      await myService.create({ name: 'resource-2' });

      const resources = await myService.list();

      expect(resources).toHaveLength(2);
      expect(resources.map(r => r.name)).toContain('resource-1');
      expect(resources.map(r => r.name)).toContain('resource-2');
    });
  });

  describe('delete', () => {
    it('should delete existing resource', async () => {
      const createResponse = await myService.create({ name: 'test-resource' });
      const resourceId = createResponse.data!.id;

      const result = await myService.delete(resourceId);

      expect(result).toBe(true);
      
      const resource = await myService.get(resourceId);
      expect(resource).toBeNull();
    });

    it('should throw error for non-existent resource', async () => {
      await expect(myService.delete('non-existent-id')).rejects.toThrow(MyServiceError);
      await expect(myService.delete('non-existent-id')).rejects.toThrow('Resource with ID non-existent-id not found');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      await myService.create({ name: 'resource-1' });
      await myService.create({ name: 'resource-2' });

      const stats = myService.getStats();

      expect(stats.total).toBe(2);
      expect(stats.active).toBe(2);
      expect(stats.inactive).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should clear all resources', async () => {
      await myService.create({ name: 'resource-1' });
      await myService.create({ name: 'resource-2' });

      expect((await myService.list())).toHaveLength(2);

      myService.cleanup();

      expect((await myService.list())).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should create MyServiceError with proper properties', () => {
      const originalError = new Error('Original error');
      const error = new MyServiceError('Test message', 'TEST_CODE', originalError);

      expect(error.name).toBe('MyServiceError');
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.cause).toBe(originalError);
    });
  });
});
```

### Step 6: Integration with Main Application

To integrate your service with the main application, modify `src/index.ts`:

```typescript
// Add to imports
import { MyService } from './services/MyService.js';

// Add to DockerOnDemandApp class
class DockerOnDemandApp {
  // ... existing properties
  private myService!: MyService;

  async initialize(): Promise<void> {
    try {
      // ... existing initialization code

      // Initialize your service after ConfigManager
      this.myService = new MyService(this.configManager);
      this.logger.info('DockerOnDemandApp', 'MyService initialized');

      // ... rest of initialization
    } catch (error) {
      // ... error handling
    }
  }

  async shutdown(): Promise<void> {
    // ... existing shutdown code

    // Add cleanup for your service
    if (this.myService) {
      this.myService.cleanup();
      this.logger.info('DockerOnDemandApp', 'MyService cleaned up');
    }

    // ... rest of shutdown
  }
}
```

## Dependency Injection Patterns

### Constructor Injection

The preferred pattern for dependency injection:

```typescript
export class MyService {
  constructor(
    private containerManager: ContainerManager,
    private activityMonitor: ActivityMonitor,
    configManager?: ConfigManager
  ) {
    this.config = configManager ? configManager.getConfig() : ConfigManager.getInstance().getConfig();
    // ... initialization
  }
}
```

### Optional Dependencies

For optional dependencies, use default values:

```typescript
export class MyService {
  constructor(
    configManager?: ConfigManager,
    logger?: Logger
  ) {
    this.config = configManager ? configManager.getConfig() : ConfigManager.getInstance().getConfig();
    this.logger = logger || Logger.getInstance();
  }
}
```

### Service Factory Pattern

For complex service creation:

```typescript
export class MyServiceFactory {
  static create(dependencies: {
    containerManager?: ContainerManager;
    activityMonitor?: ActivityMonitor;
    configManager?: ConfigManager;
  } = {}): MyService {
    const configManager = dependencies.configManager || ConfigManager.getInstance();
    const containerManager = dependencies.containerManager || new ContainerManager(configManager);
    const activityMonitor = dependencies.activityMonitor || new ActivityMonitor(new Docker());

    return new MyService(containerManager, activityMonitor, configManager);
  }
}
```

## Testing Strategies

### Unit Testing

Focus on testing individual service methods in isolation:

```typescript
describe('MyService', () => {
  let service: MyService;
  let mockDependency: any;

  beforeEach(() => {
    mockDependency = {
      method: vi.fn().mockResolvedValue('result')
    };
    service = new MyService(mockDependency);
  });

  it('should handle success case', async () => {
    const result = await service.performOperation('input');
    expect(result).toBe('expected');
    expect(mockDependency.method).toHaveBeenCalledWith('input');
  });

  it('should handle error case', async () => {
    mockDependency.method.mockRejectedValue(new Error('Test error'));
    await expect(service.performOperation('input')).rejects.toThrow('Test error');
  });
});
```

### Integration Testing

Test service interactions with real dependencies:

```typescript
describe('MyService Integration', () => {
  let service: MyService;
  let configManager: ConfigManager;

  beforeEach(() => {
    configManager = ConfigManager.getInstance();
    service = new MyService(configManager);
  });

  it('should work with real configuration', async () => {
    const result = await service.performOperation('real-input');
    expect(result).toBeDefined();
  });
});
```

### Mock Strategies

Use different mocking approaches based on needs:

```typescript
// Full mock
vi.mock('../../../src/services/ConfigManager.js');

// Partial mock
vi.mock('../../../src/services/ConfigManager.js', () => ({
  ConfigManager: {
    getInstance: vi.fn().mockReturnValue({
      getConfig: vi.fn().mockReturnValue(mockConfig)
    })
  }
}));

// Spy on real implementation
import { ConfigManager } from '../../../src/services/ConfigManager.js';
const configSpy = vi.spyOn(ConfigManager.prototype, 'getConfig');
```

## Best Practices

### Error Handling

1. **Custom Error Types**: Create specific error classes for your service
2. **Error Codes**: Use consistent error codes for different failure scenarios
3. **Error Context**: Include relevant context in error messages
4. **Error Logging**: Log errors with appropriate detail level

### Logging

1. **Structured Logging**: Use consistent log formats with context
2. **Log Levels**: Use appropriate log levels (debug, info, warn, error)
3. **Performance Logging**: Log operation start/completion times
4. **Sensitive Data**: Never log sensitive information

### Configuration

1. **Environment Variables**: Use environment variables for configuration
2. **Validation**: Validate configuration values at startup
3. **Defaults**: Provide sensible default values
4. **Documentation**: Document all configuration options

### Performance

1. **Async Operations**: Use async/await for I/O operations
2. **Resource Cleanup**: Implement proper cleanup methods
3. **Memory Management**: Avoid memory leaks in long-running services
4. **Caching**: Implement caching where appropriate

### Security

1. **Input Validation**: Validate all inputs thoroughly
2. **Error Messages**: Don't expose sensitive information in error messages
3. **Resource Limits**: Implement appropriate resource limits
4. **Access Control**: Implement proper access controls where needed

## Common Patterns

### Singleton Services

For services that should have only one instance:

```typescript
export class MySingletonService {
  private static instance: MySingletonService;

  private constructor() {
    // Private constructor
  }

  public static getInstance(): MySingletonService {
    if (!MySingletonService.instance) {
      MySingletonService.instance = new MySingletonService();
    }
    return MySingletonService.instance;
  }
}
```

### Event-Driven Services

For services that need to emit or listen to events:

```typescript
import { EventEmitter } from 'events';

export class MyEventService extends EventEmitter {
  constructor() {
    super();
  }

  public performOperation(): void {
    // Do work
    this.emit('operation-completed', { result: 'success' });
  }
}
```

### Scheduled Services

For services that need to run on a schedule:

```typescript
export class MyScheduledService {
  private interval: NodeJS.Timeout | null = null;

  public start(): void {
    this.interval = setInterval(() => {
      this.performScheduledTask();
    }, 60000); // Every minute
  }

  public stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private performScheduledTask(): void {
    // Scheduled work
  }
}
```

## Troubleshooting

### Common Issues

1. **Circular Dependencies**: Avoid circular imports between services
2. **Memory Leaks**: Ensure proper cleanup of timers and event listeners
3. **Configuration Errors**: Validate configuration early in service lifecycle
4. **Test Isolation**: Ensure tests don't interfere with each other

### Debugging Tips

1. **Enable Debug Logging**: Use debug log level for detailed information
2. **Service Health Checks**: Implement health check methods
3. **Metrics Collection**: Add metrics for monitoring service performance
4. **Error Tracking**: Use structured error tracking

This guide provides a comprehensive foundation for creating robust, testable, and maintainable services in the Ephemeral system. Follow these patterns and practices to ensure consistency and quality across all services.