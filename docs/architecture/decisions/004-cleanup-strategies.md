---
title: "ADR 004: Custom Cleanup Strategies and Activity Thresholds"
description: "Decision to implement flexible cleanup strategies with custom activity thresholds"
status: "Accepted"
date: "2025-01-25"
deciders: ["Development Team"]
consulted: ["System Architects", "Operations Team"]
informed: ["Product Team", "End Users"]
---

# ADR 004: Custom Cleanup Strategies and Activity Thresholds

## Status

**Accepted** - January 25, 2025

## Context

The original Ephemeral system implemented a simple activity-based cleanup mechanism where containers were removed after a fixed inactivity timeout. While this approach worked for basic use cases, it had several limitations:

1. **One-size-fits-all approach**: All containers used the same cleanup strategy regardless of their intended use
2. **Limited activity detection**: Activity was detected through basic methods without considering resource usage patterns
3. **No lifetime limits**: Long-running containers could persist indefinitely if they remained active
4. **Inflexible thresholds**: No way to customize what constitutes "activity" for different container types

Users requested more flexible cleanup options to better match their specific use cases, such as:
- Development containers that should be cleaned up quickly
- Long-running services that need lifetime limits
- Resource-intensive applications requiring custom activity thresholds
- Mixed environments with different cleanup requirements

## Decision

We will implement a flexible cleanup strategy system with the following components:

### 1. Multiple Cleanup Strategy Types

- **Activity-based**: Remove containers after inactivity timeout (original behavior)
- **Lifetime-based**: Remove containers after maximum lifetime regardless of activity
- **Hybrid**: Remove containers when either inactivity timeout OR maximum lifetime is reached

### 2. Custom Activity Thresholds

Allow users to define custom thresholds for activity detection:
- **CPU Usage**: Minimum CPU percentage to consider active
- **Memory Usage**: Minimum memory usage in MB to consider active
- **Network I/O**: Minimum network bytes per second to consider active

### 3. Per-Container Configuration

Each container can specify its own cleanup strategy and thresholds through the API:

```json
{
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

### 4. Backward Compatibility

- Default behavior remains unchanged for existing API consumers
- New fields are optional and have sensible defaults
- Existing containers continue to work with activity-based cleanup

## Implementation Details

### Data Model Changes

```typescript
interface CleanupStrategy {
  type: 'activity' | 'lifetime' | 'hybrid';
  maxLifetime?: number; // seconds
  activityTimeout?: number; // seconds
  activityThresholds?: ActivityThresholds;
}

interface ActivityThresholds {
  minCpuPercent?: number; // 0-100
  minMemoryMB?: number; // positive number
  minNetworkBytesPerSec?: number; // positive number
}
```

### Service Layer Changes

1. **Container Manager**: Store cleanup strategy with each container
2. **Activity Monitor**: Evaluate custom thresholds using Docker stats API
3. **Cleanup Scheduler**: Implement multi-strategy cleanup logic

### API Changes

- Extend POST /containers to accept cleanupStrategy parameter
- Include cleanup_strategy in all container responses
- Add validation for cleanup strategy parameters

## Consequences

### Positive

1. **Flexibility**: Users can choose appropriate cleanup strategies for their use cases
2. **Resource Optimization**: Custom thresholds allow better resource utilization detection
3. **Predictability**: Lifetime-based cleanup provides guaranteed container removal
4. **Backward Compatibility**: Existing integrations continue to work unchanged
5. **Granular Control**: Per-container configuration allows mixed environments

### Negative

1. **Complexity**: More configuration options increase system complexity
2. **Resource Usage**: Docker stats monitoring increases CPU and memory usage
3. **Testing Overhead**: More combinations to test and validate
4. **Documentation**: Additional documentation and examples required

### Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance degradation from stats monitoring | Medium | Configurable monitoring intervals, efficient stats processing |
| Configuration errors leading to unexpected cleanup | High | Comprehensive validation, clear error messages, documentation |
| Increased memory usage from threshold tracking | Low | Efficient data structures, cleanup of unused thresholds |
| Breaking changes in future versions | Medium | Careful API design, versioning strategy |

## Alternatives Considered

### Alternative 1: Global Configuration Only
**Description**: Implement cleanup strategies as global system configuration rather than per-container.

**Pros**: Simpler implementation, less API complexity
**Cons**: Less flexible, doesn't support mixed environments

**Decision**: Rejected - Per-container configuration provides much more value

### Alternative 2: Plugin-based Cleanup System
**Description**: Implement a plugin system for custom cleanup strategies.

**Pros**: Maximum flexibility, extensible architecture
**Cons**: Much more complex, harder to maintain, overkill for current needs

**Decision**: Rejected - Too complex for current requirements, can be considered for future

### Alternative 3: Time-based Cleanup Only
**Description**: Only implement lifetime-based cleanup without activity detection.

**Pros**: Simple, predictable, low resource usage
**Cons**: Wasteful for truly inactive containers, less intelligent

**Decision**: Rejected - Activity detection is core to the system's value proposition

## Implementation Plan

### Phase 1: Core Infrastructure
- [ ] Extend data models for cleanup strategies
- [ ] Update Container Manager to store strategies
- [ ] Implement basic validation

### Phase 2: Activity Monitoring Enhancement
- [ ] Extend Activity Monitor for custom thresholds
- [ ] Implement Docker stats monitoring
- [ ] Add threshold evaluation logic

### Phase 3: Cleanup Strategy Implementation
- [ ] Update Cleanup Scheduler for multi-strategy support
- [ ] Implement lifetime-based cleanup
- [ ] Implement hybrid cleanup logic

### Phase 4: API Integration
- [ ] Update API endpoints to accept cleanup strategies
- [ ] Add response formatting for cleanup strategy info
- [ ] Implement comprehensive validation

### Phase 5: Testing and Documentation
- [ ] Write comprehensive unit tests
- [ ] Create integration tests for all strategy types
- [ ] Update API documentation
- [ ] Create usage examples

## Monitoring and Success Metrics

### Technical Metrics
- API response time impact (target: <10% increase)
- Memory usage increase (target: <20% increase)
- Docker stats monitoring overhead (target: <5% CPU)

### Functional Metrics
- Cleanup accuracy (target: >99% correct cleanup decisions)
- Configuration error rate (target: <1% of requests)
- User adoption of new features (target: >30% within 6 months)

### Operational Metrics
- Support ticket reduction for cleanup issues
- User satisfaction with cleanup flexibility
- System resource utilization improvement

## Related Decisions

- [ADR 003: Cleanup Strategy](./003-cleanup-strategy.md) - Original cleanup implementation
- [ADR 002: Docker Integration](./002-docker-integration.md) - Docker API usage patterns

## References

- [Docker Stats API Documentation](https://docs.docker.com/engine/api/v1.41/#operation/ContainerStats)
- [Container Lifecycle Management Best Practices](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
- [Resource Monitoring Patterns](https://prometheus.io/docs/practices/monitoring/)

---

*This ADR documents the decision to implement flexible cleanup strategies with custom activity thresholds to provide users with more control over container lifecycle management.*