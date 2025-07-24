---
title: "Error Handling Reference"
description: "Complete error code reference, response formats, and troubleshooting guide"
audience: ["developers", "api-consumers"]
last_updated: "2025-01-23"
version: "1.0.0"
related_docs:
  - "README.md"
  - "endpoints.md"
  - "examples/"
---

# Error Handling Reference

This document provides comprehensive information about error handling in the Ephemeral API, including error codes, response formats, common scenarios, and troubleshooting strategies.

## Error Response Format

All API errors follow a consistent JSON response format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error description",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/containers",
      "method": "POST",
      "timestamp": "2025-01-23T10:30:00.000Z"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

### Error Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `false` for error responses |
| `error.code` | string | Machine-readable error code for programmatic handling |
| `error.message` | string | Human-readable error description |
| `error.details` | object | Additional context and debugging information |
| `error.details.requestId` | string | Unique request identifier for tracking and support |
| `error.details.path` | string | API endpoint path where error occurred |
| `error.details.method` | string | HTTP method used in the request |
| `error.timestamp` | string | ISO 8601 timestamp when error occurred |

## HTTP Status Codes

The API uses standard HTTP status codes to indicate the type of error:

| Status Code | Category | Description |
|-------------|----------|-------------|
| 400 | Client Error | Bad request - invalid input or request format |
| 404 | Client Error | Resource not found |
| 408 | Client Error | Request timeout |
| 429 | Client Error | Rate limit exceeded |
| 500 | Server Error | Internal server error |
| 503 | Server Error | Service unavailable (Docker daemon issues) |
| 507 | Server Error | Insufficient storage or resources |

## Error Code Reference

### Client Errors (4xx)

#### VALIDATION_ERROR
- **HTTP Status**: 400 Bad Request
- **Description**: Request validation failed due to invalid input data
- **Common Causes**:
  - Missing required fields
  - Invalid data types
  - Invalid parameter values
  - Malformed request body

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Environment variable keys must be non-empty strings",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/containers",
      "method": "POST"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

#### INVALID_JSON
- **HTTP Status**: 400 Bad Request
- **Description**: Request body contains malformed JSON
- **Common Causes**:
  - Syntax errors in JSON
  - Missing quotes or brackets
  - Trailing commas
  - Invalid escape sequences

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_JSON",
    "message": "Request body contains invalid JSON",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/containers",
      "method": "POST"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

#### ENDPOINT_NOT_FOUND
- **HTTP Status**: 404 Not Found
- **Description**: Requested API endpoint does not exist
- **Common Causes**:
  - Typo in endpoint URL
  - Using wrong HTTP method
  - Accessing deprecated endpoint

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "ENDPOINT_NOT_FOUND",
    "message": "Endpoint GET /invalid-path not found",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/invalid-path",
      "method": "GET"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

#### CONTAINER_NOT_FOUND
- **HTTP Status**: 404 Not Found
- **Description**: Specified container ID does not exist
- **Common Causes**:
  - Container was already deleted
  - Incorrect container ID
  - Container expired due to inactivity

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "CONTAINER_NOT_FOUND",
    "message": "Container with ID container_123_abc not found",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/containers/container_123_abc",
      "method": "GET"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

#### REQUEST_TIMEOUT
- **HTTP Status**: 408 Request Timeout
- **Description**: Request took too long to process
- **Common Causes**:
  - Slow Docker operations
  - Network connectivity issues
  - Resource contention

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "REQUEST_TIMEOUT",
    "message": "Request timed out while processing",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/containers",
      "method": "POST"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

#### RATE_LIMIT_EXCEEDED
- **HTTP Status**: 429 Too Many Requests
- **Description**: Too many requests sent in a given time period
- **Common Causes**:
  - Exceeding API rate limits
  - Automated scripts making too many requests
  - Concurrent request bursts

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded, please slow down requests",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/containers",
      "method": "POST"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

### Server Errors (5xx)

#### UNKNOWN_ERROR
- **HTTP Status**: 500 Internal Server Error
- **Description**: Unexpected server error occurred
- **Common Causes**:
  - Unhandled exceptions
  - Programming errors
  - System-level issues

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "UNKNOWN_ERROR",
    "message": "An unexpected error occurred",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/containers",
      "method": "POST"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

### Docker-Related Errors

#### DOCKER_DAEMON_UNAVAILABLE
- **HTTP Status**: 503 Service Unavailable
- **Description**: Docker daemon is not accessible or not running
- **Common Causes**:
  - Docker daemon not started
  - Docker socket permission issues
  - Docker daemon crashed

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "DOCKER_DAEMON_UNAVAILABLE",
    "message": "Docker daemon is not available",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/containers",
      "method": "POST"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

#### DOCKER_CONNECTION_FAILED
- **HTTP Status**: 503 Service Unavailable
- **Description**: Failed to connect to Docker daemon
- **Common Causes**:
  - Network connectivity issues
  - Docker daemon overloaded
  - Firewall blocking connections

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "DOCKER_CONNECTION_FAILED",
    "message": "Failed to connect to Docker daemon",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/containers",
      "method": "POST"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

#### SERVICE_UNAVAILABLE
- **HTTP Status**: 503 Service Unavailable
- **Description**: Docker service is temporarily unavailable
- **Common Causes**:
  - Docker daemon restarting
  - System maintenance
  - Resource exhaustion

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Docker service is temporarily unavailable",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/containers",
      "method": "POST"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

#### IMAGE_NOT_FOUND
- **HTTP Status**: 404 Not Found
- **Description**: Specified Docker image could not be found
- **Common Causes**:
  - Image name typo
  - Image not available in registry
  - Network issues preventing image pull

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "IMAGE_NOT_FOUND",
    "message": "Docker image 'nonexistent:latest' not found",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/containers",
      "method": "POST"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

### Resource Errors

#### RESOURCE_EXHAUSTED
- **HTTP Status**: 507 Insufficient Storage
- **Description**: Insufficient system resources to complete request
- **Common Causes**:
  - No available ports in configured range
  - Memory exhaustion
  - CPU limits reached

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_EXHAUSTED",
    "message": "No available ports in configured range",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/containers",
      "method": "POST"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

#### PORT_ALLOCATION_FAILED
- **HTTP Status**: 507 Insufficient Storage
- **Description**: Failed to allocate required network ports
- **Common Causes**:
  - All ports in range are in use
  - Port conflicts with existing services
  - Network configuration issues

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "PORT_ALLOCATION_FAILED",
    "message": "Failed to allocate port for container",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/containers",
      "method": "POST"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

#### INSUFFICIENT_STORAGE
- **HTTP Status**: 507 Insufficient Storage
- **Description**: Not enough disk space available
- **Common Causes**:
  - Disk full
  - Docker storage driver issues
  - Temporary space exhaustion

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STORAGE",
    "message": "Insufficient disk space",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/containers",
      "method": "POST"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

### Permission Errors

#### PERMISSION_DENIED
- **HTTP Status**: 403 Forbidden
- **Description**: Insufficient permissions to access Docker
- **Common Causes**:
  - User not in docker group
  - Docker socket permission issues
  - SELinux/AppArmor restrictions

**Example Response**:
```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Insufficient permissions to access Docker",
    "details": {
      "requestId": "req_1706012345678_abc123def",
      "path": "/containers",
      "method": "POST"
    },
    "timestamp": "2025-01-23T10:30:00.000Z"
  }
}
```

## Common Error Scenarios

### Container Creation Failures

**Scenario**: Creating a container with an invalid image name

```bash
curl -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d '{"image": "invalid-image:nonexistent"}'
```

**Response**: 404 with `IMAGE_NOT_FOUND` error code

**Resolution**:
1. Verify the image name and tag are correct
2. Check if the image exists in the registry
3. Try pulling the image manually: `docker pull invalid-image:nonexistent`

---

**Scenario**: Docker daemon not running

```bash
curl -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d '{"image": "nginx:alpine"}'
```

**Response**: 503 with `DOCKER_DAEMON_UNAVAILABLE` error code

**Resolution**:
1. Start Docker daemon: `sudo systemctl start docker`
2. Check Docker status: `docker info`
3. Verify Docker socket permissions

---

**Scenario**: Invalid JSON in request body

```bash
curl -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d '{"image": "nginx:alpine",}'  # Trailing comma
```

**Response**: 400 with `INVALID_JSON` error code

**Resolution**:
1. Validate JSON syntax using a JSON validator
2. Remove trailing commas
3. Ensure proper quote escaping

### Container Access Failures

**Scenario**: Accessing a non-existent container

```bash
curl http://localhost:3000/containers/invalid-id
```

**Response**: 404 with `CONTAINER_NOT_FOUND` error code

**Resolution**:
1. List all containers: `GET /containers`
2. Verify the container ID is correct
3. Check if container was automatically cleaned up due to inactivity

---

**Scenario**: Deleting an already deleted container

```bash
curl -X DELETE http://localhost:3000/containers/deleted-container-id
```

**Response**: 404 with `CONTAINER_NOT_FOUND` error code

**Resolution**:
1. This is expected behavior for already deleted containers
2. No action needed - the container is already removed

## Troubleshooting Guide

### General Troubleshooting Steps

1. **Check the Request ID**: Every error response includes a unique `requestId` in the details. Use this for tracking and support.

2. **Verify API Endpoint**: Ensure you're using the correct endpoint URL and HTTP method.

3. **Validate Request Format**: Check that your request body is valid JSON and includes required fields.

4. **Check System Status**: Use the health endpoint to verify system status:
   ```bash
   curl http://localhost:3000/health
   ```

### Docker-Specific Issues

#### Docker Daemon Issues

**Symptoms**: 503 errors with Docker-related error codes

**Diagnostic Steps**:
1. Check Docker daemon status:
   ```bash
   sudo systemctl status docker
   ```

2. Test Docker connectivity:
   ```bash
   docker info
   ```

3. Check Docker socket permissions:
   ```bash
   ls -la /var/run/docker.sock
   ```

**Solutions**:
- Start Docker daemon: `sudo systemctl start docker`
- Add user to docker group: `sudo usermod -aG docker $USER`
- Restart Docker service: `sudo systemctl restart docker`

#### Resource Exhaustion

**Symptoms**: 507 errors with resource-related error codes

**Diagnostic Steps**:
1. Check available disk space:
   ```bash
   df -h
   ```

2. Check Docker system usage:
   ```bash
   docker system df
   ```

3. Check available ports:
   ```bash
   netstat -tuln | grep :80
   ```

**Solutions**:
- Clean up Docker resources: `docker system prune`
- Free up disk space
- Adjust port range configuration
- Scale down other containers

### Client-Side Error Handling

#### Retry Logic

For transient errors (5xx status codes), implement exponential backoff retry:

```javascript
async function createContainerWithRetry(containerConfig, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('/containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(containerConfig)
      });
      
      if (response.ok) {
        return await response.json();
      }
      
      // Don't retry client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client error: ${response.status}`);
      }
      
      // Retry server errors (5xx) with exponential backoff
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      if (attempt === maxRetries) throw error;
    }
  }
}
```

#### Error Code Handling

Handle specific error codes appropriately:

```javascript
async function handleApiError(response) {
  const errorData = await response.json();
  const errorCode = errorData.error.code;
  
  switch (errorCode) {
    case 'CONTAINER_NOT_FOUND':
      // Container doesn't exist, maybe create a new one
      console.log('Container not found, creating new one...');
      break;
      
    case 'DOCKER_DAEMON_UNAVAILABLE':
      // Show user-friendly message about service unavailability
      alert('Service temporarily unavailable. Please try again later.');
      break;
      
    case 'VALIDATION_ERROR':
      // Show validation errors to user
      displayValidationErrors(errorData.error.message);
      break;
      
    case 'RESOURCE_EXHAUSTED':
      // Suggest trying again later or with different configuration
      console.log('Resources exhausted, trying with smaller configuration...');
      break;
      
    default:
      // Generic error handling
      console.error('API Error:', errorData.error.message);
  }
}
```

## Error Monitoring and Logging

### Request ID Tracking

Every error response includes a unique `requestId` that can be used for:
- Correlating client-side errors with server logs
- Support ticket tracking
- Error rate monitoring
- Debugging specific requests

### Log Analysis

Server-side error logs include:
- Request ID for correlation
- Full error stack traces
- Request context (method, path, body)
- User agent and IP information
- Timing information

### Monitoring Recommendations

1. **Track Error Rates**: Monitor 4xx and 5xx response rates
2. **Alert on Service Errors**: Set up alerts for Docker daemon unavailability
3. **Monitor Resource Usage**: Track resource exhaustion errors
4. **Log Request IDs**: Include request IDs in client-side error reporting

## Best Practices

### For API Consumers

1. **Always Check Response Status**: Don't assume requests succeed
2. **Handle Specific Error Codes**: Implement appropriate responses for different error types
3. **Implement Retry Logic**: Use exponential backoff for transient errors
4. **Log Request IDs**: Include request IDs in error reports for easier debugging
5. **Validate Input**: Validate data client-side to reduce validation errors

### For Error Reporting

1. **Include Request ID**: Always include the request ID when reporting errors
2. **Provide Context**: Include what you were trying to accomplish
3. **Include Request Details**: Method, endpoint, and request body (sanitized)
4. **Check System Status**: Verify the health endpoint before reporting issues

### For Development

1. **Test Error Scenarios**: Include error cases in your test suite
2. **Handle Network Issues**: Account for network timeouts and connectivity issues
3. **Graceful Degradation**: Provide fallback behavior when API is unavailable
4. **User-Friendly Messages**: Convert technical error codes to user-friendly messages