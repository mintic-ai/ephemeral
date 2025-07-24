---
title: "ADR-003: Container Cleanup Strategy and Scheduling Approach"
status: "Accepted"
date: "2025-01-23"
deciders: ["Development Team", "Operations Team"]
consulted: ["Infrastructure Team"]
informed: ["Security Team"]
---

# ADR-003: Container Cleanup Strategy and Scheduling Approach

## Status

**Accepted** - 2025-01-23

## Context

The Ephemeral system creates containers dynamically based on API requests. Without proper cleanup mechanisms, inactive containers would accumulate indefinitely, leading to resource exhaustion, security risks, and operational overhead. The system requires an intelligent cleanup strategy that balances resource efficiency with operational reliability.

### Key Requirements

- **Resource Management**: Prevent resource exhaustion from abandoned containers
- **Activity Detection**: Accurately identify inactive containers for cleanup
- **Configurable Policies**: Flexible cleanup policies for different environments
- **Reliability**: Robust cleanup with retry logic and error handling
- **Observability**: Comprehensive logging and monitoring of cleanup operations
- **Safety**: Prevent accidental removal of active containers
- **Performance**: Efficient cleanup operations that don't impact system performance

### Cleanup Challenges

- **Activity Detection**: Determining when a container is truly inactive
- **Timing Sensitivity**: Balancing cleanup frequency with resource usage
- **Error Handling**: Managing cleanup failures and retry scenarios
- **Concurrent Operations**: Handling cleanup during active container operations
- **Resource Leaks**: Ensuring complete cleanup of associated resources

## Decision

We will implement a **scheduled cleanup strategy** using activity-based inactivity detection with configurable policies, retry logic, and comprehensive monitoring.

## Rationale

### Core Cleanup Architecture

#### Activity-Based Cleanup
- **Activity Monitoring**: Track container activity through Docker stats API
- **Inactivity Thresholds**: Configurable timeout periods for different activity types
- **Multi-Signal Detection**: Combine CPU usage, network activity, and manual actions
- **Grace Periods**: Configurable grace periods before cleanup eligibility

#### Scheduled Execution
- **Cron-Based Scheduling**: Use node-cron for reliable, configurable scheduling
- **Configurable Intervals**: Support for different cleanup frequencies (seconds to hours)
- **Manual Triggers**: Support for on-demand cleanup operations
- **Startup Cleanup**: Initial cleanup on system startup to handle orphaned containers

### Implementation Strategy

#### Activity Monitoring System
```typescript
interface ActivityRecord {
  containerId: string;
  timestamp: Date;
  activityType: 'manual' | 'resource_usage';
  details: {
    cpu_usage?: number;
    memory_usage?: number;
    network_activity?: boolean;
  };
}
```

#### Cleanup Decision Logic
```typescript
private shouldRemoveContainer(
  containerId: string, 
  lastActivity: Date | null, 
  currentTime: Date
): boolean {
  if (!lastActivity) return true; // No activity recorded
  
  const inactivityPeriod = currentTime.getTime() - lastActivity.getTime();
  const timeoutMs = this.config.cleanup.inactivityTimeout * 1000;
  
  return inactivityPeriod > timeoutMs;
}
```

#### Retry and Error Handling
```typescript
private async attemptContainerRemoval(containerId: string): Promise<CleanupResult> {
  const retryCount = this.retryQueue.get(containerId) || 0;
  
  try {
    await ErrorHandler.executeDockerOperation(
      () => this.containerManager.removeContainer(containerId),
      `remove container ${containerId} during cleanup`
    );
    
    this.retryQueue.delete(containerId);
    return { containerId, success: true, retryCount: retryCount + 1 };
  } catch (error) {
    if (retryCount < this.config.cleanup.maxRetryAttempts - 1) {
      this.retryQueue.set(containerId, retryCount + 1);
    } else {
      this.retryQueue.delete(containerId);
    }
    
    return { containerId, success: false, error: error.message, retryCount: retryCount + 1 };
  }
}
```

### Activity Detection Strategy

#### Resource-Based Activity
- **CPU Usage**: Monitor CPU utilization above configurable thresholds
- **Memory Changes**: Track significant memory usage changes
- **Network I/O**: Detect network activity through Docker stats
- **Disk I/O**: Monitor filesystem activity when available

#### Manual Activity Tracking
- **API Operations**: Track container creation, access, and deletion
- **User Interactions**: Log explicit user actions on containers
- **Health Checks**: Record health check activities
- **Monitoring Access**: Track monitoring and inspection operations

#### Activity Aggregation
- **Time Windows**: Aggregate activity over configurable time windows
- **Weighted Scoring**: Different activity types have different weights
- **Decay Functions**: Older activity has less impact on cleanup decisions
- **Threshold Management**: Configurable thresholds for different activity types

## Alternatives Considered

### Time-Based Cleanup (TTL)
- **Approach**: Remove containers after fixed time periods regardless of activity
- **Pros**: Simple implementation, predictable resource usage, easy to understand
- **Cons**: 
  - May remove active containers that haven't been explicitly accessed
  - Doesn't account for actual container usage patterns
  - Inflexible for different use cases
- **Decision**: Rejected in favor of activity-based approach for better accuracy

### Manual Cleanup Only
- **Approach**: Require explicit cleanup requests via API
- **Pros**: Complete control over container lifecycle, no accidental removals
- **Cons**: 
  - Risk of resource leaks from forgotten containers
  - Operational overhead for manual management
  - Doesn't scale with automated systems
- **Decision**: Rejected due to operational overhead and leak risks

### Event-Driven Cleanup
- **Approach**: Cleanup triggered by specific events (container stops, API calls)
- **Pros**: Immediate cleanup, efficient resource usage, responsive to changes
- **Cons**: 
  - Complex event handling and coordination
  - Risk of missing cleanup events
  - Difficult to implement comprehensive activity detection
- **Decision**: Rejected due to complexity and reliability concerns

### External Cleanup Service
- **Approach**: Separate service or tool handles container cleanup
- **Pros**: Separation of concerns, specialized cleanup logic, independent scaling
- **Cons**: 
  - Additional operational complexity
  - Coordination challenges between services
  - Potential for inconsistent state
- **Decision**: Rejected in favor of integrated approach for simplicity

### Docker Native Cleanup
- **Approach**: Rely on Docker's built-in cleanup mechanisms (docker system prune)
- **Pros**: Native Docker support, well-tested, minimal custom code
- **Cons**: 
  - Limited control over cleanup policies
  - May affect containers from other applications
  - Doesn't integrate with application-specific activity tracking
- **Decision**: Rejected due to lack of application-specific control

## Implementation Details

### Scheduling Configuration
```typescript
interface CleanupConfig {
  interval: number;                // Cleanup check interval (seconds)
  inactivityTimeout: number;       // Container inactivity timeout (seconds)
  maxRetryAttempts: number;        // Maximum retry attempts for failed cleanups
  forceRemovalTimeout: number;     // Force removal timeout (seconds)
}
```

### Cron Expression Generation
```typescript
private createCronExpression(intervalSeconds: number): string {
  if (intervalSeconds < 60) {
    return `*/${intervalSeconds} * * * * *`;      // Every N seconds
  } else if (intervalSeconds < 3600) {
    const minutes = Math.floor(intervalSeconds / 60);
    return `0 */${minutes} * * * *`;              // Every N minutes
  } else {
    const hours = Math.floor(intervalSeconds / 3600);
    return `0 0 */${hours} * * *`;                // Every N hours
  }
}
```

### Cleanup History and Monitoring
```typescript
interface CleanupSummary {
  totalContainersChecked: number;
  containersRemoved: number;
  containersFailed: number;
  results: CleanupResult[];
  timestamp: Date;
}
```

### Error Handling and Retry Logic
- **Exponential Backoff**: Retry failed cleanups with increasing delays
- **Max Attempts**: Configurable maximum retry attempts before abandoning
- **Error Classification**: Distinguish between retryable and permanent failures
- **Retry Queue**: Persistent queue for failed cleanup operations

## Consequences

### Positive Consequences

#### Resource Management
- **Automatic Cleanup**: Prevents resource exhaustion from abandoned containers
- **Configurable Policies**: Flexible cleanup policies for different environments
- **Efficient Resource Usage**: Removes only truly inactive containers
- **Predictable Behavior**: Scheduled cleanup provides predictable resource patterns

#### Operational Benefits
- **Reduced Manual Overhead**: Automatic cleanup reduces operational burden
- **Comprehensive Monitoring**: Detailed logging and history for troubleshooting
- **Retry Logic**: Robust handling of cleanup failures
- **Safety Mechanisms**: Activity detection prevents accidental removal of active containers

#### System Reliability
- **Error Resilience**: Continues operation despite individual cleanup failures
- **State Consistency**: Maintains consistent state between cleanup operations
- **Recovery Mechanisms**: Retry logic handles transient failures
- **Monitoring Integration**: Comprehensive observability for cleanup operations

### Negative Consequences

#### Complexity
- **Activity Detection**: Complex logic for determining container activity
- **Scheduling Management**: Additional complexity from cron-based scheduling
- **Error Handling**: Sophisticated retry and error handling logic
- **Configuration Management**: Multiple configuration parameters to tune

#### Resource Overhead
- **Monitoring Overhead**: Continuous activity monitoring consumes resources
- **Cleanup Processing**: Periodic cleanup operations use CPU and memory
- **Storage Requirements**: Activity history and cleanup logs require storage
- **Network Usage**: Docker API calls for monitoring and cleanup

#### Operational Considerations
- **Configuration Tuning**: Requires careful tuning of cleanup parameters
- **Monitoring Requirements**: Need for comprehensive monitoring and alerting
- **Debugging Complexity**: Complex cleanup logic can be difficult to debug
- **State Management**: Need to maintain cleanup state across restarts

### Risk Mitigation

#### Accidental Container Removal
- **Activity Verification**: Multiple activity signals before cleanup eligibility
- **Grace Periods**: Configurable grace periods before cleanup
- **Manual Override**: Ability to exclude containers from cleanup
- **Comprehensive Logging**: Detailed logs for cleanup decisions and actions

#### Cleanup Failures
- **Retry Logic**: Exponential backoff retry for transient failures
- **Error Classification**: Distinguish between retryable and permanent errors
- **Manual Intervention**: Support for manual cleanup operations
- **Monitoring and Alerting**: Alerts for cleanup failure patterns

#### Performance Impact
- **Efficient Scheduling**: Configurable intervals to balance cleanup frequency
- **Batch Processing**: Process multiple containers efficiently
- **Resource Limits**: Limits on concurrent cleanup operations
- **Performance Monitoring**: Track cleanup operation performance

## Configuration Examples

### Development Environment
```bash
CLEANUP_INTERVAL=30                    # 30 seconds
CLEANUP_INACTIVITY_TIMEOUT=120         # 2 minutes
CLEANUP_MAX_RETRY_ATTEMPTS=2           # 2 retry attempts
```

### Production Environment
```bash
CLEANUP_INTERVAL=300                   # 5 minutes
CLEANUP_INACTIVITY_TIMEOUT=1800        # 30 minutes
CLEANUP_MAX_RETRY_ATTEMPTS=5           # 5 retry attempts
```

### High-Throughput Environment
```bash
CLEANUP_INTERVAL=60                    # 1 minute
CLEANUP_INACTIVITY_TIMEOUT=600         # 10 minutes
CLEANUP_MAX_RETRY_ATTEMPTS=3           # 3 retry attempts
```

## Monitoring and Observability

### Key Metrics
- **Cleanup Success Rate**: Percentage of successful cleanup operations
- **Container Removal Rate**: Number of containers removed per cleanup cycle
- **Retry Queue Size**: Number of containers in retry queue
- **Cleanup Duration**: Time taken for each cleanup cycle
- **Activity Detection Accuracy**: False positive/negative rates for activity detection

### Alerting Thresholds
- **High Failure Rate**: >10% cleanup failure rate
- **Large Retry Queue**: >50 containers in retry queue
- **Long Cleanup Duration**: >5 minutes for cleanup cycle
- **Resource Exhaustion**: >90% of available ports allocated

### Logging Strategy
- **Cleanup Decisions**: Log reasoning for each cleanup decision
- **Error Details**: Comprehensive error logging with context
- **Performance Metrics**: Log cleanup timing and resource usage
- **Activity Tracking**: Log activity detection and threshold calculations

## Review and Evolution

### Success Criteria
- **Resource Efficiency**: <5% resource waste from inactive containers
- **Cleanup Accuracy**: <1% false positive rate for active container removal
- **System Reliability**: 99.9% cleanup operation success rate
- **Operational Overhead**: <10% of system resources used for cleanup

### Review Schedule
- **Weekly**: Cleanup performance and error rate review
- **Monthly**: Activity detection accuracy assessment
- **Quarterly**: Cleanup policy effectiveness evaluation
- **Annually**: Comprehensive cleanup strategy review

### Evolution Triggers
- **Performance Issues**: Cleanup operations impacting system performance
- **Accuracy Problems**: High false positive/negative rates in activity detection
- **Operational Overhead**: Excessive manual intervention required
- **Scale Limitations**: Cleanup strategy doesn't scale with system growth

## References

- [Docker Container Lifecycle Management](https://docs.docker.com/engine/reference/commandline/container/)
- [Node-cron Scheduling Library](https://www.npmjs.com/package/node-cron)
- [Docker Stats API Documentation](https://docs.docker.com/engine/api/v1.41/#operation/ContainerStats)
- [Container Resource Management Best Practices](https://docs.docker.com/config/containers/resource_constraints/)

---

*This ADR documents the decision to implement a scheduled, activity-based container cleanup strategy with configurable policies, retry logic, and comprehensive monitoring to ensure efficient resource management while maintaining system reliability.*