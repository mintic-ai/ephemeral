---
title: "Monitoring and Logging Guide"
description: "Comprehensive guide for implementing monitoring, logging, and observability in the Docker On-Demand system"
audience: ["developers", "devops", "administrators"]
last_updated: "2025-01-23"
version: "1.0.0"
related_docs:
  - "../development/debugging.md"
  - "../deployment/monitoring.md"
  - "../architecture/components.md"
---

# Monitoring and Logging Guide

This guide provides comprehensive instructions for implementing monitoring, logging, and observability in the Docker On-Demand system. It covers logging patterns, structured logging, monitoring setup, alerting configuration, and best practices for production environments.

## Logging Architecture Overview

The Docker On-Demand system uses a centralized logging architecture with the following characteristics:

- **Structured Logging**: All logs use consistent structured formats with metadata
- **Component-Based**: Logs are organized by system components
- **Level-Based Filtering**: Support for different log levels (ERROR, WARN, INFO, DEBUG)
- **In-Memory History**: Recent logs are stored in memory for debugging
- **Extensible Output**: Support for console, file, and external logging systems

### Logging Flow

```mermaid
graph TD
    A[Application Components] --> B[Logger.getInstance()]
    B --> C[Log Level Filter]
    C --> D[Structured Log Entry]
    D --> E[In-Memory History]
    D --> F[Console Output]
    D --> G[File Output]
    D --> H[External Systems]
    
    E --> I[Log Queries & Analysis]
    F --> J[Development Debugging]
    G --> K[Log Rotation & Archival]
    H --> L[Monitoring & Alerting]
```

## Logging System Components

### Logger Class

The centralized Logger class provides structured logging capabilities:

```typescript
import { Logger, LogLevel } from '../utils/Logger.js';

const logger = Logger.getInstance();

// Set log level
logger.setLogLevel(LogLevel.INFO);

// Basic logging
logger.error('ComponentName', 'Error message', error, { context: 'additional data' });
logger.warn('ComponentName', 'Warning message', { metadata: 'value' });
logger.info('ComponentName', 'Info message', { operation: 'create' });
logger.debug('ComponentName', 'Debug message', { details: 'verbose info' });

// Specialized logging methods
logger.logContainerOperation('create', 'container-123', true, { port: 8080 });
logger.logSystemEvent('server_started', 'ApiServer', { port: 3000 });
```

### Log Levels

The system supports four log levels with hierarchical filtering:

| Level | Value | Description | Use Cases |
|-------|-------|-------------|-----------|
| ERROR | 0 | Critical errors that require attention | System failures, unhandled exceptions |
| WARN | 1 | Warning conditions that should be monitored | Deprecated features, recoverable errors |
| INFO | 2 | General information about system operation | Service startup, successful operations |
| DEBUG | 3 | Detailed information for debugging | Request/response details, internal state |

### Log Entry Structure

All log entries follow a consistent structure:

```typescript
interface LogEntry {
  timestamp: string;        // ISO 8601 timestamp
  level: LogLevel;         // Log level enum
  component: string;       // Component/service name
  message: string;         // Human-readable message
  metadata?: any;          // Additional structured data
  error?: Error;           // Error object (for error logs)
}
```

## Implementing Logging in Components

### Service Logging Pattern

```typescript
import { Logger } from '../utils/Logger.js';

export class MyService {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  public async performOperation(params: any): Promise<any> {
    const operationId = this.generateOperationId();
    
    try {
      this.logger.info('MyService', 'Starting operation', {
        operationId,
        operation: 'performOperation',
        params: this.sanitizeParams(params)
      });

      const result = await this.executeOperation(params);

      this.logger.info('MyService', 'Operation completed successfully', {
        operationId,
        operation: 'performOperation',
        duration: Date.now() - startTime,
        resultSize: JSON.stringify(result).length
      });

      return result;

    } catch (error) {
      this.logger.error('MyService', 'Operation failed', error, {
        operationId,
        operation: 'performOperation',
        params: this.sanitizeParams(params),
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  private sanitizeParams(params: any): any {
    // Remove sensitive information from logs
    const sanitized = { ...params };
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.secret;
    return sanitized;
  }

  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### API Request Logging

```typescript
// Middleware for request logging
export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const logger = Logger.getInstance();
  const requestId = generateRequestId();
  const startTime = Date.now();

  // Add request ID to request object
  (req as any).requestId = requestId;

  // Log incoming request
  logger.info('ApiServer', 'Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    contentLength: req.get('Content-Length')
  });

  // Override res.json to log responses
  const originalJson = res.json;
  res.json = function(body: any) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    logger.info('ApiServer', 'Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode,
      duration,
      responseSize: JSON.stringify(body).length,
      success: statusCode < 400
    });

    return originalJson.call(this, body);
  };

  next();
}
```

### Container Operation Logging

```typescript
// Enhanced container operation logging
export class ContainerManager {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  public async createContainer(request: ContainerCreateRequest): Promise<Container> {
    const operationId = this.generateOperationId();
    const startTime = Date.now();

    try {
      this.logger.info('ContainerManager', 'Starting container creation', {
        operationId,
        image: request.image || this.config.docker.defaultImage,
        environment: Object.keys(request.environment || {}),
        requestedPorts: request.ports
      });

      const container = await this.performContainerCreation(request);

      this.logger.logContainerOperation('create', container.id, true, {
        operationId,
        dockerId: container.dockerId,
        port: container.connection.port,
        image: container.image,
        duration: Date.now() - startTime
      });

      return container;

    } catch (error) {
      this.logger.logContainerOperation('create', 'unknown', false, {
        operationId,
        image: request.image || this.config.docker.defaultImage,
        duration: Date.now() - startTime
      }, error);

      throw error;
    }
  }
}
```

## Advanced Logging Patterns

### Correlation IDs

Implement correlation IDs to track requests across services:

```typescript
export class CorrelationContext {
  private static context = new Map<string, string>();

  public static setCorrelationId(id: string): void {
    this.context.set('correlationId', id);
  }

  public static getCorrelationId(): string | undefined {
    return this.context.get('correlationId');
  }

  public static withCorrelationId<T>(id: string, fn: () => T): T {
    const previousId = this.getCorrelationId();
    this.setCorrelationId(id);
    
    try {
      return fn();
    } finally {
      if (previousId) {
        this.setCorrelationId(previousId);
      } else {
        this.context.delete('correlationId');
      }
    }
  }
}

// Enhanced logger with correlation support
export class EnhancedLogger extends Logger {
  public info(component: string, message: string, metadata?: any): void {
    const correlationId = CorrelationContext.getCorrelationId();
    const enhancedMetadata = {
      ...metadata,
      ...(correlationId && { correlationId })
    };
    
    super.info(component, message, enhancedMetadata);
  }
}
```

### Performance Logging

Track performance metrics in your logs:

```typescript
export class PerformanceLogger {
  private static logger = Logger.getInstance();

  public static async measureAsync<T>(
    component: string,
    operation: string,
    fn: () => Promise<T>,
    metadata?: any
  ): Promise<T> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      const endMemory = process.memoryUsage();

      this.logger.info(component, `Performance: ${operation}`, {
        operation,
        duration,
        memoryDelta: {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          heapTotal: endMemory.heapTotal - startMemory.heapTotal
        },
        success: true,
        ...metadata
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error(component, `Performance: ${operation} failed`, error, {
        operation,
        duration,
        success: false,
        ...metadata
      });

      throw error;
    }
  }
}

// Usage example
const result = await PerformanceLogger.measureAsync(
  'ContainerManager',
  'createContainer',
  () => this.performContainerCreation(request),
  { image: request.image }
);
```

### Structured Error Logging

Implement comprehensive error logging with context:

```typescript
export class ErrorLogger {
  private static logger = Logger.getInstance();

  public static logError(
    component: string,
    operation: string,
    error: Error,
    context?: any
  ): void {
    const errorInfo = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
      cause: (error as any).cause?.message
    };

    this.logger.error(component, `Error in ${operation}`, error, {
      operation,
      errorInfo,
      context,
      timestamp: new Date().toISOString()
    });
  }

  public static logUnhandledError(error: Error, context?: any): void {
    this.logError('System', 'unhandled_error', error, {
      ...context,
      severity: 'critical',
      requiresImmedateAttention: true
    });
  }
}
```

## Log Analysis and Querying

### In-Memory Log Queries

The Logger class provides methods for querying logs:

```typescript
const logger = Logger.getInstance();

// Get recent logs
const recentLogs = logger.getRecentLogs(100);

// Get logs by level
const errorLogs = logger.getLogsByLevel(LogLevel.ERROR);
const warningLogs = logger.getLogsByLevel(LogLevel.WARN);

// Get logs by component
const containerLogs = logger.getLogsByComponent('ContainerManager');
const apiLogs = logger.getLogsByComponent('ApiServer');

// Custom log filtering
function getLogsByTimeRange(startTime: Date, endTime: Date): LogEntry[] {
  return logger.getRecentLogs(1000).filter(entry => {
    const entryTime = new Date(entry.timestamp);
    return entryTime >= startTime && entryTime <= endTime;
  });
}

function getLogsByOperation(operation: string): LogEntry[] {
  return logger.getRecentLogs(1000).filter(entry => 
    entry.metadata?.operation === operation
  );
}
```

### Log Export and Analysis

```typescript
export class LogExporter {
  private static logger = Logger.getInstance();

  public static exportToJSON(filename: string, count: number = 1000): void {
    const logs = this.logger.getRecentLogs(count);
    const jsonData = JSON.stringify(logs, null, 2);
    
    require('fs').writeFileSync(filename, jsonData);
    console.log(`Exported ${logs.length} log entries to ${filename}`);
  }

  public static exportToCSV(filename: string, count: number = 1000): void {
    const logs = this.logger.getRecentLogs(count);
    const csvHeader = 'timestamp,level,component,message,metadata\n';
    
    const csvData = logs.map(log => {
      const metadata = log.metadata ? JSON.stringify(log.metadata) : '';
      return `${log.timestamp},${LogLevel[log.level]},${log.component},"${log.message}","${metadata}"`;
    }).join('\n');

    require('fs').writeFileSync(filename, csvHeader + csvData);
    console.log(`Exported ${logs.length} log entries to ${filename}`);
  }

  public static generateLogSummary(): any {
    const logs = this.logger.getRecentLogs(1000);
    
    const summary = {
      totalLogs: logs.length,
      timeRange: {
        start: logs[0]?.timestamp,
        end: logs[logs.length - 1]?.timestamp
      },
      levelDistribution: {},
      componentDistribution: {},
      errorCount: 0,
      warningCount: 0
    };

    logs.forEach(log => {
      // Level distribution
      const levelName = LogLevel[log.level];
      summary.levelDistribution[levelName] = (summary.levelDistribution[levelName] || 0) + 1;

      // Component distribution
      summary.componentDistribution[log.component] = (summary.componentDistribution[log.component] || 0) + 1;

      // Error and warning counts
      if (log.level === LogLevel.ERROR) summary.errorCount++;
      if (log.level === LogLevel.WARN) summary.warningCount++;
    });

    return summary;
  }
}
```

## External Logging Integration

### File-Based Logging

```typescript
import * as fs from 'fs';
import * as path from 'path';

export class FileLogger {
  private logFilePath: string;
  private maxFileSize: number;
  private maxFiles: number;

  constructor(
    logFilePath: string = './logs/app.log',
    maxFileSize: number = 10 * 1024 * 1024, // 10MB
    maxFiles: number = 5
  ) {
    this.logFilePath = logFilePath;
    this.maxFileSize = maxFileSize;
    this.maxFiles = maxFiles;
    
    // Ensure log directory exists
    const logDir = path.dirname(logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  public writeLog(entry: LogEntry): void {
    const logLine = JSON.stringify(entry) + '\n';
    
    // Check if rotation is needed
    if (this.needsRotation()) {
      this.rotateLogFile();
    }

    // Append to current log file
    fs.appendFileSync(this.logFilePath, logLine);
  }

  private needsRotation(): boolean {
    try {
      const stats = fs.statSync(this.logFilePath);
      return stats.size >= this.maxFileSize;
    } catch (error) {
      return false; // File doesn't exist yet
    }
  }

  private rotateLogFile(): void {
    const logDir = path.dirname(this.logFilePath);
    const logName = path.basename(this.logFilePath, path.extname(this.logFilePath));
    const logExt = path.extname(this.logFilePath);

    // Rotate existing files
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const oldFile = path.join(logDir, `${logName}.${i}${logExt}`);
      const newFile = path.join(logDir, `${logName}.${i + 1}${logExt}`);
      
      if (fs.existsSync(oldFile)) {
        if (i === this.maxFiles - 1) {
          fs.unlinkSync(oldFile); // Delete oldest file
        } else {
          fs.renameSync(oldFile, newFile);
        }
      }
    }

    // Move current file to .1
    if (fs.existsSync(this.logFilePath)) {
      const rotatedFile = path.join(logDir, `${logName}.1${logExt}`);
      fs.renameSync(this.logFilePath, rotatedFile);
    }
  }
}

// Integrate with main Logger
export class EnhancedLogger extends Logger {
  private fileLogger?: FileLogger;

  constructor() {
    super();
    
    // Initialize file logger if configured
    const logFilePath = process.env.LOG_FILE_PATH;
    if (logFilePath) {
      this.fileLogger = new FileLogger(logFilePath);
    }
  }

  protected log(level: LogLevel, component: string, message: string, metadata?: any, error?: Error): void {
    // Call parent implementation
    super.log(level, component, message, metadata, error);

    // Write to file if configured
    if (this.fileLogger) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        component,
        message,
        metadata,
        ...(error && { error: { name: error.name, message: error.message, stack: error.stack } })
      };
      
      this.fileLogger.writeLog(entry);
    }
  }
}
```

### Syslog Integration

```typescript
import * as dgram from 'dgram';

export class SyslogLogger {
  private client: dgram.Socket;
  private host: string;
  private port: number;
  private facility: number;

  constructor(host: string = 'localhost', port: number = 514, facility: number = 16) {
    this.client = dgram.createSocket('udp4');
    this.host = host;
    this.port = port;
    this.facility = facility;
  }

  public sendLog(entry: LogEntry): void {
    const priority = this.facility * 8 + this.levelToPriority(entry.level);
    const timestamp = new Date(entry.timestamp).toISOString();
    const hostname = require('os').hostname();
    const appName = 'docker-on-demand';
    
    const message = `<${priority}>${timestamp} ${hostname} ${appName}: [${entry.component}] ${entry.message}`;
    const buffer = Buffer.from(message);

    this.client.send(buffer, 0, buffer.length, this.port, this.host, (error) => {
      if (error) {
        console.error('Failed to send syslog message:', error);
      }
    });
  }

  private levelToPriority(level: LogLevel): number {
    switch (level) {
      case LogLevel.ERROR: return 3; // Error
      case LogLevel.WARN: return 4;  // Warning
      case LogLevel.INFO: return 6;  // Informational
      case LogLevel.DEBUG: return 7; // Debug
      default: return 6;
    }
  }

  public close(): void {
    this.client.close();
  }
}
```

## Monitoring and Metrics

### Application Metrics

```typescript
export class MetricsCollector {
  private static metrics = new Map<string, any>();
  private static logger = Logger.getInstance();

  public static incrementCounter(name: string, labels?: Record<string, string>): void {
    const key = this.createMetricKey(name, labels);
    const current = this.metrics.get(key) || 0;
    this.metrics.set(key, current + 1);

    this.logger.debug('Metrics', 'Counter incremented', {
      metric: name,
      labels,
      value: current + 1
    });
  }

  public static setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.createMetricKey(name, labels);
    this.metrics.set(key, value);

    this.logger.debug('Metrics', 'Gauge set', {
      metric: name,
      labels,
      value
    });
  }

  public static recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.createMetricKey(name, labels);
    const existing = this.metrics.get(key) || { count: 0, sum: 0, values: [] };
    
    existing.count++;
    existing.sum += value;
    existing.values.push(value);
    
    // Keep only last 1000 values for percentile calculation
    if (existing.values.length > 1000) {
      existing.values.shift();
    }

    this.metrics.set(key, existing);

    this.logger.debug('Metrics', 'Histogram recorded', {
      metric: name,
      labels,
      value,
      count: existing.count,
      average: existing.sum / existing.count
    });
  }

  public static getMetrics(): Record<string, any> {
    const result = {};
    for (const [key, value] of this.metrics.entries()) {
      result[key] = value;
    }
    return result;
  }

  public static exportPrometheusFormat(): string {
    let output = '';
    
    for (const [key, value] of this.metrics.entries()) {
      const [name, labelsStr] = key.split('{');
      const labels = labelsStr ? `{${labelsStr}` : '';
      
      if (typeof value === 'number') {
        output += `${name}${labels} ${value}\n`;
      } else if (value.count !== undefined) {
        // Histogram
        output += `${name}_count${labels} ${value.count}\n`;
        output += `${name}_sum${labels} ${value.sum}\n`;
      }
    }
    
    return output;
  }

  private static createMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    
    const labelStr = Object.entries(labels)
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');
    
    return `${name}{${labelStr}}`;
  }
}

// Usage in services
export class ContainerManager {
  public async createContainer(request: ContainerCreateRequest): Promise<Container> {
    const startTime = Date.now();
    
    try {
      MetricsCollector.incrementCounter('container_operations_total', { 
        operation: 'create',
        image: request.image || 'default'
      });

      const container = await this.performContainerCreation(request);
      
      const duration = Date.now() - startTime;
      MetricsCollector.recordHistogram('container_operation_duration_ms', duration, {
        operation: 'create',
        status: 'success'
      });

      MetricsCollector.setGauge('active_containers_total', this.getActiveContainerCount());

      return container;

    } catch (error) {
      const duration = Date.now() - startTime;
      MetricsCollector.recordHistogram('container_operation_duration_ms', duration, {
        operation: 'create',
        status: 'error'
      });

      MetricsCollector.incrementCounter('container_operation_errors_total', {
        operation: 'create',
        error_type: error.name
      });

      throw error;
    }
  }
}
```

### Health Check Monitoring

```typescript
export interface HealthCheck {
  name: string;
  check: () => Promise<{ healthy: boolean; details?: any }>;
  timeout: number;
  critical: boolean;
}

export class HealthMonitor {
  private checks: HealthCheck[] = [];
  private logger = Logger.getInstance();
  private lastResults = new Map<string, any>();

  public registerCheck(check: HealthCheck): void {
    this.checks.push(check);
    this.logger.info('HealthMonitor', 'Health check registered', {
      name: check.name,
      timeout: check.timeout,
      critical: check.critical
    });
  }

  public async runAllChecks(): Promise<{
    healthy: boolean;
    checks: Record<string, any>;
    timestamp: string;
  }> {
    const results = {};
    let overallHealthy = true;

    for (const check of this.checks) {
      try {
        const result = await this.runSingleCheck(check);
        results[check.name] = result;
        
        if (check.critical && !result.healthy) {
          overallHealthy = false;
        }

        this.lastResults.set(check.name, result);

      } catch (error) {
        const errorResult = {
          healthy: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
        
        results[check.name] = errorResult;
        this.lastResults.set(check.name, errorResult);
        
        if (check.critical) {
          overallHealthy = false;
        }

        this.logger.error('HealthMonitor', `Health check failed: ${check.name}`, error);
      }
    }

    const healthStatus = {
      healthy: overallHealthy,
      checks: results,
      timestamp: new Date().toISOString()
    };

    this.logger.info('HealthMonitor', 'Health check completed', {
      healthy: overallHealthy,
      totalChecks: this.checks.length,
      failedChecks: Object.values(results).filter((r: any) => !r.healthy).length
    });

    return healthStatus;
  }

  private async runSingleCheck(check: HealthCheck): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Health check timeout: ${check.name}`));
      }, check.timeout);

      try {
        const result = await check.check();
        clearTimeout(timeout);
        resolve({
          ...result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  public getLastResults(): Record<string, any> {
    const results = {};
    for (const [name, result] of this.lastResults.entries()) {
      results[name] = result;
    }
    return results;
  }
}

// Register health checks
const healthMonitor = new HealthMonitor();

// Docker connectivity check
healthMonitor.registerCheck({
  name: 'docker_connectivity',
  timeout: 5000,
  critical: true,
  check: async () => {
    try {
      const docker = new Docker();
      await docker.ping();
      return { healthy: true, details: { status: 'connected' } };
    } catch (error) {
      return { healthy: false, details: { error: error.message } };
    }
  }
});

// Database connectivity check (if applicable)
healthMonitor.registerCheck({
  name: 'memory_usage',
  timeout: 1000,
  critical: false,
  check: async () => {
    const memUsage = process.memoryUsage();
    const memoryThreshold = 500 * 1024 * 1024; // 500MB
    
    return {
      healthy: memUsage.heapUsed < memoryThreshold,
      details: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        threshold: memoryThreshold
      }
    };
  }
});
```

## Alerting and Notifications

### Alert Manager

```typescript
export interface Alert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  component: string;
  timestamp: Date;
  metadata?: any;
}

export interface AlertRule {
  name: string;
  condition: (logs: LogEntry[]) => boolean;
  severity: Alert['severity'];
  cooldown: number; // milliseconds
  description: string;
}

export class AlertManager {
  private rules: AlertRule[] = [];
  private alerts: Alert[] = [];
  private lastAlertTimes = new Map<string, number>();
  private logger = Logger.getInstance();

  public addRule(rule: AlertRule): void {
    this.rules.push(rule);
    this.logger.info('AlertManager', 'Alert rule added', {
      name: rule.name,
      severity: rule.severity,
      cooldown: rule.cooldown
    });
  }

  public checkAlerts(): Alert[] {
    const recentLogs = this.logger.getRecentLogs(1000);
    const newAlerts: Alert[] = [];

    for (const rule of this.rules) {
      try {
        if (rule.condition(recentLogs)) {
          const now = Date.now();
          const lastAlert = this.lastAlertTimes.get(rule.name) || 0;

          if (now - lastAlert > rule.cooldown) {
            const alert: Alert = {
              id: this.generateAlertId(),
              severity: rule.severity,
              title: rule.name,
              description: rule.description,
              component: 'AlertManager',
              timestamp: new Date(),
              metadata: { rule: rule.name }
            };

            this.alerts.push(alert);
            newAlerts.push(alert);
            this.lastAlertTimes.set(rule.name, now);

            this.logger.warn('AlertManager', `Alert triggered: ${rule.name}`, {
              alertId: alert.id,
              severity: alert.severity
            });
          }
        }
      } catch (error) {
        this.logger.error('AlertManager', `Error evaluating alert rule: ${rule.name}`, error);
      }
    }

    return newAlerts;
  }

  public getActiveAlerts(): Alert[] {
    // Return alerts from last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.alerts.filter(alert => alert.timestamp > oneDayAgo);
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Example alert rules
const alertManager = new AlertManager();

// High error rate alert
alertManager.addRule({
  name: 'high_error_rate',
  severity: 'high',
  cooldown: 5 * 60 * 1000, // 5 minutes
  description: 'Error rate is above threshold',
  condition: (logs) => {
    const recentLogs = logs.filter(log => {
      const logTime = new Date(log.timestamp);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return logTime > fiveMinutesAgo;
    });

    const errorLogs = recentLogs.filter(log => log.level === LogLevel.ERROR);
    const errorRate = errorLogs.length / Math.max(recentLogs.length, 1);
    
    return errorRate > 0.1; // 10% error rate threshold
  }
});

// Container creation failures
alertManager.addRule({
  name: 'container_creation_failures',
  severity: 'medium',
  cooldown: 2 * 60 * 1000, // 2 minutes
  description: 'Multiple container creation failures detected',
  condition: (logs) => {
    const recentLogs = logs.filter(log => {
      const logTime = new Date(log.timestamp);
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      return logTime > tenMinutesAgo;
    });

    const failedCreations = recentLogs.filter(log => 
      log.component === 'ContainerManager' &&
      log.message.includes('Container create') &&
      log.message.includes('FAILED')
    );

    return failedCreations.length >= 3;
  }
});
```

## Production Monitoring Setup

### Log Aggregation with ELK Stack

```yaml
# docker-compose.monitoring.yml
version: '3.8'
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:7.15.0
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data

  logstash:
    image: docker.elastic.co/logstash/logstash:7.15.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    ports:
      - "5044:5044"
    depends_on:
      - elasticsearch

  kibana:
    image: docker.elastic.co/kibana/kibana:7.15.0
    ports:
      - "5601:5601"
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    depends_on:
      - elasticsearch

  filebeat:
    image: docker.elastic.co/beats/filebeat:7.15.0
    volumes:
      - ./filebeat.yml:/usr/share/filebeat/filebeat.yml
      - /var/log/docker-on-demand:/var/log/docker-on-demand
    depends_on:
      - logstash

volumes:
  elasticsearch_data:
```

### Prometheus Integration

```typescript
// Prometheus metrics endpoint
export class PrometheusExporter {
  private static metricsCollector = MetricsCollector;

  public static getMetricsEndpoint() {
    return (req: Request, res: Response) => {
      try {
        const metrics = this.metricsCollector.exportPrometheusFormat();
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
      } catch (error) {
        res.status(500).send('Error generating metrics');
      }
    };
  }
}

// Add to API server
this.app.get('/metrics', PrometheusExporter.getMetricsEndpoint());
```

## Best Practices

### Security

1. **Sensitive Data**: Never log sensitive information (passwords, tokens, secrets)
2. **Log Sanitization**: Sanitize user input before logging
3. **Access Control**: Restrict access to log files and monitoring endpoints
4. **Audit Logging**: Log security-relevant events separately

### Performance

1. **Async Logging**: Use asynchronous logging to avoid blocking operations
2. **Log Levels**: Use appropriate log levels to control verbosity
3. **Sampling**: Implement log sampling for high-volume operations
4. **Buffer Management**: Manage log buffers to prevent memory issues

### Reliability

1. **Error Handling**: Handle logging errors gracefully
2. **Fallback Mechanisms**: Implement fallback logging when primary systems fail
3. **Log Rotation**: Implement proper log rotation to manage disk space
4. **Monitoring the Monitor**: Monitor your monitoring systems

### Maintainability

1. **Structured Logging**: Use consistent structured log formats
2. **Documentation**: Document log formats and monitoring procedures
3. **Testing**: Test logging and monitoring functionality
4. **Regular Review**: Regularly review and update monitoring rules

This guide provides a comprehensive foundation for implementing robust monitoring and logging in the Docker On-Demand system, ensuring observability, reliability, and maintainability in production environments.