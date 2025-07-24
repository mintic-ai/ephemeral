export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  metadata?: any;
  error?: Error;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logHistory: LogEntry[] = [];
  private readonly MAX_HISTORY_SIZE = 1000;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Set the minimum log level
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Log an error message
   */
  public error(component: string, message: string, error?: Error, metadata?: any): void {
    this.log(LogLevel.ERROR, component, message, metadata, error);
  }

  /**
   * Log a warning message
   */
  public warn(component: string, message: string, metadata?: any): void {
    this.log(LogLevel.WARN, component, message, metadata);
  }

  /**
   * Log an info message
   */
  public info(component: string, message: string, metadata?: any): void {
    this.log(LogLevel.INFO, component, message, metadata);
  }

  /**
   * Log a debug message
   */
  public debug(component: string, message: string, metadata?: any): void {
    this.log(LogLevel.DEBUG, component, message, metadata);
  }

  /**
   * Log container operation
   */
  public logContainerOperation(operation: string, containerId: string, success: boolean, metadata?: any, error?: Error): void {
    const message = `Container ${operation}: ${containerId} - ${success ? 'SUCCESS' : 'FAILED'}`;
    const logMetadata = {
      operation,
      containerId,
      success,
      ...metadata
    };

    if (success) {
      this.info('ContainerManager', message, logMetadata);
    } else {
      this.error('ContainerManager', message, error, logMetadata);
    }
  }

  /**
   * Log system event
   */
  public logSystemEvent(event: string, component: string, metadata?: any): void {
    this.info(component, `System event: ${event}`, metadata);
  }

  /**
   * Get recent log entries
   */
  public getRecentLogs(count: number = 100): LogEntry[] {
    return this.logHistory.slice(-count);
  }

  /**
   * Get logs by level
   */
  public getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logHistory.filter(entry => entry.level === level);
  }

  /**
   * Get logs by component
   */
  public getLogsByComponent(component: string): LogEntry[] {
    return this.logHistory.filter(entry => entry.component === component);
  }

  /**
   * Clear log history
   */
  public clearHistory(): void {
    this.logHistory = [];
  }

  /**
   * Internal logging method
   */
  private log(level: LogLevel, component: string, message: string, metadata?: any, error?: Error): void {
    if (level > this.logLevel) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      metadata,
      ...(error && { error })
    };

    // Add to history
    this.logHistory.push(logEntry);
    
    // Keep history size manageable
    if (this.logHistory.length > this.MAX_HISTORY_SIZE) {
      this.logHistory.shift();
    }

    // Output to console
    this.outputToConsole(logEntry);
  }

  /**
   * Output log entry to console
   */
  private outputToConsole(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const timestamp = entry.timestamp;
    const prefix = `[${timestamp}] [${entry.component}] [${levelName}]`;
    const message = `${prefix} ${entry.message}`;

    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(message);
        if (entry.error) {
          console.error('Error details:', entry.error);
        }
        if (entry.metadata) {
          console.error('Metadata:', entry.metadata);
        }
        break;
      case LogLevel.WARN:
        console.warn(message);
        if (entry.metadata) {
          console.warn('Metadata:', entry.metadata);
        }
        break;
      case LogLevel.INFO:
        console.log(message);
        if (entry.metadata) {
          console.log('Metadata:', entry.metadata);
        }
        break;
      case LogLevel.DEBUG:
        console.debug(message);
        if (entry.metadata) {
          console.debug('Metadata:', entry.metadata);
        }
        break;
    }
  }
}