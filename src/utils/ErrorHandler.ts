import { Logger } from './Logger.js';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error | undefined;
  attempts: number;
  totalDuration: number;
}

export class ErrorHandler {
  private static logger = Logger.getInstance();

  /**
   * Default retry options for Docker API operations
   */
  public static readonly DEFAULT_DOCKER_RETRY_OPTIONS: RetryOptions = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    retryableErrors: [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET',
      'socket hang up',
      'connect ECONNREFUSED',
      'Request timeout'
    ]
  };

  /**
   * Execute a function with exponential backoff retry logic
   */
  public static async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = ErrorHandler.DEFAULT_DOCKER_RETRY_OPTIONS,
    operationName: string = 'operation'
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    let attempts = 0;

    for (attempts = 1; attempts <= options.maxAttempts; attempts++) {
      try {
        ErrorHandler.logger.debug('ErrorHandler', `Attempting ${operationName} (attempt ${attempts}/${options.maxAttempts})`);
        
        const result = await operation();
        
        const duration = Date.now() - startTime;
        ErrorHandler.logger.info('ErrorHandler', `${operationName} succeeded on attempt ${attempts}`, {
          attempts,
          duration
        });

        return {
          success: true,
          result,
          attempts,
          totalDuration: duration
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        ErrorHandler.logger.warn('ErrorHandler', `${operationName} failed on attempt ${attempts}: ${lastError.message}`, {
          attempts,
          maxAttempts: options.maxAttempts,
          error: lastError.message
        });

        // Check if this is the last attempt
        if (attempts >= options.maxAttempts) {
          break;
        }

        // Check if error is retryable
        if (!ErrorHandler.isRetryableError(lastError, options.retryableErrors)) {
          ErrorHandler.logger.error('ErrorHandler', `${operationName} failed with non-retryable error`, lastError, {
            attempts,
            errorType: 'non-retryable'
          });
          break;
        }

        // Calculate delay with exponential backoff
        const delay = ErrorHandler.calculateBackoffDelay(attempts, options);
        
        ErrorHandler.logger.debug('ErrorHandler', `Waiting ${delay}ms before retry ${attempts + 1}`, {
          delay,
          nextAttempt: attempts + 1
        });

        await ErrorHandler.sleep(delay);
      }
    }

    const totalDuration = Date.now() - startTime;
    ErrorHandler.logger.error('ErrorHandler', `${operationName} failed after ${attempts} attempts`, lastError, {
      attempts,
      totalDuration
    });

    return {
      success: false,
      error: lastError,
      attempts,
      totalDuration
    };
  }

  /**
   * Check if an error is retryable based on error patterns
   */
  public static isRetryableError(error: Error, retryableErrors?: string[]): boolean {
    if (!retryableErrors || retryableErrors.length === 0) {
      return true; // Retry all errors if no specific patterns provided
    }

    const errorMessage = error.message.toLowerCase();
    const errorCode = (error as any).code?.toLowerCase() || '';
    const errorName = error.name.toLowerCase();

    return retryableErrors.some(pattern => {
      const patternLower = pattern.toLowerCase();
      return errorMessage.includes(patternLower) || 
             errorCode.includes(patternLower) || 
             errorName.includes(patternLower);
    });
  }

  /**
   * Calculate exponential backoff delay
   */
  public static calculateBackoffDelay(attempt: number, options: RetryOptions): number {
    const exponentialDelay = options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * exponentialDelay;
    const delayWithJitter = exponentialDelay + jitter;
    
    return Math.min(delayWithJitter, options.maxDelayMs);
  }

  /**
   * Sleep for specified milliseconds
   */
  public static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wrap Docker API calls with retry logic
   */
  public static async executeDockerOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    customOptions?: Partial<RetryOptions>
  ): Promise<T> {
    const options = { ...ErrorHandler.DEFAULT_DOCKER_RETRY_OPTIONS, ...customOptions };
    const result = await ErrorHandler.executeWithRetry(operation, options, operationName);
    
    if (!result.success) {
      throw result.error || new Error(`${operationName} failed after ${result.attempts} attempts`);
    }
    
    return result.result!;
  }

  /**
   * Create a standardized error with additional context
   */
  public static createError(
    message: string,
    code: string,
    cause?: Error,
    metadata?: any
  ): Error & { code: string; metadata?: any; cause?: Error | undefined } {
    const error = new Error(message) as Error & { code: string; metadata?: any; cause?: Error | undefined };
    error.code = code;
    error.cause = cause;
    error.metadata = metadata;
    return error;
  }

  /**
   * Extract error information for API responses
   */
  public static extractErrorInfo(error: any): { code: string; message: string; details?: any } {
    if (error && typeof error === 'object') {
      return {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message || 'An unknown error occurred',
        details: error.metadata || error.details
      };
    }
    
    const errorString = error != null ? String(error) : '';
    return {
      code: 'UNKNOWN_ERROR',
      message: errorString || 'An unknown error occurred'
    };
  }

  /**
   * Log and handle uncaught exceptions
   */
  public static setupGlobalErrorHandlers(): void {
    process.on('uncaughtException', (error: Error) => {
      ErrorHandler.logger.error('Process', 'Uncaught exception', error, {
        stack: error.stack
      });
      
      // Give time for logs to flush before exiting
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      ErrorHandler.logger.error('Process', 'Unhandled promise rejection', error, {
        promise: promise.toString(),
        stack: error.stack
      });
    });

    process.on('SIGTERM', () => {
      ErrorHandler.logger.info('Process', 'Received SIGTERM, shutting down gracefully');
    });

    process.on('SIGINT', () => {
      ErrorHandler.logger.info('Process', 'Received SIGINT, shutting down gracefully');
    });
  }
}