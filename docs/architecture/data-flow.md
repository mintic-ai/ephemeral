---
title: "Data Flow Documentation"
description: "Detailed documentation of request/response flows and data movement through the Ephemeral system"
audience: ["developers", "architects"]
last_updated: "2025-01-23"
version: "1.0.0"
related_docs:
  - "overview.md"
  - "components.md"
  - "../api/endpoints.md"
---

# Data Flow Documentation

This document provides detailed sequence diagrams and data flow documentation for key operations in the Ephemeral system, including request/response flows, container lifecycle management, and cleanup processes.

## Overview

The Ephemeral system processes requests through multiple layers, with data flowing between the API layer, service layer, and external systems. Understanding these flows is crucial for debugging, extending functionality, and maintaining system reliability.

## Core Data Flow Patterns

### Request Processing Architecture

```mermaid
sequenceDiagram
    participant Client
    participant ApiServer
    participant ContainerManager
    participant ActivityMonitor
    participant Docker
    participant Logger

    Client->>ApiServer: HTTP Request
    ApiServer->>Logger: Log request
    ApiServer->>ApiServer: Validate request
    ApiServer->>ContainerManager: Service operation
    ContainerManager->>Docker: Docker API call
    Docker-->>ContainerManager: Docker response
    ContainerManager->>ActivityMonitor: Update activity
    ContainerManager-->>ApiServer: Service response
    ApiServer->>Logger: Log response
    ApiServer-->>Client: HTTP Response
```

## Container Creation Flow

### Complete Container Creation Sequence

```mermaid
sequenceDiagram
    participant Client
    participant ApiServer
    participant ContainerManager
    participant ActivityMonitor
    participant Docker
    participant ErrorHandler
    participant Logger

    Note over Client,Logger: Container Creation Request Flow

    Client->>+ApiServer: POST /containers
    ApiServer->>Logger: Log incoming request
    
    ApiServer->>ApiServer: Validate request body
    alt Validation fails
        ApiServer->>Logger: Log validation error
        ApiServer-->>Client: 400 Bad Request
    end

    ApiServer->>+ContainerManager: createContainer(request)
    
    Note over ContainerManager: Port Allocation & Container Setup
    ContainerManager->>ContainerManager: Generate unique ID
    ContainerManager->>ContainerManager: Allocate port from range
    ContainerManager->>ContainerManager: Prepare Docker config
    
    ContainerManager->>+ErrorHandler: executeDockerOperation(createContainer)
    ErrorHandler->>+Docker: createContainer(config)
    Docker-->>-ErrorHandler: Docker container object
    ErrorHandler-->>-ContainerManager: Container created
    
    ContainerManager->>+ErrorHandler: executeDockerOperation(startContainer)
    ErrorHandler->>+Docker: container.start()
    Docker-->>-ErrorHandler: Container started
    ErrorHandler-->>-ContainerManager: Start successful
    
    ContainerManager->>+ErrorHandler: executeDockerOperation(inspectContainer)
    ErrorHandler->>+Docker: container.inspect()
    Docker-->>-ErrorHandler: Container info
    ErrorHandler-->>-ContainerManager: Container details
    
    ContainerManager->>ContainerManager: Create Container object
    ContainerManager->>ContainerManager: Store in registry
    ContainerManager->>Logger: Log successful creation
    ContainerManager-->>-ApiServer: Container object
    
    ApiServer->>+ActivityMonitor: startMonitoring(containerId, dockerId)
    ActivityMonitor->>ActivityMonitor: Initialize activity record
    ActivityMonitor->>ActivityMonitor: Start stats monitoring
    ActivityMonitor-->>-ApiServer: Monitoring started
    
    ApiServer->>ApiServer: Format response
    ApiServer->>Logger: Log successful response
    ApiServer-->>-Client: 201 Created with container details

    Note over Client,Logger: Error Handling Path
    alt Docker operation fails
        ErrorHandler->>Logger: Log Docker error
        ErrorHandler->>ErrorHandler: Retry with backoff
        alt Max retries exceeded
            ErrorHandler-->>ContainerManager: Throw error
            ContainerManager->>ContainerManager: Cleanup allocated port
            ContainerManager->>Logger: Log creation failure
            ContainerManager-->>ApiServer: Throw ContainerManagerError
            ApiServer->>ApiServer: Map error to HTTP status
            ApiServer->>Logger: Log error response
            ApiServer-->>Client: Error response
        end
    end
```

### Container Creation Data Transformation

```mermaid
graph TD
    A[Client Request] --> B[Request Validation]
    B --> C[Container Config Creation]
    C --> D[Docker Container Creation]
    D --> E[Container Object Creation]
    E --> F[Activity Monitoring Setup]
    F --> G[API Response]

    subgraph "Request Data"
        A1[image: string]
        A2[environment: object]
        A3[ports: array]
    end

    subgraph "Docker Config"
        C1[Image: docker_image]
        C2[Env: KEY=VALUE array]
        C3[ExposedPorts: port_map]
        C4[HostConfig: binding_config]
    end

    subgraph "Container Object"
        E1[id: unique_id]
        E2[dockerId: docker_container_id]
        E3[status: running]
        E4[connection: host_port_url]
        E5[metadata: docker_info]
    end

    subgraph "API Response"
        G1[id: container_id]
        G2[status: running]
        G3[connection: access_info]
        G4[created_at: timestamp]
        G5[last_activity: timestamp]
    end

    A --> A1
    A --> A2
    A --> A3
    
    C --> C1
    C --> C2
    C --> C3
    C --> C4
    
    E --> E1
    E --> E2
    E --> E3
    E --> E4
    E --> E5
    
    G --> G1
    G --> G2
    G --> G3
    G --> G4
    G --> G5
```

## Container Retrieval Flow

### Get Container Sequence

```mermaid
sequenceDiagram
    participant Client
    participant ApiServer
    participant ContainerManager
    participant ActivityMonitor
    participant Docker
    participant Logger

    Client->>+ApiServer: GET /containers/:id
    ApiServer->>Logger: Log request
    ApiServer->>ApiServer: Validate container ID
    
    ApiServer->>+ContainerManager: getContainer(containerId)
    ContainerManager->>ContainerManager: Check local registry
    
    alt Container not in registry
        ContainerManager-->>ApiServer: null
        ApiServer->>Logger: Log container not found
        ApiServer-->>Client: 404 Not Found
    else Container in registry
        ContainerManager->>+Docker: container.inspect()
        Docker-->>-ContainerManager: Container state
        ContainerManager->>ContainerManager: Update container status
        ContainerManager-->>-ApiServer: Container object
        
        ApiServer->>+ActivityMonitor: getLastActivity(containerId)
        ActivityMonitor-->>-ApiServer: Last activity timestamp
        
        ApiServer->>ApiServer: Update container with activity
        ApiServer->>ApiServer: Format response
        ApiServer->>Logger: Log successful response
        ApiServer-->>-Client: 200 OK with container details
    end

    alt Docker inspect fails
        Docker-->>ContainerManager: Error (container not found)
        ContainerManager->>ContainerManager: Remove from registry
        ContainerManager->>ContainerManager: Free allocated port
        ContainerManager-->>ApiServer: null
        ApiServer-->>Client: 404 Not Found
    end
```

### List Containers Flow

```mermaid
sequenceDiagram
    participant Client
    participant ApiServer
    participant ContainerManager
    participant Docker
    participant Logger

    Client->>+ApiServer: GET /containers
    ApiServer->>Logger: Log request
    
    ApiServer->>+ContainerManager: listContainers()
    ContainerManager->>ContainerManager: Get all containers from registry
    
    loop For each container
        ContainerManager->>+Docker: container.inspect()
        alt Container exists in Docker
            Docker-->>ContainerManager: Container state
            ContainerManager->>ContainerManager: Update status
        else Container not found in Docker
            Docker-->>ContainerManager: Error
            ContainerManager->>ContainerManager: Remove from registry
            ContainerManager->>ContainerManager: Free port
        end
    end
    
    ContainerManager-->>-ApiServer: Array of active containers
    ApiServer->>ApiServer: Format response array
    ApiServer->>Logger: Log successful response
    ApiServer-->>-Client: 200 OK with containers array
```

## Container Deletion Flow

### Complete Container Deletion Sequence

```mermaid
sequenceDiagram
    participant Client
    participant ApiServer
    participant ContainerManager
    participant ActivityMonitor
    participant Docker
    participant ErrorHandler
    participant Logger

    Client->>+ApiServer: DELETE /containers/:id
    ApiServer->>Logger: Log deletion request
    ApiServer->>ApiServer: Validate container ID
    
    ApiServer->>+ContainerManager: getContainer(containerId)
    ContainerManager-->>-ApiServer: Container object or null
    
    alt Container not found
        ApiServer->>Logger: Log container not found
        ApiServer-->>Client: 404 Not Found
    end
    
    ApiServer->>+ActivityMonitor: stopMonitoring(containerId)
    ActivityMonitor->>ActivityMonitor: Clear monitoring interval
    ActivityMonitor->>ActivityMonitor: Update activity record
    ActivityMonitor-->>-ApiServer: Monitoring stopped
    
    ApiServer->>+ContainerManager: removeContainer(containerId)
    
    ContainerManager->>+ErrorHandler: executeDockerOperation(stopContainer)
    ErrorHandler->>+Docker: container.stop()
    alt Stop successful
        Docker-->>-ErrorHandler: Container stopped
        ErrorHandler-->>ContainerManager: Stop successful
    else Stop fails
        Docker-->>-ErrorHandler: Stop error
        ErrorHandler-->>ContainerManager: Continue with removal
        ContainerManager->>Logger: Log stop warning
    end
    
    ContainerManager->>+ErrorHandler: executeDockerOperation(removeContainer)
    ErrorHandler->>+Docker: container.remove(force: true)
    Docker-->>-ErrorHandler: Container removed
    ErrorHandler-->>-ContainerManager: Remove successful
    
    ContainerManager->>ContainerManager: Free allocated port
    ContainerManager->>ContainerManager: Remove from registry
    ContainerManager->>Logger: Log successful removal
    ContainerManager-->>-ApiServer: Removal complete
    
    ApiServer->>+ActivityMonitor: removeActivityRecord(containerId)
    ActivityMonitor->>ActivityMonitor: Delete activity record
    ActivityMonitor-->>-ApiServer: Record removed
    
    ApiServer->>ApiServer: Format success response
    ApiServer->>Logger: Log successful deletion
    ApiServer-->>-Client: 200 OK with deletion confirmation

    alt Docker removal fails
        ErrorHandler->>Logger: Log Docker error
        ErrorHandler->>ErrorHandler: Retry with backoff
        alt Max retries exceeded
            ErrorHandler-->>ContainerManager: Throw error
            ContainerManager->>Logger: Log removal failure
            ContainerManager-->>ApiServer: Throw ContainerManagerError
            ApiServer->>Logger: Log error response
            ApiServer-->>Client: 500 Internal Server Error
        end
    end
```

## Activity Monitoring Flow

### Activity Monitoring Lifecycle

```mermaid
sequenceDiagram
    participant ContainerManager
    participant ActivityMonitor
    participant Docker
    participant Logger

    Note over ContainerManager,Logger: Monitoring Initialization
    ContainerManager->>+ActivityMonitor: startMonitoring(containerId, dockerId)
    ActivityMonitor->>ActivityMonitor: Create initial activity record
    ActivityMonitor->>ActivityMonitor: Start stats monitoring interval
    ActivityMonitor-->>-ContainerManager: Monitoring started

    Note over ActivityMonitor,Logger: Periodic Stats Collection
    loop Every 30 seconds
        ActivityMonitor->>ActivityMonitor: Check container stats
        ActivityMonitor->>+Docker: container.stats(stream: false)
        
        alt Container exists and has stats
            Docker-->>-ActivityMonitor: Container stats
            ActivityMonitor->>ActivityMonitor: Calculate CPU usage
            ActivityMonitor->>ActivityMonitor: Check network activity
            ActivityMonitor->>ActivityMonitor: Check memory usage
            
            alt Significant activity detected
                ActivityMonitor->>ActivityMonitor: Update activity record
                ActivityMonitor->>Logger: Log activity detection
            end
        else Container not found
            Docker-->>-ActivityMonitor: Container not found error
            ActivityMonitor->>Logger: Log container no longer exists
            ActivityMonitor->>ActivityMonitor: Stop monitoring
        end
    end

    Note over ActivityMonitor,Logger: Manual Activity Updates
    ActivityMonitor->>ActivityMonitor: updateActivity(manual action)
    ActivityMonitor->>ActivityMonitor: Store activity record
    ActivityMonitor->>Logger: Log manual activity update
```

### Activity Data Structure Flow

```mermaid
graph TD
    A[Docker Stats] --> B[Stats Processing]
    B --> C[Activity Detection]
    C --> D[Activity Record Update]
    D --> E[Activity Storage]

    subgraph "Docker Stats Data"
        A1[cpu_stats]
        A2[memory_stats]
        A3[networks]
        A4[precpu_stats]
    end

    subgraph "Processed Metrics"
        B1[CPU Usage %]
        B2[Memory Usage Bytes]
        B3[Network I/O Boolean]
        B4[Activity Threshold Check]
    end

    subgraph "Activity Record"
        D1[containerId]
        D2[timestamp]
        D3[activityType: resource_usage]
        D4[details: metrics]
    end

    A --> A1
    A --> A2
    A --> A3
    A --> A4

    B --> B1
    B --> B2
    B --> B3
    B --> B4

    D --> D1
    D --> D2
    D --> D3
    D --> D4
```

## Cleanup Process Flow

### Scheduled Cleanup Sequence

```mermaid
sequenceDiagram
    participant CronScheduler
    participant CleanupScheduler
    participant ContainerManager
    participant ActivityMonitor
    participant Docker
    participant ErrorHandler
    participant Logger

    Note over CronScheduler,Logger: Scheduled Cleanup Trigger
    CronScheduler->>+CleanupScheduler: Trigger cleanup (cron job)
    CleanupScheduler->>Logger: Log cleanup start
    
    CleanupScheduler->>+ContainerManager: listContainers()
    ContainerManager->>+Docker: List and inspect containers
    Docker-->>-ContainerManager: Container list with status
    ContainerManager-->>-CleanupScheduler: Active containers array
    
    CleanupScheduler->>Logger: Log containers to check
    
    loop For each container
        CleanupScheduler->>+ActivityMonitor: getLastActivity(containerId)
        ActivityMonitor-->>-CleanupScheduler: Last activity timestamp
        
        CleanupScheduler->>CleanupScheduler: Calculate inactivity period
        CleanupScheduler->>CleanupScheduler: Check against timeout threshold
        
        alt Container is inactive
            CleanupScheduler->>Logger: Log container marked for removal
            CleanupScheduler->>+CleanupScheduler: attemptContainerRemoval(containerId)
            
            CleanupScheduler->>+ErrorHandler: executeDockerOperation(removeContainer)
            ErrorHandler->>+ContainerManager: removeContainer(containerId)
            ContainerManager->>+Docker: Stop and remove container
            Docker-->>-ContainerManager: Container removed
            ContainerManager->>ContainerManager: Free port and update registry
            ContainerManager-->>-ErrorHandler: Removal successful
            ErrorHandler-->>-CleanupScheduler: Operation successful
            
            CleanupScheduler->>+ActivityMonitor: removeActivityRecord(containerId)
            ActivityMonitor->>ActivityMonitor: Delete activity record
            ActivityMonitor-->>-CleanupScheduler: Record removed
            
            CleanupScheduler->>Logger: Log successful cleanup
            CleanupScheduler-->>-CleanupScheduler: Success result
            
        else Container is active
            CleanupScheduler->>Logger: Log container still active
        end
    end
    
    Note over CleanupScheduler,Logger: Retry Queue Processing
    CleanupScheduler->>CleanupScheduler: Process retry queue
    loop For each container in retry queue
        CleanupScheduler->>CleanupScheduler: Check retry count vs max attempts
        alt Under max attempts
            CleanupScheduler->>CleanupScheduler: Retry removal
        else Max attempts exceeded
            CleanupScheduler->>Logger: Log abandoning container
            CleanupScheduler->>CleanupScheduler: Remove from retry queue
        end
    end
    
    CleanupScheduler->>CleanupScheduler: Create cleanup summary
    CleanupScheduler->>CleanupScheduler: Add to cleanup history
    CleanupScheduler->>Logger: Log cleanup completion
    CleanupScheduler-->>-CronScheduler: Cleanup complete

    Note over CleanupScheduler,Logger: Error Handling
    alt Container removal fails
        Docker-->>ContainerManager: Docker error
        ContainerManager-->>ErrorHandler: Removal failed
        ErrorHandler->>ErrorHandler: Retry with backoff
        alt Max retries exceeded
            ErrorHandler-->>CleanupScheduler: Final failure
            CleanupScheduler->>CleanupScheduler: Add to retry queue
            CleanupScheduler->>Logger: Log retry queue addition
        end
    end
```

### Cleanup Decision Flow

```mermaid
graph TD
    A[Container List] --> B[Get Last Activity]
    B --> C{Activity Found?}
    C -->|No| D[Mark for Removal]
    C -->|Yes| E[Calculate Inactivity Period]
    E --> F{Period > Timeout?}
    F -->|Yes| D
    F -->|No| G[Keep Container]
    D --> H[Attempt Removal]
    H --> I{Removal Success?}
    I -->|Yes| J[Update Summary]
    I -->|No| K{Under Max Retries?}
    K -->|Yes| L[Add to Retry Queue]
    K -->|No| M[Abandon Container]
    L --> J
    M --> J
    G --> J
    J --> N[Cleanup Complete]

    subgraph "Cleanup Criteria"
        E1[Current Time - Last Activity]
        E2[Inactivity Timeout Config]
        E3[Comparison Result]
    end

    subgraph "Retry Logic"
        K1[Current Retry Count]
        K2[Max Retry Attempts Config]
        K3[Retry Queue Management]
    end

    E --> E1
    E --> E2
    E --> E3

    K --> K1
    K --> K2
    K --> K3
```

## Error Handling Flow

### Error Processing and Retry Logic

```mermaid
sequenceDiagram
    participant Service
    participant ErrorHandler
    participant Docker
    participant Logger

    Service->>+ErrorHandler: executeDockerOperation(operation, name, options)
    ErrorHandler->>ErrorHandler: Initialize retry attempt (1)
    
    loop Retry attempts (max 3)
        ErrorHandler->>+Docker: Execute operation
        
        alt Operation successful
            Docker-->>-ErrorHandler: Success result
            ErrorHandler-->>Service: Return result
        else Operation fails
            Docker-->>-ErrorHandler: Error
            ErrorHandler->>ErrorHandler: Classify error (retryable/non-retryable)
            
            alt Error is non-retryable
                ErrorHandler->>Logger: Log non-retryable error
                ErrorHandler-->>Service: Throw original error
            else Error is retryable AND attempts remaining
                ErrorHandler->>ErrorHandler: Calculate backoff delay
                ErrorHandler->>Logger: Log retry attempt
                ErrorHandler->>ErrorHandler: Wait (exponential backoff)
                ErrorHandler->>ErrorHandler: Increment attempt counter
            else Max attempts reached
                ErrorHandler->>Logger: Log final failure
                ErrorHandler-->>Service: Throw original error
            end
        end
    end
```

### Error Classification and Response Mapping

```mermaid
graph TD
    A[Error Occurs] --> B[Error Classification]
    B --> C{Error Type}
    
    C -->|Docker API Error| D[Docker Error Processing]
    C -->|Validation Error| E[Validation Error Processing]
    C -->|Container Manager Error| F[Container Error Processing]
    C -->|System Error| G[System Error Processing]
    
    D --> D1{Retryable?}
    D1 -->|Yes| D2[Apply Retry Logic]
    D1 -->|No| D3[Immediate Failure]
    
    E --> E1[400 Bad Request]
    F --> F1[Map to HTTP Status]
    G --> G1[500 Internal Server Error]
    
    D2 --> H[Error Response]
    D3 --> H
    E1 --> H
    F1 --> H
    G1 --> H
    
    H --> I[Structured API Response]

    subgraph "Retryable Docker Errors"
        R1[ECONNREFUSED]
        R2[ETIMEDOUT]
        R3[ECONNRESET]
        R4[Temporary Docker Issues]
    end

    subgraph "Non-Retryable Errors"
        N1[Authentication Failures]
        N2[Invalid Requests]
        N3[Resource Not Found]
        N4[Permission Denied]
    end

    D1 --> R1
    D1 --> R2
    D1 --> R3
    D1 --> R4

    D1 --> N1
    D1 --> N2
    D1 --> N3
    D1 --> N4
```

## Health Check Flow

### System Health Assessment

```mermaid
sequenceDiagram
    participant Client
    participant ApiServer
    participant ContainerManager
    participant Docker
    participant Logger

    Client->>+ApiServer: GET /health
    ApiServer->>Logger: Log health check request
    
    ApiServer->>+ContainerManager: getActiveContainerCount()
    ContainerManager-->>-ApiServer: Container count
    
    ApiServer->>+Docker: docker.info()
    Docker-->>-ApiServer: Docker system info
    
    ApiServer->>ApiServer: Collect system metrics
    ApiServer->>ApiServer: Format health response
    
    ApiServer->>Logger: Log health check response
    ApiServer-->>-Client: 200 OK with health data

    alt Docker unavailable
        Docker-->>ApiServer: Connection error
        ApiServer->>Logger: Log Docker unavailability
        ApiServer-->>Client: 503 Service Unavailable
    end
```

## Configuration Flow

### Configuration Loading and Validation

```mermaid
sequenceDiagram
    participant Application
    participant ConfigManager
    participant Environment
    participant Logger

    Application->>+ConfigManager: getInstance()
    ConfigManager->>ConfigManager: Check singleton instance
    
    alt First initialization
        ConfigManager->>+Environment: Read environment variables
        Environment-->>-ConfigManager: Environment values
        
        ConfigManager->>ConfigManager: Apply default values
        ConfigManager->>ConfigManager: Validate configuration
        
        alt Validation fails
            ConfigManager->>Logger: Log validation errors
            ConfigManager-->>Application: Throw ConfigValidationError
        end
        
        ConfigManager->>Logger: Log successful configuration load
        ConfigManager-->>-Application: ConfigManager instance
    else Already initialized
        ConfigManager-->>-Application: Existing instance
    end
```

## Data Persistence and State Management

### In-Memory State Management

```mermaid
graph TD
    A[Application Start] --> B[Initialize Services]
    B --> C[Create In-Memory Stores]
    
    C --> C1[Container Registry Map]
    C --> C2[Used Ports Set]
    C --> C3[Activity Records Map]
    C --> C4[Retry Queue Map]
    
    D[Container Operations] --> E[Update State]
    E --> E1[Add/Remove Containers]
    E --> E2[Allocate/Free Ports]
    E --> E3[Update Activity Records]
    
    F[Application Shutdown] --> G[Cleanup State]
    G --> G1[Stop Monitoring]
    G --> G2[Clear Maps and Sets]
    G --> G3[Cancel Scheduled Tasks]

    subgraph "State Synchronization"
        S1[Docker State Check]
        S2[Registry Cleanup]
        S3[Port Reconciliation]
    end

    E --> S1
    S1 --> S2
    S2 --> S3
```

## Performance Considerations

### Request Processing Optimization

- **Connection Pooling**: Docker API connections are reused through dockerode client
- **Async Processing**: All Docker operations are asynchronous with proper error handling
- **Retry Logic**: Exponential backoff prevents overwhelming Docker daemon during failures
- **State Caching**: Container information cached in memory to reduce Docker API calls
- **Batch Operations**: Cleanup processes multiple containers efficiently

### Monitoring Efficiency

- **Polling Intervals**: 30-second intervals balance responsiveness with resource usage
- **Error Resilience**: Monitoring continues despite individual container failures
- **Resource Thresholds**: Activity detection uses configurable thresholds to avoid false positives
- **Cleanup Batching**: Multiple containers processed in single cleanup cycle

---

*For system architecture overview, see [System Overview](./overview.md)*  
*For detailed component information, see [Components Documentation](./components.md)*  
*For API endpoint details, see [API Documentation](../api/endpoints.md)*