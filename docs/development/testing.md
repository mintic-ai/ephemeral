---
title: "Testing Documentation"
description: "Testing guidelines, practices, and patterns for the Docker On-Demand project"
audience: ["developers", "contributors"]
last_updated: "2025-01-23"
version: "1.0.0"
related_docs:
  - "setup.md"
  - "coding-standards.md"
  - "contributing.md"
---

# Testing Documentation

This document provides comprehensive guidelines for testing in the Docker On-Demand project. We use Vitest as our testing framework with a focus on both unit and integration testing.

## Testing Philosophy

### Core Principles
- **Test-Driven Development**: Write tests before or alongside implementation
- **Comprehensive Coverage**: Aim for high test coverage (>80%)
- **Fast Feedback**: Tests should run quickly and provide immediate feedback
- **Reliable Tests**: Tests should be deterministic and not flaky
- **Clear Intent**: Tests should clearly express what they're testing

### Testing Pyramid
1. **Unit Tests** (70%): Test individual functions and classes in isolation
2. **Integration Tests** (20%): Test component interactions and workflows
3. **End-to-End Tests** (10%): Test complete user scenarios

## Test Framework Setup

### Vitest Configuration

The project uses Vitest with the following configuration (`vitest.config.ts`):

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/index.ts'
      ]
    }
  }
});
```

### Test Scripts

```bash
# Run all tests once
npm test

# Run tests in watch mode (recommended for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Organization

### Directory Structure

```
tests/
├── unit/                    # Unit tests
│   ├── api/                # API layer tests
│   ├── models/             # Model tests
│   ├── services/           # Service layer tests
│   └── utils/              # Utility function tests
├── integration/            # Integration tests
│   ├── container-lifecycle.test.ts
│   ├── system-integration.test.ts
│   └── docker-failure-recovery.test.ts
└── fixtures/               # Test data and fixtures
    ├── mock-data.ts
    └── test-helpers.ts
```

### File Naming Conventions

- Unit tests: `ComponentName.test.ts`
- Integration tests: `feature-name.test.ts`
- Test utilities: `test-helpers.ts`
- Mock data: `mock-data.ts`

## Unit Testing

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentUnderTest } from '../../../src/path/to/component.js';

describe('ComponentUnderTest', () => {
  let component: ComponentUnderTest;

  beforeEach(() => {
    // Setup before each test
    component = new ComponentUnderTest();
  });

  describe('methodName', () => {
    it('should perform expected behavior when given valid input', () => {
      // Arrange
      const input = 'valid input';
      
      // Act
      const result = component.methodName(input);
      
      // Assert
      expect(result).toBe('expected output');
    });

    it('should throw error when given invalid input', () => {
      // Arrange
      const invalidInput = null;
      
      // Act & Assert
      expect(() => component.methodName(invalidInput))
        .toThrow('Expected error message');
    });
  });
});
```

### Testing Async Functions

```typescript
describe('async operations', () => {
  it('should handle successful async operation', async () => {
    // Arrange
    const mockData = { id: '123', name: 'test' };
    
    // Act
    const result = await service.fetchData('123');
    
    // Assert
    expect(result).toEqual(mockData);
  });

  it('should handle async operation failure', async () => {
    // Arrange
    const invalidId = 'invalid';
    
    // Act & Assert
    await expect(service.fetchData(invalidId))
      .rejects.toThrow('Data not found');
  });
});
```

### Mocking Dependencies

#### External Libraries

```typescript
import { vi } from 'vitest';
import Docker from 'dockerode';

// Mock the entire module
vi.mock('dockerode');
const MockedDocker = Docker as unknown as Mock;

describe('ContainerManager', () => {
  let mockDocker: any;

  beforeEach(() => {
    // Create mock implementation
    mockDocker = {
      createContainer: vi.fn(),
      getContainer: vi.fn(),
      info: vi.fn()
    };
    
    MockedDocker.mockImplementation(() => mockDocker);
  });

  it('should create container using Docker API', async () => {
    // Arrange
    const mockContainer = {
      start: vi.fn().mockResolvedValue(undefined),
      inspect: vi.fn().mockResolvedValue({ Id: 'container-123' })
    };
    mockDocker.createContainer.mockResolvedValue(mockContainer);

    // Act
    const result = await containerManager.createContainer({
      image: 'nginx:alpine'
    });

    // Assert
    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        Image: 'nginx:alpine'
      })
    );
    expect(result.dockerId).toBe('container-123');
  });
});
```

#### Internal Dependencies

```typescript
import { ConfigManager } from '../../../src/services/ConfigManager.js';

vi.mock('../../../src/services/ConfigManager.js');
const MockedConfigManager = ConfigManager as unknown as Mock;

describe('ServiceWithConfig', () => {
  let mockConfigManager: any;

  beforeEach(() => {
    mockConfigManager = {
      getConfig: vi.fn().mockReturnValue({
        docker: { socketPath: '/var/run/docker.sock' },
        api: { port: 3000 }
      })
    };
    
    MockedConfigManager.getInstance = vi.fn()
      .mockReturnValue(mockConfigManager);
  });
});
```

### Testing Error Handling

```typescript
describe('error handling', () => {
  it('should throw custom error with proper properties', () => {
    const originalError = new Error('Original error');
    const customError = new ContainerManagerError(
      'Container creation failed',
      'CONTAINER_CREATE_FAILED',
      originalError
    );

    expect(customError.name).toBe('ContainerManagerError');
    expect(customError.message).toBe('Container creation failed');
    expect(customError.code).toBe('CONTAINER_CREATE_FAILED');
    expect(customError.cause).toBe(originalError);
  });

  it('should handle and transform external errors', async () => {
    // Arrange
    mockDocker.createContainer.mockRejectedValue(
      new Error('Docker daemon not available')
    );

    // Act & Assert
    await expect(containerManager.createContainer({}))
      .rejects.toThrow(ContainerManagerError);
    
    await expect(containerManager.createContainer({}))
      .rejects.toThrow('Failed to create container');
  });
});
```

### Testing State Changes

```typescript
describe('state management', () => {
  it('should track container state correctly', async () => {
    // Initial state
    expect(containerManager.getActiveContainerCount()).toBe(0);

    // Create container
    const container = await containerManager.createContainer({});
    expect(containerManager.getActiveContainerCount()).toBe(1);
    expect(containerManager.hasContainer(container.id)).toBe(true);

    // Remove container
    await containerManager.removeContainer(container.id);
    expect(containerManager.getActiveContainerCount()).toBe(0);
    expect(containerManager.hasContainer(container.id)).toBe(false);
  });
});
```

## Integration Testing

### Setup and Teardown

```typescript
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

describe('Container Lifecycle Integration', () => {
  let apiServer: ApiServer;
  let containerManager: ContainerManager;
  let docker: Docker;

  beforeAll(async () => {
    // Set test environment
    process.env.API_PORT = '3001';
    process.env.DOCKER_PORT_RANGE_START = '9000';
    process.env.DOCKER_PORT_RANGE_END = '9100';

    // Initialize services
    const configManager = ConfigManager.getInstance();
    configManager.reset();
    
    docker = new Docker();
    
    // Verify Docker is available
    try {
      await docker.ping();
    } catch (error) {
      throw new Error('Docker daemon required for integration tests');
    }

    containerManager = new ContainerManager(configManager);
    apiServer = new ApiServer(containerManager);
  });

  afterAll(async () => {
    // Cleanup all test containers
    const containers = await containerManager.listContainers();
    for (const container of containers) {
      try {
        await containerManager.removeContainer(container.id);
      } catch (error) {
        console.warn(`Cleanup failed for ${container.id}:`, error);
      }
    }
  });

  beforeEach(() => {
    containerManager.clear();
  });
});
```

### API Integration Tests

```typescript
import request from 'supertest';

describe('API Integration', () => {
  it('should handle complete container lifecycle via API', async () => {
    const app = apiServer.getApp();

    // Create container
    const createResponse = await request(app)
      .post('/containers')
      .send({
        image: 'alpine:latest',
        environment: { TEST_VAR: 'integration_test' }
      })
      .expect(201);

    expect(createResponse.body.success).toBe(true);
    const containerId = createResponse.body.data.id;

    // Get container details
    const getResponse = await request(app)
      .get(`/containers/${containerId}`)
      .expect(200);

    expect(getResponse.body.data.id).toBe(containerId);
    expect(getResponse.body.data.status).toBe('running');

    // List containers
    const listResponse = await request(app)
      .get('/containers')
      .expect(200);

    expect(listResponse.body.data).toHaveLength(1);

    // Delete container
    await request(app)
      .delete(`/containers/${containerId}`)
      .expect(200);

    // Verify deletion
    await request(app)
      .get(`/containers/${containerId}`)
      .expect(404);
  });
});
```

### Service Integration Tests

```typescript
describe('Service Integration', () => {
  it('should coordinate between services correctly', async () => {
    // Create container through ContainerManager
    const container = await containerManager.createContainer({
      image: 'alpine:latest'
    });

    // Start monitoring through ActivityMonitor
    activityMonitor.startMonitoring(container.id, container.dockerId);

    // Simulate activity
    activityMonitor.updateActivity({
      containerId: container.id,
      activityType: 'http_request',
      details: { method: 'GET', path: '/test' }
    });

    // Verify activity was recorded
    const lastActivity = activityMonitor.getLastActivity(container.id);
    expect(lastActivity).toBeTruthy();

    // Start cleanup scheduler
    cleanupScheduler.start();

    // Wait for potential cleanup (should not happen due to recent activity)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Container should still exist
    const containers = await containerManager.listContainers();
    expect(containers).toHaveLength(1);

    cleanupScheduler.stop();
  });
});
```

## Testing Patterns

### Test Data Builders

```typescript
// tests/fixtures/builders.ts
export class ContainerBuilder {
  private container: Partial<Container> = {};

  withId(id: string): ContainerBuilder {
    this.container.id = id;
    return this;
  }

  withImage(image: string): ContainerBuilder {
    this.container.image = image;
    return this;
  }

  withStatus(status: Container['status']): ContainerBuilder {
    this.container.status = status;
    return this;
  }

  build(): Container {
    return {
      id: this.container.id || 'test-container-id',
      dockerId: this.container.dockerId || 'docker-123',
      image: this.container.image || 'alpine:latest',
      status: this.container.status || 'running',
      createdAt: this.container.createdAt || new Date(),
      lastActivity: this.container.lastActivity || new Date(),
      connection: this.container.connection || {
        host: 'localhost',
        port: 8000,
        url: 'http://localhost:8000'
      },
      environment: this.container.environment || {},
      metadata: this.container.metadata || {}
    };
  }
}

// Usage in tests
const container = new ContainerBuilder()
  .withId('test-123')
  .withImage('nginx:alpine')
  .withStatus('running')
  .build();
```

### Custom Matchers

```typescript
// tests/fixtures/matchers.ts
import { expect } from 'vitest';

expect.extend({
  toBeValidContainer(received: any) {
    const pass = received &&
      typeof received.id === 'string' &&
      typeof received.dockerId === 'string' &&
      typeof received.image === 'string' &&
      ['creating', 'running', 'stopping', 'stopped', 'error'].includes(received.status) &&
      received.createdAt instanceof Date &&
      received.lastActivity instanceof Date &&
      received.connection &&
      typeof received.connection.host === 'string' &&
      typeof received.connection.port === 'number';

    return {
      pass,
      message: () => pass
        ? `Expected ${received} not to be a valid container`
        : `Expected ${received} to be a valid container`
    };
  }
});

// Usage
expect(container).toBeValidContainer();
```

### Parameterized Tests

```typescript
describe.each([
  { image: 'alpine:latest', expectedStatus: 'running' },
  { image: 'nginx:alpine', expectedStatus: 'running' },
  { image: 'node:alpine', expectedStatus: 'running' }
])('container creation with $image', ({ image, expectedStatus }) => {
  it(`should create container with ${image}`, async () => {
    const container = await containerManager.createContainer({ image });
    
    expect(container.image).toBe(image);
    expect(container.status).toBe(expectedStatus);
  });
});
```

## Mocking Strategies

### Docker API Mocking

```typescript
const createMockDockerContainer = (overrides = {}) => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  inspect: vi.fn().mockResolvedValue({
    Id: 'docker-container-id-123',
    State: { Running: true },
    ...overrides
  })
});

const createMockDocker = () => ({
  createContainer: vi.fn().mockResolvedValue(createMockDockerContainer()),
  getContainer: vi.fn().mockReturnValue(createMockDockerContainer()),
  info: vi.fn().mockResolvedValue({
    ServerVersion: '24.0.7',
    Containers: 5,
    Images: 12
  }),
  ping: vi.fn().mockResolvedValue(undefined)
});
```

### Time-based Testing

```typescript
import { vi } from 'vitest';

describe('time-sensitive operations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should cleanup inactive containers after timeout', async () => {
    const container = await containerManager.createContainer({});
    
    // Start cleanup scheduler
    cleanupScheduler.start();
    
    // Fast-forward time past inactivity timeout
    vi.advanceTimersByTime(15000); // 15 seconds
    
    // Allow async operations to complete
    await vi.runAllTimersAsync();
    
    // Container should be cleaned up
    const containers = await containerManager.listContainers();
    expect(containers).toHaveLength(0);
  });
});
```

## Test Coverage

### Coverage Goals
- **Overall Coverage**: >80%
- **Critical Paths**: >95%
- **Error Handling**: >90%
- **Public APIs**: 100%

### Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# View HTML coverage report
open coverage/index.html
```

### Coverage Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      },
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/index.ts'
      ]
    }
  }
});
```

## Testing Best Practices

### Test Organization
- Group related tests in `describe` blocks
- Use descriptive test names that explain the scenario
- Follow the AAA pattern (Arrange, Act, Assert)
- Keep tests focused on a single behavior

### Test Independence
- Each test should be independent and isolated
- Use `beforeEach` and `afterEach` for setup and cleanup
- Don't rely on test execution order
- Clean up resources after tests

### Assertion Guidelines
- Use specific assertions over generic ones
- Test both positive and negative cases
- Verify error messages and error types
- Check side effects and state changes

### Mock Management
- Mock external dependencies consistently
- Reset mocks between tests
- Use type-safe mocks when possible
- Don't over-mock - test real integrations when valuable

### Performance Considerations
- Keep unit tests fast (<100ms each)
- Use integration tests sparingly
- Mock expensive operations in unit tests
- Parallelize test execution when possible

## Debugging Tests

### Running Specific Tests

```bash
# Run specific test file
npm test -- container-manager.test.ts

# Run specific test suite
npm test -- --grep "ContainerManager"

# Run specific test
npm test -- --grep "should create container with default image"

# Run tests in specific directory
npm test -- tests/unit/services/
```

### Debug Mode

```bash
# Run tests with debug output
npm test -- --reporter=verbose

# Run tests with coverage and debug
npm run test:coverage -- --reporter=verbose
```

### VS Code Debugging

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "program": "${workspaceFolder}/node_modules/.bin/vitest",
  "args": ["run", "--reporter=verbose"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      docker:
        image: docker:dind
        options: --privileged
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm test -- --reporter=junit --outputFile=test-results.xml
      
      - name: Run integration tests
        run: npm test -- tests/integration/ --reporter=junit
        env:
          DOCKER_HOST: tcp://localhost:2376
      
      - name: Generate coverage
        run: npm run test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Common Testing Scenarios

### Testing API Endpoints

```typescript
describe('API Error Handling', () => {
  it('should return 400 for invalid JSON', async () => {
    const response = await request(app)
      .post('/containers')
      .send('invalid json')
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('should return 404 for non-existent container', async () => {
    const response = await request(app)
      .get('/containers/non-existent-id')
      .expect(404);

    expect(response.body.error.code).toBe('CONTAINER_NOT_FOUND');
  });
});
```

### Testing Async Operations

```typescript
describe('Async Container Operations', () => {
  it('should handle concurrent container creation', async () => {
    const requests = Array(5).fill(null).map(() =>
      containerManager.createContainer({ image: 'alpine:latest' })
    );

    const containers = await Promise.all(requests);

    expect(containers).toHaveLength(5);
    containers.forEach((container, index) => {
      expect(container.connection.port).toBe(8000 + index);
    });
  });
});
```

### Testing Error Recovery

```typescript
describe('Error Recovery', () => {
  it('should retry failed operations', async () => {
    let callCount = 0;
    mockDocker.createContainer.mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        throw new Error('Temporary failure');
      }
      return Promise.resolve(createMockDockerContainer());
    });

    const container = await containerManager.createContainer({});

    expect(callCount).toBe(3);
    expect(container).toBeDefined();
  });
});
```

## Troubleshooting

### Common Issues

**Tests timing out**:
- Increase timeout for integration tests
- Check for unresolved promises
- Ensure proper cleanup in `afterEach`

**Flaky tests**:
- Use deterministic test data
- Avoid race conditions
- Mock time-dependent operations

**Docker-related test failures**:
- Ensure Docker daemon is running
- Check Docker socket permissions
- Use test-specific Docker images

**Memory leaks in tests**:
- Clean up event listeners
- Clear timers and intervals
- Reset singleton instances

### Debug Techniques

```typescript
// Add debug logging
console.log('Debug info:', { variable, state });

// Use debugger statements
debugger;

// Check mock call history
expect(mockFunction).toHaveBeenCalledTimes(2);
expect(mockFunction).toHaveBeenCalledWith(expectedArgs);
console.log(mockFunction.mock.calls);
```

This comprehensive testing documentation should help developers write effective tests and maintain high code quality in the Docker On-Demand project.