---
title: "API Extension Guide"
description: "Comprehensive guide for extending the Ephemeral API with new endpoints, middleware, and functionality"
audience: ["developers", "api-developers"]
last_updated: "2025-01-23"
version: "1.0.0"
related_docs:
  - "../api/endpoints.md"
  - "../development/coding-standards.md"
  - "../development/testing.md"
---

# API Extension Guide

This guide provides comprehensive instructions for extending the Ephemeral API with new endpoints, middleware, validation patterns, and error handling. It covers best practices for maintaining consistency and reliability across the API surface.

## API Architecture Overview

The Ephemeral API is built using Express.js with a structured approach to:

- **Route Organization**: Logical grouping of related endpoints
- **Middleware Pipeline**: Request processing, validation, and error handling
- **Response Formatting**: Consistent JSON response structure
- **Error Handling**: Centralized error processing with proper HTTP status codes
- **Validation**: Input validation with detailed error messages

### Core API Structure

```
src/api/
├── server.ts          # Main API server with core endpoints
├── middleware/        # Custom middleware (future expansion)
├── routes/           # Route handlers (future expansion)
├── validators/       # Input validation logic (future expansion)
└── index.ts          # API exports
```

## Response Format Standards

All API responses follow a consistent structure:

### Success Response

```typescript
interface ApiResponse<T = any> {
  success: true;
  data: T;
}
```

### Error Response

```typescript
interface ApiResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
  };
}
```

### Example Responses

```json
// Success Response
{
  "success": true,
  "data": {
    "id": "container-123",
    "status": "running",
    "connection": {
      "host": "localhost",
      "port": 8001,
      "url": "http://localhost:8001"
    }
  }
}

// Error Response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": {
      "field": "image",
      "reason": "Image name cannot be empty"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

## Adding New Endpoints

### Step 1: Define the Endpoint Requirements

Before implementing, define:

1. **HTTP Method**: GET, POST, PUT, DELETE, PATCH
2. **URL Pattern**: `/api/resource` or `/api/resource/:id`
3. **Request Format**: Query parameters, path parameters, request body
4. **Response Format**: Success and error response structures
5. **Validation Rules**: Input validation requirements
6. **Error Scenarios**: Possible failure cases and appropriate HTTP status codes

### Step 2: Implement the Route Handler

Add your route handler to the `ApiServer` class in `src/api/server.ts`:

```typescript
// Add to setupRoutes() method
private setupRoutes(): void {
  // Existing routes...
  
  // Your new endpoint
  this.app.get('/api/my-resource', this.handleGetMyResource.bind(this));
  this.app.post('/api/my-resource', this.handleCreateMyResource.bind(this));
  this.app.get('/api/my-resource/:id', this.handleGetMyResourceById.bind(this));
  this.app.put('/api/my-resource/:id', this.handleUpdateMyResource.bind(this));
  this.app.delete('/api/my-resource/:id', this.handleDeleteMyResource.bind(this));
}
```

### Step 3: Implement Handler Methods

```typescript
/**
 * Handle GET /api/my-resource - List all resources
 */
private async handleGetMyResource(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract query parameters
    const { page = 1, limit = 10, status } = req.query;
    
    // Validate query parameters
    const validationError = this.validateListResourceQuery(req.query);
    if (validationError) {
      const error = new Error(validationError);
      error.name = 'ValidationError';
      throw error;
    }

    // Call service layer
    const resources = await this.myService.listResources({
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      status: status as string
    });

    // Format response
    const response = resources.map(resource => ({
      id: resource.id,
      name: resource.name,
      status: resource.status,
      created_at: resource.createdAt.toISOString(),
      updated_at: resource.updatedAt.toISOString()
    }));

    this.sendSuccessResponse(res, response);

  } catch (error) {
    next(error);
  }
}

/**
 * Handle POST /api/my-resource - Create new resource
 */
private async handleCreateMyResource(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Validate request body
    const validationError = this.validateCreateResourceRequest(req.body);
    if (validationError) {
      const error = new Error(validationError);
      error.name = 'ValidationError';
      throw error;
    }

    // Extract request data
    const { name, configuration, options } = req.body;

    // Call service layer
    const resource = await this.myService.createResource({
      name,
      configuration,
      options
    });

    // Format response
    const response = {
      id: resource.id,
      name: resource.name,
      status: resource.status,
      created_at: resource.createdAt.toISOString(),
      configuration: resource.configuration
    };

    this.sendSuccessResponse(res, response, 201);

  } catch (error) {
    next(error);
  }
}

/**
 * Handle GET /api/my-resource/:id - Get specific resource
 */
private async handleGetMyResourceById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const resourceId = req.params.id;

    // Validate resource ID
    if (!resourceId || typeof resourceId !== 'string' || resourceId.trim() === '') {
      const error = new Error('Resource ID is required and must be a non-empty string');
      error.name = 'ValidationError';
      throw error;
    }

    // Call service layer
    const resource = await this.myService.getResource(resourceId);

    if (!resource) {
      const error = ErrorHandler.createError(
        `Resource with ID ${resourceId} not found`,
        'RESOURCE_NOT_FOUND'
      );
      error.name = 'MyServiceError';
      throw error;
    }

    // Format response
    const response = {
      id: resource.id,
      name: resource.name,
      status: resource.status,
      created_at: resource.createdAt.toISOString(),
      updated_at: resource.updatedAt.toISOString(),
      configuration: resource.configuration,
      metadata: resource.metadata
    };

    this.sendSuccessResponse(res, response);

  } catch (error) {
    next(error);
  }
}

/**
 * Handle PUT /api/my-resource/:id - Update resource
 */
private async handleUpdateMyResource(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const resourceId = req.params.id;

    // Validate resource ID
    if (!resourceId || typeof resourceId !== 'string' || resourceId.trim() === '') {
      const error = new Error('Resource ID is required and must be a non-empty string');
      error.name = 'ValidationError';
      throw error;
    }

    // Validate request body
    const validationError = this.validateUpdateResourceRequest(req.body);
    if (validationError) {
      const error = new Error(validationError);
      error.name = 'ValidationError';
      throw error;
    }

    // Check if resource exists
    const existingResource = await this.myService.getResource(resourceId);
    if (!existingResource) {
      const error = ErrorHandler.createError(
        `Resource with ID ${resourceId} not found`,
        'RESOURCE_NOT_FOUND'
      );
      error.name = 'MyServiceError';
      throw error;
    }

    // Update resource
    const updatedResource = await this.myService.updateResource(resourceId, req.body);

    // Format response
    const response = {
      id: updatedResource.id,
      name: updatedResource.name,
      status: updatedResource.status,
      updated_at: updatedResource.updatedAt.toISOString(),
      configuration: updatedResource.configuration
    };

    this.sendSuccessResponse(res, response);

  } catch (error) {
    next(error);
  }
}

/**
 * Handle DELETE /api/my-resource/:id - Delete resource
 */
private async handleDeleteMyResource(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const resourceId = req.params.id;

    // Validate resource ID
    if (!resourceId || typeof resourceId !== 'string' || resourceId.trim() === '') {
      const error = new Error('Resource ID is required and must be a non-empty string');
      error.name = 'ValidationError';
      throw error;
    }

    // Check if resource exists
    const resource = await this.myService.getResource(resourceId);
    if (!resource) {
      const error = ErrorHandler.createError(
        `Resource with ID ${resourceId} not found`,
        'RESOURCE_NOT_FOUND'
      );
      error.name = 'MyServiceError';
      throw error;
    }

    // Delete resource
    await this.myService.deleteResource(resourceId);

    // Format response
    const response = {
      id: resourceId,
      message: 'Resource deleted successfully',
      timestamp: new Date().toISOString()
    };

    this.sendSuccessResponse(res, response);

  } catch (error) {
    next(error);
  }
}
```

## Input Validation Patterns

### Request Body Validation

```typescript
/**
 * Validate resource creation request
 */
private validateCreateResourceRequest(body: any): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a valid JSON object';
  }

  // Required fields
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return 'Name is required and must be a non-empty string';
  }

  // Optional fields with validation
  if (body.configuration !== undefined) {
    if (typeof body.configuration !== 'object' || Array.isArray(body.configuration)) {
      return 'Configuration must be an object if provided';
    }

    // Validate configuration properties
    if (body.configuration.timeout !== undefined) {
      if (!Number.isInteger(body.configuration.timeout) || body.configuration.timeout <= 0) {
        return 'Configuration timeout must be a positive integer';
      }
    }
  }

  // Array validation
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      return 'Tags must be an array if provided';
    }

    for (const tag of body.tags) {
      if (typeof tag !== 'string' || tag.trim() === '') {
        return 'All tags must be non-empty strings';
      }
    }
  }

  // Enum validation
  if (body.priority !== undefined) {
    const validPriorities = ['low', 'medium', 'high'];
    if (!validPriorities.includes(body.priority)) {
      return `Priority must be one of: ${validPriorities.join(', ')}`;
    }
  }

  return null;
}

/**
 * Validate query parameters for listing resources
 */
private validateListResourceQuery(query: any): string | null {
  // Pagination validation
  if (query.page !== undefined) {
    const page = parseInt(query.page);
    if (isNaN(page) || page < 1) {
      return 'Page must be a positive integer';
    }
  }

  if (query.limit !== undefined) {
    const limit = parseInt(query.limit);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return 'Limit must be an integer between 1 and 100';
    }
  }

  // Status filter validation
  if (query.status !== undefined) {
    const validStatuses = ['active', 'inactive', 'pending'];
    if (!validStatuses.includes(query.status)) {
      return `Status must be one of: ${validStatuses.join(', ')}`;
    }
  }

  return null;
}
```

### Path Parameter Validation

```typescript
/**
 * Validate and sanitize resource ID from path parameters
 */
private validateResourceId(id: string): { valid: boolean; error?: string; sanitized?: string } {
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'Resource ID is required' };
  }

  const trimmed = id.trim();
  if (trimmed === '') {
    return { valid: false, error: 'Resource ID cannot be empty' };
  }

  // Validate ID format (example: alphanumeric with hyphens)
  const idPattern = /^[a-zA-Z0-9-_]+$/;
  if (!idPattern.test(trimmed)) {
    return { valid: false, error: 'Resource ID contains invalid characters' };
  }

  // Length validation
  if (trimmed.length < 3 || trimmed.length > 50) {
    return { valid: false, error: 'Resource ID must be between 3 and 50 characters' };
  }

  return { valid: true, sanitized: trimmed };
}
```

## Error Handling Patterns

### Custom Error Types

```typescript
// Define service-specific error types
export class MyServiceError extends Error {
  constructor(message: string, public code: string, public cause?: Error) {
    super(message);
    this.name = 'MyServiceError';
  }
}

// Error codes for your service
export const MyServiceErrorCodes = {
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  INVALID_CONFIGURATION: 'INVALID_CONFIGURATION',
  OPERATION_FAILED: 'OPERATION_FAILED',
  RESOURCE_LIMIT_EXCEEDED: 'RESOURCE_LIMIT_EXCEEDED'
} as const;
```

### Error Mapping in Middleware

Extend the error handling middleware in `ApiServer` to handle your custom errors:

```typescript
/**
 * Enhanced error handling middleware with custom error support
 */
private errorHandlingMiddleware(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // ... existing error handling code

  // Handle custom service errors
  if (error instanceof Error) {
    switch (error.name) {
      case 'MyServiceError':
        const myServiceError = error as MyServiceError;
        responseCode = myServiceError.code;
        responseMessage = myServiceError.message;

        // Map service error codes to HTTP status codes
        switch (myServiceError.code) {
          case 'RESOURCE_NOT_FOUND':
            statusCode = 404;
            break;
          case 'RESOURCE_ALREADY_EXISTS':
            statusCode = 409;
            break;
          case 'INVALID_CONFIGURATION':
            statusCode = 400;
            break;
          case 'RESOURCE_LIMIT_EXCEEDED':
            statusCode = 429;
            break;
          default:
            statusCode = 500;
        }
        break;

      // ... handle other error types
    }
  }

  // ... rest of error handling
}
```

## Middleware Development

### Custom Middleware Pattern

```typescript
// Create middleware in src/api/middleware/
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

/**
 * Authentication middleware
 */
export function authenticationMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication token is required',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    const token = authHeader.substring(7);
    
    // Validate token (implement your token validation logic)
    const user = validateToken(token);
    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired authentication token',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    req.user = user;
    next();

  } catch (error) {
    next(error);
  }
}

/**
 * Authorization middleware
 */
export function authorizationMiddleware(requiredRole: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication is required',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    if (req.user.role !== requiredRole) {
      res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Role '${requiredRole}' is required`,
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    next();
  };
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(maxRequests: number, windowMs: number) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    
    const clientData = requests.get(clientId);
    
    if (!clientData || now > clientData.resetTime) {
      requests.set(clientId, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (clientData.count >= maxRequests) {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
          details: {
            limit: maxRequests,
            windowMs,
            resetTime: new Date(clientData.resetTime).toISOString()
          },
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    clientData.count++;
    next();
  };
}
```

### Applying Middleware to Routes

```typescript
// In ApiServer setupRoutes method
private setupRoutes(): void {
  // Apply middleware to specific routes
  this.app.use('/api/admin/*', authenticationMiddleware);
  this.app.use('/api/admin/*', authorizationMiddleware('admin'));
  
  // Apply rate limiting to all API routes
  this.app.use('/api/*', rateLimitMiddleware(100, 60000)); // 100 requests per minute

  // Protected routes
  this.app.get('/api/admin/users', this.handleGetUsers.bind(this));
  this.app.post('/api/admin/users', this.handleCreateUser.bind(this));

  // Public routes (no authentication required)
  this.app.get('/health', this.handleHealthCheck.bind(this));
  this.app.get('/api/public/status', this.handlePublicStatus.bind(this));
}
```

## Testing API Extensions

### Unit Testing Route Handlers

```typescript
// tests/unit/api/my-resource.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { ApiServer } from '../../../src/api/server.js';
import { MyService } from '../../../src/services/MyService.js';

describe('MyResource API', () => {
  let apiServer: ApiServer;
  let mockMyService: MyService;

  beforeEach(() => {
    // Mock service
    mockMyService = {
      listResources: vi.fn(),
      createResource: vi.fn(),
      getResource: vi.fn(),
      updateResource: vi.fn(),
      deleteResource: vi.fn()
    } as any;

    // Create API server with mocked dependencies
    apiServer = new ApiServer(mockContainerManager, mockActivityMonitor, mockConfigManager);
    (apiServer as any).myService = mockMyService;
  });

  describe('GET /api/my-resource', () => {
    it('should list resources successfully', async () => {
      const mockResources = [
        { id: '1', name: 'Resource 1', status: 'active', createdAt: new Date(), updatedAt: new Date() }
      ];
      mockMyService.listResources = vi.fn().mockResolvedValue(mockResources);

      const response = await request(apiServer.getApp())
        .get('/api/my-resource')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe('1');
    });

    it('should validate query parameters', async () => {
      const response = await request(apiServer.getApp())
        .get('/api/my-resource?page=0')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/my-resource', () => {
    it('should create resource successfully', async () => {
      const mockResource = {
        id: '1',
        name: 'New Resource',
        status: 'active',
        createdAt: new Date(),
        configuration: {}
      };
      mockMyService.createResource = vi.fn().mockResolvedValue(mockResource);

      const response = await request(apiServer.getApp())
        .post('/api/my-resource')
        .send({ name: 'New Resource', configuration: {} })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('New Resource');
    });

    it('should validate required fields', async () => {
      const response = await request(apiServer.getApp())
        .post('/api/my-resource')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Name is required');
    });
  });
});
```

### Integration Testing

```typescript
// tests/integration/api/my-resource.integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { DockerOnDemandApp } from '../../../src/index.js';

describe('MyResource API Integration', () => {
  let app: DockerOnDemandApp;

  beforeEach(async () => {
    app = new DockerOnDemandApp();
    await app.initialize();
    await app.start();
  });

  afterEach(async () => {
    await app.shutdown();
  });

  it('should handle complete resource lifecycle', async () => {
    // Create resource
    const createResponse = await request(app.getApiServer().getApp())
      .post('/api/my-resource')
      .send({ name: 'Test Resource' })
      .expect(201);

    const resourceId = createResponse.body.data.id;

    // Get resource
    const getResponse = await request(app.getApiServer().getApp())
      .get(`/api/my-resource/${resourceId}`)
      .expect(200);

    expect(getResponse.body.data.name).toBe('Test Resource');

    // Update resource
    const updateResponse = await request(app.getApiServer().getApp())
      .put(`/api/my-resource/${resourceId}`)
      .send({ name: 'Updated Resource' })
      .expect(200);

    expect(updateResponse.body.data.name).toBe('Updated Resource');

    // Delete resource
    await request(app.getApiServer().getApp())
      .delete(`/api/my-resource/${resourceId}`)
      .expect(200);

    // Verify deletion
    await request(app.getApiServer().getApp())
      .get(`/api/my-resource/${resourceId}`)
      .expect(404);
  });
});
```

## API Documentation Patterns

### OpenAPI/Swagger Documentation

```typescript
// Add to your endpoint handler comments
/**
 * @swagger
 * /api/my-resource:
 *   get:
 *     summary: List all resources
 *     tags: [Resources]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, pending]
 *         description: Filter by resource status
 *     responses:
 *       200:
 *         description: List of resources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Resource'
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
```

## Best Practices

### Security

1. **Input Sanitization**: Always sanitize and validate input data
2. **SQL Injection Prevention**: Use parameterized queries
3. **XSS Prevention**: Escape output data appropriately
4. **Rate Limiting**: Implement rate limiting for all endpoints
5. **Authentication**: Secure sensitive endpoints with proper authentication
6. **HTTPS**: Always use HTTPS in production

### Performance

1. **Pagination**: Implement pagination for list endpoints
2. **Caching**: Cache frequently accessed data
3. **Database Optimization**: Use efficient database queries
4. **Response Compression**: Enable gzip compression
5. **Connection Pooling**: Use connection pooling for database connections

### Monitoring

1. **Request Logging**: Log all API requests with relevant context
2. **Error Tracking**: Track and monitor API errors
3. **Performance Metrics**: Monitor response times and throughput
4. **Health Checks**: Implement comprehensive health check endpoints

### Documentation

1. **API Documentation**: Maintain up-to-date API documentation
2. **Code Comments**: Document complex business logic
3. **Error Codes**: Document all error codes and their meanings
4. **Examples**: Provide request/response examples

This guide provides a comprehensive foundation for extending the Ephemeral API while maintaining consistency, reliability, and best practices across all endpoints.