---
title: "Coding Standards"
description: "Code style guidelines and best practices for the Docker On-Demand project"
audience: ["developers", "contributors"]
last_updated: "2025-01-23"
version: "1.0.0"
related_docs:
  - "contributing.md"
  - "setup.md"
  - "testing.md"
---

# Coding Standards

This document outlines the coding standards and best practices for the Docker On-Demand project. Following these standards ensures code consistency, maintainability, and readability across the codebase.

## General Principles

### Code Quality
- Write clean, readable, and self-documenting code
- Follow the principle of least surprise
- Prefer explicit over implicit behavior
- Keep functions small and focused on a single responsibility
- Use meaningful names for variables, functions, and classes

### Performance
- Optimize for readability first, performance second
- Profile before optimizing
- Use appropriate data structures for the task
- Avoid premature optimization

### Security
- Never commit sensitive information (passwords, API keys, tokens)
- Validate all inputs
- Use environment variables for configuration
- Follow secure coding practices

## TypeScript Standards

### Type Definitions

**Use explicit types for public APIs:**
```typescript
// Good
export interface ContainerCreateRequest {
  image: string;
  environment?: Record<string, string>;
  ports?: number[];
}

// Avoid
export function createContainer(request: any): any {
  // ...
}
```

**Use union types for known values:**
```typescript
// Good
type ContainerStatus = 'creating' | 'running' | 'stopping' | 'stopped' | 'error';

// Avoid
type ContainerStatus = string;
```

**Use generic types appropriately:**
```typescript
// Good
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

// Usage
const response: ApiResponse<Container> = await createContainer(request);
```

### Interface vs Type

**Use interfaces for object shapes:**
```typescript
// Good
export interface Container {
  id: string;
  dockerId: string;
  status: ContainerStatus;
}
```

**Use types for unions, primitives, and computed types:**
```typescript
// Good
type ContainerStatus = 'running' | 'stopped' | 'error';
type ContainerEventType = 'create' | 'start' | 'stop' | 'remove';
```

### Null and Undefined

**Use strict null checks (enabled in tsconfig.json):**
```typescript
// Good
function getContainer(id: string): Container | null {
  return this.containers.get(id) || null;
}

// Avoid
function getContainer(id: string): Container {
  return this.containers.get(id); // Could return undefined
}
```

**Use optional properties appropriately:**
```typescript
// Good
interface ContainerCreateRequest {
  image: string;
  environment?: Record<string, string>; // Optional
  ports?: number[]; // Optional
}
```

## Naming Conventions

### Variables and Functions
- Use camelCase for variables and functions
- Use descriptive names that explain purpose
- Avoid abbreviations unless they're widely understood

```typescript
// Good
const containerManager = new ContainerManager();
const activeContainerCount = containerManager.getActiveContainerCount();

// Avoid
const cm = new ContainerManager();
const cnt = cm.getActiveCnt();
```

### Classes
- Use PascalCase for class names
- Use descriptive names that indicate purpose
- Suffix error classes with "Error"

```typescript
// Good
export class ContainerManager {
  // ...
}

export class ContainerManagerError extends Error {
  // ...
}

// Avoid
export class containerManager {
  // ...
}

export class CMError extends Error {
  // ...
}
```

### Constants
- Use SCREAMING_SNAKE_CASE for module-level constants
- Use camelCase for local constants

```typescript
// Good - Module level
const DEFAULT_CLEANUP_INTERVAL = 300;
const MAX_RETRY_ATTEMPTS = 3;

// Good - Local scope
function processContainer() {
  const maxRetries = 3;
  const timeoutMs = 5000;
}
```

### Files and Directories
- Use PascalCase for class files: `ContainerManager.ts`
- Use camelCase for utility files: `errorHandler.ts`
- Use kebab-case for directories: `api-docs/`
- Use descriptive names that indicate content

## Code Organization

### File Structure
```
src/
├── api/           # REST API endpoints and server
├── models/        # Data models and interfaces
├── services/      # Business logic services
├── utils/         # Utility functions and helpers
└── index.ts       # Application entry point
```

### Import Organization
Order imports in the following sequence:
1. Node.js built-in modules
2. Third-party packages
3. Internal modules (relative imports)

```typescript
// Good
import { randomUUID } from 'crypto';
import Docker from 'dockerode';
import express from 'express';

import { Container } from '../models/Container.js';
import { Logger } from '../utils/Logger.js';
import { ConfigManager } from './ConfigManager.js';
```

### Export Patterns
- Use named exports for most cases
- Use default exports sparingly (mainly for main classes)
- Export interfaces and types that are used externally

```typescript
// Good
export class ContainerManager {
  // ...
}

export interface ContainerCreateRequest {
  // ...
}

// Avoid default exports unless it's the main class of the module
export default class ContainerManager {
  // ...
}
```

## Function and Method Standards

### Function Signatures
- Use explicit return types for public methods
- Use async/await instead of Promises directly
- Keep parameter lists short (max 3-4 parameters)

```typescript
// Good
async createContainer(request: ContainerCreateRequest): Promise<Container> {
  // ...
}

// Avoid
createContainer(image, env, ports, options, callback) {
  // ...
}
```

### Error Handling
- Use custom error classes for domain-specific errors
- Include error codes for programmatic handling
- Provide meaningful error messages

```typescript
// Good
export class ContainerManagerError extends Error {
  constructor(message: string, public code: string, public cause?: Error) {
    super(message);
    this.name = 'ContainerManagerError';
  }
}

// Usage
throw new ContainerManagerError(
  'Failed to create container: Docker daemon unavailable',
  'DOCKER_DAEMON_UNAVAILABLE',
  originalError
);
```

### Async/Await Patterns
- Always use try/catch with async functions
- Handle errors appropriately at each level
- Use Promise.all for concurrent operations

```typescript
// Good
async createContainer(request: ContainerCreateRequest): Promise<Container> {
  try {
    const dockerContainer = await this.docker.createContainer(config);
    await dockerContainer.start();
    return this.buildContainerObject(dockerContainer);
  } catch (error) {
    throw new ContainerManagerError(
      `Failed to create container: ${error.message}`,
      'CONTAINER_CREATE_FAILED',
      error
    );
  }
}
```

## Class Design Standards

### Class Structure
Organize class members in this order:
1. Static properties
2. Instance properties
3. Constructor
4. Static methods
5. Public methods
6. Private methods

```typescript
export class ContainerManager {
  // Static properties
  private static instance: ContainerManager;
  
  // Instance properties
  private docker: Docker;
  private containers: Map<string, Container> = new Map();
  private logger: Logger;
  
  // Constructor
  constructor(configManager?: ConfigManager) {
    // ...
  }
  
  // Static methods
  static getInstance(): ContainerManager {
    // ...
  }
  
  // Public methods
  async createContainer(request: ContainerCreateRequest): Promise<Container> {
    // ...
  }
  
  // Private methods
  private generateUniqueId(): string {
    // ...
  }
}
```

### Access Modifiers
- Use `private` for internal implementation details
- Use `protected` for inheritance scenarios
- Use `public` explicitly for public APIs (optional but recommended)

```typescript
export class ContainerManager {
  private containers: Map<string, Container> = new Map();
  protected config: SystemConfig;
  public readonly version: string = '1.0.0';
}
```

### Method Documentation
Use JSDoc comments for public methods:

```typescript
/**
 * Create a new container with unique ID and port allocation
 * @param request Container creation request with image and environment
 * @returns Promise resolving to created container information
 * @throws ContainerManagerError when creation fails
 */
async createContainer(request: ContainerCreateRequest): Promise<Container> {
  // ...
}
```

## Error Handling Standards

### Error Types
- Use specific error classes for different error categories
- Include error codes for programmatic handling
- Chain errors to preserve context

```typescript
// Domain-specific errors
export class ContainerManagerError extends Error {
  constructor(message: string, public code: string, public cause?: Error) {
    super(message);
    this.name = 'ContainerManagerError';
  }
}

// Usage with error chaining
try {
  await dockerContainer.start();
} catch (error) {
  throw new ContainerManagerError(
    'Failed to start container',
    'CONTAINER_START_FAILED',
    error
  );
}
```

### Error Codes
Use consistent error code naming:
- `RESOURCE_NOT_FOUND` - Resource doesn't exist
- `RESOURCE_ALREADY_EXISTS` - Resource already exists
- `INVALID_REQUEST` - Request validation failed
- `SERVICE_UNAVAILABLE` - External service unavailable
- `OPERATION_FAILED` - General operation failure

### Logging Errors
- Log errors with appropriate context
- Include relevant metadata
- Use structured logging

```typescript
this.logger.error(
  'ContainerManager',
  'Failed to create container',
  error,
  {
    containerId,
    image: request.image,
    port: allocatedPort
  }
);
```

## Testing Standards

### Test Organization
- Mirror source directory structure in tests
- Use descriptive test names
- Group related tests in describe blocks

```typescript
describe('ContainerManager', () => {
  describe('createContainer', () => {
    it('should create container with valid request', async () => {
      // ...
    });
    
    it('should throw error when Docker is unavailable', async () => {
      // ...
    });
  });
});
```

### Test Naming
- Use "should" statements for test descriptions
- Be specific about the scenario being tested
- Include expected behavior

```typescript
// Good
it('should allocate unique port for each container', async () => {
  // ...
});

it('should throw ContainerManagerError when port range is exhausted', async () => {
  // ...
});

// Avoid
it('creates container', async () => {
  // ...
});

it('port allocation', async () => {
  // ...
});
```

### Mocking
- Mock external dependencies
- Use type-safe mocks
- Reset mocks between tests

```typescript
import { vi } from 'vitest';

const mockDocker = {
  createContainer: vi.fn(),
  getContainer: vi.fn()
};

beforeEach(() => {
  vi.clearAllMocks();
});
```

## Linting and Formatting

### ESLint Configuration
The project uses ESLint with TypeScript support. Key rules:

```javascript
// .eslintrc.js
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  }
};
```

### Code Formatting
- Use 2 spaces for indentation
- Use single quotes for strings
- Include trailing commas in multiline structures
- Use semicolons consistently

```typescript
// Good
const config = {
  docker: {
    socketPath: '/var/run/docker.sock',
    defaultImage: 'nginx:alpine',
  },
  api: {
    port: 3000,
    host: 'localhost',
  },
};

// Avoid
const config = {
    docker: {
        socketPath: "/var/run/docker.sock",
        defaultImage: "nginx:alpine"
    },
    api: {
        port: 3000,
        host: "localhost"
    }
}
```

### Running Linting
```bash
# Check for linting issues
npm run lint

# Auto-fix linting issues where possible
npm run lint -- --fix
```

## Documentation Standards

### Code Comments
- Use comments to explain "why", not "what"
- Keep comments up to date with code changes
- Use JSDoc for public APIs

```typescript
// Good
// Retry container creation to handle transient Docker daemon issues
const container = await this.retryOperation(() => 
  this.docker.createContainer(config)
);

// Avoid
// Create container
const container = await this.docker.createContainer(config);
```

### JSDoc Comments
Use JSDoc for public methods and classes:

```typescript
/**
 * Manages Docker container lifecycle operations
 * 
 * Provides methods for creating, monitoring, and cleaning up
 * Docker containers with automatic port allocation and
 * activity tracking.
 */
export class ContainerManager {
  /**
   * Create a new container with automatic port allocation
   * 
   * @param request - Container creation parameters
   * @returns Promise resolving to container information
   * @throws {ContainerManagerError} When container creation fails
   * 
   * @example
   * ```typescript
   * const container = await manager.createContainer({
   *   image: 'nginx:alpine',
   *   environment: { PORT: '80' }
   * });
   * ```
   */
  async createContainer(request: ContainerCreateRequest): Promise<Container> {
    // ...
  }
}
```

## Performance Guidelines

### Memory Management
- Clean up resources properly
- Use WeakMap/WeakSet for object references
- Avoid memory leaks in event listeners

```typescript
// Good
class ContainerManager {
  private containers = new Map<string, Container>();
  
  removeContainer(id: string): void {
    const container = this.containers.get(id);
    if (container) {
      // Clean up resources
      this.containers.delete(id);
      this.usedPorts.delete(container.connection.port);
    }
  }
}
```

### Async Operations
- Use Promise.all for concurrent operations
- Implement proper timeout handling
- Use streaming for large data sets

```typescript
// Good - Concurrent operations
const [containerInfo, dockerInfo] = await Promise.all([
  this.getContainerInfo(id),
  this.docker.info()
]);

// Good - Timeout handling
const container = await Promise.race([
  this.docker.createContainer(config),
  this.createTimeout(30000)
]);
```

## Security Guidelines

### Input Validation
- Validate all external inputs
- Sanitize data before processing
- Use type checking for runtime validation

```typescript
private validateCreateContainerRequest(body: any): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a valid JSON object';
  }
  
  if (body.image !== undefined) {
    if (typeof body.image !== 'string' || body.image.trim() === '') {
      return 'Image must be a non-empty string if provided';
    }
  }
  
  return null;
}
```

### Environment Variables
- Use environment variables for configuration
- Provide sensible defaults
- Validate configuration on startup

```typescript
// Good
const config = {
  docker: {
    socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
    defaultImage: process.env.DOCKER_DEFAULT_IMAGE || 'nginx:alpine'
  }
};
```

## Tools and Automation

### Development Scripts
```bash
# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Linting
npm run lint
npm run lint -- --fix

# Clean build artifacts
npm run clean
```

### Pre-commit Hooks
Consider setting up pre-commit hooks to:
- Run linting
- Run tests
- Check TypeScript compilation
- Validate commit messages

### IDE Configuration
Recommended VS Code settings:
```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.suggest.autoImports": true
}
```

## Conclusion

Following these coding standards helps maintain a consistent, readable, and maintainable codebase. When in doubt:

1. Prioritize readability over cleverness
2. Follow existing patterns in the codebase
3. Write tests for new functionality
4. Document public APIs
5. Ask for code review feedback

For questions about these standards or suggestions for improvements, please create an issue or discuss in pull requests.