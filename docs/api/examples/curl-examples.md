---
title: "cURL API Examples"
description: "Comprehensive cURL examples for all API endpoints"
audience: ["developers", "api-consumers", "testers"]
last_updated: "2025-01-25"
version: "1.0.0"
related_docs:
  - "../endpoints.md"
  - "javascript-examples.md"
  - "../README.md"
---

# cURL API Examples

This document provides comprehensive cURL examples for all API endpoints. These examples can be used for testing, automation, or as reference for API integration.

## Prerequisites

- Ephemeral system running on `http://localhost:3000`
- cURL installed on your system
- Basic understanding of HTTP methods and JSON

## Base Configuration

All examples use the following base URL:

```bash
BASE_URL="http://localhost:3000"
```

## Health Check

### Basic Health Check

```bash
curl -X GET "${BASE_URL}/health"
```

### Health Check with Pretty JSON Output

```bash
curl -X GET "${BASE_URL}/health" | jq '.'
```

### Health Check with Headers

```bash
curl -X GET "${BASE_URL}/health" \
  -H "Accept: application/json" \
  -H "User-Agent: MyApp/1.0" \
  -v
```

**Expected Response:**
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

---

## Container Management

### Create Container

#### Basic Container Creation

```bash
curl -X POST "${BASE_URL}/containers" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### Create Container with Custom Image

```bash
curl -X POST "${BASE_URL}/containers" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx:alpine"
  }'
```

#### Create Container with Environment Variables

```bash
curl -X POST "${BASE_URL}/containers" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "node:18-alpine",
    "environment": {
      "NODE_ENV": "development",
      "PORT": "3000",
      "DEBUG": "true"
    }
  }'
```

#### Create Container with Full Configuration

```bash
curl -X POST "${BASE_URL}/containers" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx:alpine",
    "environment": {
      "NGINX_HOST": "localhost",
      "NGINX_PORT": "80"
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
  }'
```

#### Create Container with Activity-Based Cleanup

```bash
curl -X POST "${BASE_URL}/containers" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx:alpine",
    "cleanupStrategy": {
      "type": "activity",
      "activityTimeout": 600
    }
  }'
```

#### Create Container with Lifetime-Based Cleanup

```bash
curl -X POST "${BASE_URL}/containers" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx:alpine",
    "cleanupStrategy": {
      "type": "lifetime",
      "maxLifetime": 3600
    }
  }'
```

#### Create Container with Custom Activity Thresholds

```bash
curl -X POST "${BASE_URL}/containers" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx:alpine",
    "cleanupStrategy": {
      "type": "activity",
      "activityTimeout": 300,
      "activityThresholds": {
        "minCpuPercent": 10.0,
        "minMemoryMB": 100,
        "minNetworkBytesPerSec": 2048
      }
    }
  }'
```

#### Create Container and Save Response

```bash
CONTAINER_RESPONSE=$(curl -s -X POST "${BASE_URL}/containers" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx:alpine",
    "environment": {
      "ENV_VAR": "test_value"
    },
    "cleanupStrategy": {
      "type": "hybrid",
      "maxLifetime": 1800,
      "activityTimeout": 300
    }
  }')

echo "$CONTAINER_RESPONSE" | jq '.'

# Extract container ID for later use
CONTAINER_ID=$(echo "$CONTAINER_RESPONSE" | jq -r '.data.id')
echo "Created container: $CONTAINER_ID"

# Extract cleanup strategy information
echo "Cleanup strategy:"
echo "$CONTAINER_RESPONSE" | jq '.data.cleanup_strategy'
```

**Expected Response:**
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
      "ENV_VAR": "test_value"
    },
    "cleanup_strategy": {
      "type": "hybrid",
      "max_lifetime": 1800,
      "activity_timeout": 300,
      "activity_thresholds": null
    }
  }
}
```

### List All Containers

#### Basic Container Listing

```bash
curl -X GET "${BASE_URL}/containers"
```

#### List Containers with Pretty Output

```bash
curl -X GET "${BASE_URL}/containers" | jq '.'
```

#### List Containers and Extract IDs

```bash
curl -s -X GET "${BASE_URL}/containers" | jq -r '.data[].id'
```

#### List Containers with Status Filter (using jq)

```bash
# Get only running containers
curl -s -X GET "${BASE_URL}/containers" | jq '.data[] | select(.status == "running")'

# Get container count by status
curl -s -X GET "${BASE_URL}/containers" | jq '.data | group_by(.status) | map({status: .[0].status, count: length})'
```

**Expected Response:**
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
        "ENV_VAR": "test_value"
      }
    }
  ]
}
```

### Get Specific Container

#### Get Container by ID

```bash
CONTAINER_ID="container_1706012345678_abc123"
curl -X GET "${BASE_URL}/containers/${CONTAINER_ID}"
```

#### Get Container with Error Handling

```bash
CONTAINER_ID="container_1706012345678_abc123"
RESPONSE=$(curl -s -w "%{http_code}" -X GET "${BASE_URL}/containers/${CONTAINER_ID}")
HTTP_CODE="${RESPONSE: -3}"
BODY="${RESPONSE%???}"

if [ "$HTTP_CODE" -eq 200 ]; then
    echo "Container found:"
    echo "$BODY" | jq '.'
else
    echo "Error (HTTP $HTTP_CODE):"
    echo "$BODY" | jq '.'
fi
```

#### Get Container Connection URL

```bash
CONTAINER_ID="container_1706012345678_abc123"
curl -s -X GET "${BASE_URL}/containers/${CONTAINER_ID}" | jq -r '.data.connection.url'
```

**Expected Response:**
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
      "ENV_VAR": "test_value"
    },
    "metadata": {
      "dockerId": "a1b2c3d4e5f6",
      "networkMode": "bridge",
      "portBindings": {
        "80/tcp": [{"HostPort": "8080"}]
      }
    }
  }
}
```

### Delete Container

#### Basic Container Deletion

```bash
CONTAINER_ID="container_1706012345678_abc123"
curl -X DELETE "${BASE_URL}/containers/${CONTAINER_ID}"
```

#### Delete Container with Confirmation

```bash
CONTAINER_ID="container_1706012345678_abc123"
echo "Deleting container: $CONTAINER_ID"
RESPONSE=$(curl -s -X DELETE "${BASE_URL}/containers/${CONTAINER_ID}")
echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.success' > /dev/null; then
    echo "Container deleted successfully"
else
    echo "Failed to delete container"
fi
```

**Expected Response:**
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

---

## Error Handling Examples

### Invalid JSON Request

```bash
curl -X POST "${BASE_URL}/containers" \
  -H "Content-Type: application/json" \
  -d '{"invalid": json}'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_JSON",
    "message": "Request body contains invalid JSON",
    "timestamp": "2025-01-23T10:40:00.000Z"
  }
}
```

### Container Not Found

```bash
curl -X GET "${BASE_URL}/containers/nonexistent_container_id"
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "CONTAINER_NOT_FOUND",
    "message": "Container with ID nonexistent_container_id not found",
    "timestamp": "2025-01-23T10:40:00.000Z"
  }
}
```

### Invalid Endpoint

```bash
curl -X GET "${BASE_URL}/invalid-endpoint"
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "ENDPOINT_NOT_FOUND",
    "message": "Endpoint GET /invalid-endpoint not found",
    "timestamp": "2025-01-23T10:40:00.000Z"
  }
}
```

### Invalid Cleanup Strategy Type

```bash
curl -X POST "${BASE_URL}/containers" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx:alpine",
    "cleanupStrategy": {
      "type": "invalid_type",
      "activityTimeout": 300
    }
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid cleanup strategy: type must be one of: activity, lifetime, hybrid",
    "timestamp": "2025-01-23T10:40:00.000Z"
  }
}
```

### Invalid Activity Timeout

```bash
curl -X POST "${BASE_URL}/containers" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx:alpine",
    "cleanupStrategy": {
      "type": "activity",
      "activityTimeout": -300
    }
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid cleanup strategy: activityTimeout must be a positive number",
    "timestamp": "2025-01-23T10:40:00.000Z"
  }
}
```

### Invalid Activity Thresholds

```bash
curl -X POST "${BASE_URL}/containers" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx:alpine",
    "cleanupStrategy": {
      "type": "activity",
      "activityTimeout": 300,
      "activityThresholds": {
        "minCpuPercent": 150
      }
    }
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid cleanup strategy: activityThresholds.minCpuPercent must be a number between 0 and 100",
    "timestamp": "2025-01-23T10:40:00.000Z"
  }
}
```

---

## Complete Workflow Examples

### Create, Monitor, and Delete Container

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"

echo "=== Ephemeral API Workflow ==="

# 1. Check system health
echo "1. Checking system health..."
curl -s -X GET "${BASE_URL}/health" | jq '.data.status'

# 2. Create a new container
echo "2. Creating new container..."
CONTAINER_RESPONSE=$(curl -s -X POST "${BASE_URL}/containers" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx:alpine",
    "environment": {
      "NGINX_HOST": "localhost"
    }
  }')

CONTAINER_ID=$(echo "$CONTAINER_RESPONSE" | jq -r '.data.id')
CONTAINER_URL=$(echo "$CONTAINER_RESPONSE" | jq -r '.data.connection.url')

echo "Created container: $CONTAINER_ID"
echo "Container URL: $CONTAINER_URL"

# 3. Wait for container to be ready
echo "3. Waiting for container to be ready..."
sleep 5

# 4. Get container details
echo "4. Getting container details..."
curl -s -X GET "${BASE_URL}/containers/${CONTAINER_ID}" | jq '.data | {id, status, connection}'

# 5. Test container connectivity
echo "5. Testing container connectivity..."
if curl -s --max-time 5 "$CONTAINER_URL" > /dev/null; then
    echo "Container is accessible"
else
    echo "Container is not accessible"
fi

# 6. List all containers
echo "6. Listing all containers..."
curl -s -X GET "${BASE_URL}/containers" | jq '.data | length'

# 7. Delete the container
echo "7. Deleting container..."
curl -s -X DELETE "${BASE_URL}/containers/${CONTAINER_ID}" | jq '.data.message'

echo "=== Workflow completed ==="
```

### Batch Container Operations

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"

# Create multiple containers
echo "Creating multiple containers..."
CONTAINER_IDS=()

for i in {1..3}; do
    RESPONSE=$(curl -s -X POST "${BASE_URL}/containers" \
      -H "Content-Type: application/json" \
      -d "{
        \"image\": \"nginx:alpine\",
        \"environment\": {
          \"CONTAINER_NAME\": \"test-container-$i\"
        }
      }")
    
    CONTAINER_ID=$(echo "$RESPONSE" | jq -r '.data.id')
    CONTAINER_IDS+=("$CONTAINER_ID")
    echo "Created container $i: $CONTAINER_ID"
done

# List all containers
echo "Listing all containers:"
curl -s -X GET "${BASE_URL}/containers" | jq '.data[] | {id, status, image}'

# Clean up all created containers
echo "Cleaning up containers..."
for CONTAINER_ID in "${CONTAINER_IDS[@]}"; do
    curl -s -X DELETE "${BASE_URL}/containers/${CONTAINER_ID}" | jq -r '.data.message'
done

echo "Cleanup completed"
```

---

## Testing and Debugging

### Verbose Output for Debugging

```bash
curl -X GET "${BASE_URL}/health" \
  -H "Accept: application/json" \
  -H "User-Agent: Debug-Client/1.0" \
  -v \
  --trace-ascii /dev/stdout
```

### Timing API Requests

```bash
curl -X GET "${BASE_URL}/health" \
  -w "Time: %{time_total}s\nStatus: %{http_code}\nSize: %{size_download} bytes\n" \
  -o /dev/null \
  -s
```

### Save Response Headers

```bash
curl -X GET "${BASE_URL}/health" \
  -D headers.txt \
  -o response.json

echo "Headers:"
cat headers.txt
echo "Response:"
cat response.json | jq '.'
```

### Test with Different Content Types

```bash
# Test with invalid content type
curl -X POST "${BASE_URL}/containers" \
  -H "Content-Type: text/plain" \
  -d '{"image": "nginx:alpine"}'

# Test with missing content type
curl -X POST "${BASE_URL}/containers" \
  -d '{"image": "nginx:alpine"}'
```

---

## Environment Variables and Configuration

You can set these environment variables to customize the examples:

```bash
# Set base URL
export DOCKER_ONDEMAND_URL="http://localhost:3000"

# Set default image
export DEFAULT_IMAGE="nginx:alpine"

# Use in commands
curl -X POST "${DOCKER_ONDEMAND_URL:-http://localhost:3000}/containers" \
  -H "Content-Type: application/json" \
  -d "{\"image\": \"${DEFAULT_IMAGE}\"}"
```

## Tips and Best Practices

1. **Always check HTTP status codes** when scripting
2. **Use jq for JSON processing** to extract specific fields
3. **Set appropriate timeouts** for long-running operations
4. **Handle errors gracefully** in automated scripts
5. **Use environment variables** for configuration
6. **Save container IDs** when creating containers for later operations
7. **Test connectivity** after container creation before using
8. **Clean up resources** after testing to avoid resource exhaustion