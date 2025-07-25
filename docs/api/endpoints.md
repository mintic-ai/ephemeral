---
title: "API Endpoints Reference"
description: "Complete documentation of all API endpoints with request/response schemas"
audience: ["developers", "api-consumers"]
last_updated: "2025-01-25"
version: "1.0.0"
related_docs:
  - "README.md"
  - "errors.md"
  - "examples/"
---

# API Endpoints Reference

This document provides complete documentation for all available API endpoints, including request/response schemas, parameters, and status codes.

## Base URL

```
http://localhost:3000
```

## Endpoints Overview

| Method | Endpoint           | Description            |
| ------ | ------------------ | ---------------------- |
| GET    | `/health`          | System health check    |
| POST   | `/containers`      | Create a new container |
| GET    | `/containers`      | List all containers    |
| GET    | `/containers/{id}` | Get container details  |
| DELETE | `/containers/{id}` | Delete a container     |

---

## Health Check

### GET /health

Check the system health and get status information.

#### Request

No parameters required.

#### Response

**Status Code:** `200 OK`

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-01-23T10:30:00.000Z",
    "version": "1.0.0",
    "containers": {
      "active": 3,
      "total": 3
    },
    "docker": {
      "version": "24.0.7",
      "containers": 5,
      "images": 12
    },
    "system": {
      "uptime": 3600.5,
      "memory": {
        "rss": 45678592,
        "heapTotal": 20971520,
        "heapUsed": 15728640,
        "external": 1048576,
        "arrayBuffers": 524288
      }
    }
  }
}
```

#### Response Fields

| Field               | Type   | Description                                       |
| ------------------- | ------ | ------------------------------------------------- |
| `status`            | string | System status ("healthy" or "unhealthy")          |
| `timestamp`         | string | ISO 8601 timestamp of the health check            |
| `version`           | string | API version                                       |
| `containers.active` | number | Number of active containers managed by the system |
| `containers.total`  | number | Total number of containers                        |
| `docker.version`    | string | Docker daemon version                             |
| `docker.containers` | number | Total containers on Docker daemon                 |
| `docker.images`     | number | Total images on Docker daemon                     |
| `system.uptime`     | number | Process uptime in seconds                         |
| `system.memory`     | object | Node.js memory usage statistics                   |

#### Error Responses

| Status Code | Error Code            | Description                     |
| ----------- | --------------------- | ------------------------------- |
| 503         | `SERVICE_UNAVAILABLE` | Docker daemon is not accessible |

---

## Container Management

### POST /containers

Create a new container with the specified configuration.

#### Request

**Content-Type:** `application/json`

```json
{
  "image": "nginx:alpine",
  "environment": {
    "ENV_VAR": "value",
    "ANOTHER_VAR": "another_value"
  },
  "ports": [80, 443],
  "cleanupStrategy": {
    "type": "hybrid",
    "maxLifetime": 3600,
    "activityTimeout": 300,
    "activityThresholds": {
      "minCpuPercent": 5.0,
      "minMemoryMB": 50,
      "minNetworkBytesPerSec": 1024
    }
  }
}
```

#### Request Fields

| Field                                              | Type   | Required | Description                                                      |
| -------------------------------------------------- | ------ | -------- | ---------------------------------------------------------------- |
| `image`                                            | string | No       | Docker image to use (defaults to system default if not provided) |
| `environment`                                      | object | No       | Environment variables as key-value pairs                         |
| `ports`                                            | array  | No       | Array of port numbers to expose (currently not implemented)      |
| `cleanupStrategy`                                  | object | No       | Container cleanup strategy configuration                          |
| `cleanupStrategy.type`                             | string | No       | Cleanup strategy type: "activity", "lifetime", or "hybrid"       |
| `cleanupStrategy.maxLifetime`                      | number | No       | Maximum container lifetime in seconds (for lifetime/hybrid)      |
| `cleanupStrategy.activityTimeout`                  | number | No       | Inactivity timeout in seconds (for activity/hybrid)             |
| `cleanupStrategy.activityThresholds`               | object | No       | Custom activity detection thresholds                             |
| `cleanupStrategy.activityThresholds.minCpuPercent` | number | No       | Minimum CPU usage percentage to consider active (0-100)         |
| `cleanupStrategy.activityThresholds.minMemoryMB`   | number | No       | Minimum memory usage in MB to consider active                   |
| `cleanupStrategy.activityThresholds.minNetworkBytesPerSec` | number | No | Minimum network I/O bytes/sec to consider active               |

#### Response

**Status Code:** `201 Created`

```json
{
  "success": true,
  "data": {
    "id": "container_1706012345678_abc123",
    "status": "running",
    "connection": {
      "host": "localhost",
      "port": 8080,
      "url": "http://localhost:8080"
    },
    "created_at": "2025-01-23T10:30:00.000Z",
    "last_activity": "2025-01-23T10:30:00.000Z",
    "image": "nginx:alpine",
    "environment": {
      "ENV_VAR": "value",
      "ANOTHER_VAR": "another_value"
    },
    "cleanup_strategy": {
      "type": "hybrid",
      "max_lifetime": 3600,
      "activity_timeout": 300,
      "activity_thresholds": {
        "min_cpu_percent": 5.0,
        "min_memory_mb": 50,
        "min_network_bytes_per_sec": 1024
      }
    }
  }
}
```

#### Response Fields

| Field                                                    | Type   | Description                                                              |
| -------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| `id`                                                     | string | Unique container identifier                                              |
| `status`                                                 | string | Container status ("creating", "running", "stopping", "stopped", "error") |
| `connection.host`                                        | string | Host where container is accessible                                       |
| `connection.port`                                        | number | Port where container is accessible                                       |
| `connection.url`                                         | string | Full URL to access the container                                         |
| `created_at`                                             | string | ISO 8601 timestamp when container was created                            |
| `last_activity`                                          | string | ISO 8601 timestamp of last activity                                      |
| `image`                                                  | string | Docker image used                                                        |
| `environment`                                            | object | Environment variables set in the container                               |
| `cleanup_strategy`                                       | object | Container cleanup strategy configuration                                  |
| `cleanup_strategy.type`                                  | string | Cleanup strategy type ("activity", "lifetime", or "hybrid")             |
| `cleanup_strategy.max_lifetime`                          | number | Maximum container lifetime in seconds (null if not set)                 |
| `cleanup_strategy.activity_timeout`                      | number | Inactivity timeout in seconds (null if not set)                         |
| `cleanup_strategy.activity_thresholds`                   | object | Custom activity detection thresholds (null if not set)                  |
| `cleanup_strategy.activity_thresholds.min_cpu_percent`   | number | Minimum CPU usage percentage to consider active                          |
| `cleanup_strategy.activity_thresholds.min_memory_mb`     | number | Minimum memory usage in MB to consider active                           |
| `cleanup_strategy.activity_thresholds.min_network_bytes_per_sec` | number | Minimum network I/O bytes/sec to consider active                        |

#### Error Responses

| Status Code | Error Code                  | Description                                |
| ----------- | --------------------------- | ------------------------------------------ |
| 400         | `VALIDATION_ERROR`          | Invalid request body or parameters         |
| 503         | `DOCKER_DAEMON_UNAVAILABLE` | Docker daemon is not accessible            |
| 507         | `RESOURCE_EXHAUSTED`        | Insufficient resources to create container |

---

### GET /containers

List all containers managed by the system.

#### Request

No parameters required.

#### Response

**Status Code:** `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": "container_1706012345678_abc123",
      "status": "running",
      "connection": {
        "host": "localhost",
        "port": 8080,
        "url": "http://localhost:8080"
      },
      "created_at": "2025-01-23T10:30:00.000Z",
      "last_activity": "2025-01-23T10:35:00.000Z",
      "image": "nginx:alpine",
      "environment": {
        "ENV_VAR": "value"
      },
      "cleanup_strategy": {
        "type": "activity",
        "max_lifetime": null,
        "activity_timeout": 300,
        "activity_thresholds": null
      }
    },
    {
      "id": "container_1706012345679_def456",
      "status": "running",
      "connection": {
        "host": "localhost",
        "port": 8081,
        "url": "http://localhost:8081"
      },
      "created_at": "2025-01-23T10:32:00.000Z",
      "last_activity": "2025-01-23T10:36:00.000Z",
      "image": "node:18-alpine",
      "environment": {},
      "cleanup_strategy": {
        "type": "lifetime",
        "max_lifetime": 1800,
        "activity_timeout": null,
        "activity_thresholds": null
      }
    }
  ]
}
```

#### Response Fields

Returns an array of container objects with the same fields as the POST /containers response.

#### Error Responses

| Status Code | Error Code            | Description                     |
| ----------- | --------------------- | ------------------------------- |
| 503         | `SERVICE_UNAVAILABLE` | Docker daemon is not accessible |

---

### GET /containers/{id}

Get detailed information about a specific container.

#### Request

**Path Parameters:**

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| `id`      | string | Yes      | Container ID |

#### Response

**Status Code:** `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "container_1706012345678_abc123",
    "status": "running",
    "connection": {
      "host": "localhost",
      "port": 8080,
      "url": "http://localhost:8080"
    },
    "created_at": "2025-01-23T10:30:00.000Z",
    "last_activity": "2025-01-23T10:35:00.000Z",
    "image": "nginx:alpine",
    "environment": {
      "ENV_VAR": "value",
      "ANOTHER_VAR": "another_value"
    },
    "cleanup_strategy": {
      "type": "hybrid",
      "max_lifetime": 3600,
      "activity_timeout": 300,
      "activity_thresholds": {
        "min_cpu_percent": 5.0,
        "min_memory_mb": 50,
        "min_network_bytes_per_sec": 1024
      }
    },
    "metadata": {
      "dockerId": "a1b2c3d4e5f6",
      "networkMode": "bridge",
      "portBindings": {
        "80/tcp": [{ "HostPort": "8080" }]
      }
    }
  }
}
```

#### Response Fields

Same as POST /containers response, plus:

| Field                   | Type   | Description                                                         |
| ----------------------- | ------ | ------------------------------------------------------------------- |
| `metadata`              | object | Additional container metadata including Docker-specific information |
| `metadata.dockerId`     | string | Docker container ID                                                 |
| `metadata.networkMode`  | string | Docker network mode                                                 |
| `metadata.portBindings` | object | Docker port binding configuration                                   |

#### Error Responses

| Status Code | Error Code            | Description                           |
| ----------- | --------------------- | ------------------------------------- |
| 400         | `VALIDATION_ERROR`    | Invalid container ID format           |
| 404         | `CONTAINER_NOT_FOUND` | Container with specified ID not found |
| 503         | `SERVICE_UNAVAILABLE` | Docker daemon is not accessible       |

---

### DELETE /containers/{id}

Delete a specific container and stop monitoring it.

#### Request

**Path Parameters:**

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| `id`      | string | Yes      | Container ID |

#### Response

**Status Code:** `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "container_1706012345678_abc123",
    "message": "Container removed successfully",
    "timestamp": "2025-01-23T10:40:00.000Z"
  }
}
```

#### Response Fields

| Field       | Type   | Description                                   |
| ----------- | ------ | --------------------------------------------- |
| `id`        | string | ID of the deleted container                   |
| `message`   | string | Confirmation message                          |
| `timestamp` | string | ISO 8601 timestamp when container was deleted |

#### Error Responses

| Status Code | Error Code            | Description                           |
| ----------- | --------------------- | ------------------------------------- |
| 400         | `VALIDATION_ERROR`    | Invalid container ID format           |
| 404         | `CONTAINER_NOT_FOUND` | Container with specified ID not found |
| 503         | `SERVICE_UNAVAILABLE` | Docker daemon is not accessible       |

---

## Common Response Headers

All responses include the following headers:

| Header                         | Value                                                           | Description                             |
| ------------------------------ | --------------------------------------------------------------- | --------------------------------------- |
| `Content-Type`                 | `application/json`                                              | Response content type                   |
| `Access-Control-Allow-Origin`  | `*`                                                             | CORS header (development configuration) |
| `Access-Control-Allow-Methods` | `GET, POST, PUT, DELETE, OPTIONS`                               | Allowed HTTP methods                    |
| `Access-Control-Allow-Headers` | `Origin, X-Requested-With, Content-Type, Accept, Authorization` | Allowed request headers                 |

## Request Limits

- **Request Body Size**: Maximum 10MB
- **JSON Parsing**: Strict JSON validation
- **Timeout**: No explicit timeout configured (uses system defaults)

## Status Code Summary

| Status Code | Description                                                 |
| ----------- | ----------------------------------------------------------- |
| 200         | OK - Request successful                                     |
| 201         | Created - Resource created successfully                     |
| 400         | Bad Request - Invalid request format or parameters          |
| 404         | Not Found - Resource or endpoint not found                  |
| 408         | Request Timeout - Request took too long to process          |
| 429         | Too Many Requests - Rate limit exceeded                     |
| 500         | Internal Server Error - Unexpected server error             |
| 503         | Service Unavailable - External service (Docker) unavailable |
| 507         | Insufficient Storage - Not enough resources available       |
