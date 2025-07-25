import express, { Express, Request, Response, NextFunction } from "express";
import { ContainerManager } from "../services/ContainerManager";
import { ActivityMonitor } from "../services/ActivityMonitor";
import { ConfigManager } from "../services/ConfigManager";
import { SystemConfig } from "../models/SystemConfig";
import { Logger } from "../utils/Logger";
import { ErrorHandler } from "../utils/ErrorHandler";
import Docker from "dockerode";

export interface ApiError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export class ApiServer {
  private app: Express;
  private config: SystemConfig;
  private containerManager: ContainerManager;
  private activityMonitor: ActivityMonitor;
  private docker: Docker;
  private logger: Logger;

  constructor(
    containerManager?: ContainerManager,
    activityMonitor?: ActivityMonitor,
    configManager?: ConfigManager
  ) {
    this.app = express();
    this.config = configManager
      ? configManager.getConfig()
      : ConfigManager.getInstance().getConfig();
    this.logger = Logger.getInstance();

    // Initialize Docker client
    this.docker = new Docker({
      socketPath: this.config.docker.socketPath,
    });

    // Initialize services
    this.containerManager =
      containerManager || new ContainerManager(configManager);
    this.activityMonitor = activityMonitor || new ActivityMonitor(this.docker);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Set up Express middleware
   */
  private setupMiddleware(): void {
    // Request logging middleware (before JSON parsing to catch all requests)
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      this.logger.info("ApiServer", `${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        userAgent: req.get("User-Agent"),
        ip: req.ip,
      });
      next();
    });

    // CORS middleware (basic implementation)
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
      );

      if (req.method === "OPTIONS") {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // JSON parsing middleware with error handling
    this.app.use(
      express.json({
        limit: "10mb",
        type: "application/json",
      })
    );

    // URL encoded parsing middleware
    this.app.use(express.urlencoded({ extended: true }));

    // JSON parsing error handler
    this.app.use(
      (error: any, _req: Request, res: Response, next: NextFunction) => {
        if (error instanceof SyntaxError && "body" in error) {
          this.sendErrorResponse(
            res,
            400,
            "INVALID_JSON",
            "Request body contains invalid JSON"
          );
          return;
        }
        next(error);
      }
    );
  }

  /**
   * Set up API routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get("/health", this.handleHealthCheck.bind(this));

    // Container endpoints
    this.app.post("/containers", this.handleCreateContainer.bind(this));
    this.app.get("/containers", this.handleListContainers.bind(this));
    this.app.get("/containers/:id", this.handleGetContainer.bind(this));
    this.app.delete("/containers/:id", this.handleDeleteContainer.bind(this));
  }

  /**
   * Set up error handling middleware
   */
  private setupErrorHandling(): void {
    // 404 handler
    this.app.use((req: Request, res: Response, _next: NextFunction) => {
      this.logger.warn(
        "ApiServer",
        `404 - Endpoint not found: ${req.method} ${req.path}`,
        {
          method: req.method,
          path: req.path,
          userAgent: req.get("User-Agent"),
          ip: req.ip,
        }
      );
      this.sendErrorResponse(
        res,
        404,
        "ENDPOINT_NOT_FOUND",
        `Endpoint ${req.method} ${req.path} not found`
      );
    });

    // Centralized error handling middleware
    this.app.use(this.errorHandlingMiddleware.bind(this));
  }

  /**
   * Centralized error handling middleware
   */
  private errorHandlingMiddleware(
    error: any,
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    // If response already sent, delegate to default Express error handler
    if (res.headersSent) {
      return next(error);
    }

    // Extract error information
    const errorInfo = ErrorHandler.extractErrorInfo(error);

    // Log the error with context
    this.logger.error(
      "ApiServer",
      "Request processing error",
      error instanceof Error ? error : new Error(String(error)),
      {
        method: req.method,
        path: req.path,
        userAgent: req.get("User-Agent"),
        ip: req.ip,
        requestBody: req.body,
        errorCode: errorInfo.code,
        stack: error?.stack,
      }
    );

    // Determine appropriate HTTP status code based on error type
    let statusCode = 500;
    let responseCode = errorInfo.code;
    let responseMessage = errorInfo.message;

    // Handle specific error types
    if (error instanceof Error) {
      switch (error.name) {
        case "ValidationError":
          statusCode = 400;
          responseCode = "VALIDATION_ERROR";
          break;
        case "ContainerManagerError":
          const containerError = error as any;
          responseCode = containerError.code || "CONTAINER_ERROR";
          responseMessage = containerError.message;

          // Map container error codes to HTTP status codes
          switch (containerError.code) {
            case "CONTAINER_NOT_FOUND":
            case "IMAGE_NOT_FOUND":
              statusCode = 404;
              break;
            case "DOCKER_DAEMON_UNAVAILABLE":
            case "DOCKER_CONNECTION_FAILED":
              statusCode = 503;
              break;
            case "RESOURCE_EXHAUSTED":
            case "PORT_ALLOCATION_FAILED":
              statusCode = 507;
              break;
            case "INVALID_CONFIGURATION":
            case "INVALID_REQUEST":
              statusCode = 400;
              break;
            default:
              statusCode = 500;
          }
          break;
        case "SyntaxError":
          if ("body" in error) {
            statusCode = 400;
            responseCode = "INVALID_JSON";
            responseMessage = "Request body contains invalid JSON";
          }
          break;
        case "TimeoutError":
          statusCode = 408;
          responseCode = "REQUEST_TIMEOUT";
          break;
        case "RateLimitError":
          statusCode = 429;
          responseCode = "RATE_LIMIT_EXCEEDED";
          break;
        default:
          // Keep default 500 status
          break;
      }
    }

    // Handle Docker-specific errors
    if (error?.code) {
      switch (error.code) {
        case "ECONNREFUSED":
        case "ENOTFOUND":
        case "ETIMEDOUT":
        case "ECONNRESET":
          statusCode = 503;
          responseCode = "SERVICE_UNAVAILABLE";
          responseMessage = "Docker service is temporarily unavailable";
          break;
        case "EACCES":
          statusCode = 403;
          responseCode = "PERMISSION_DENIED";
          responseMessage = "Insufficient permissions to access Docker";
          break;
        case "ENOSPC":
          statusCode = 507;
          responseCode = "INSUFFICIENT_STORAGE";
          responseMessage = "Insufficient disk space";
          break;
      }
    }

    // Send structured error response
    this.sendErrorResponse(res, statusCode, responseCode, responseMessage, {
      ...errorInfo.details,
      requestId: this.generateRequestId(),
      path: req.path,
      method: req.method,
    });
  }

  /**
   * Generate a unique request ID for error tracking
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start the API server
   */
  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const server = this.app.listen(
          this.config.api.port,
          this.config.api.host,
          () => {
            this.logger.info("ApiServer", `Server started successfully`, {
              host: this.config.api.host,
              port: this.config.api.port,
              url: `http://${this.config.api.host}:${this.config.api.port}`,
            });
            resolve();
          }
        );

        server.on("error", (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get the Express app instance (for testing)
   */
  public getApp(): Express {
    return this.app;
  }

  /**
   * Send a successful API response
   */
  private sendSuccessResponse<T>(
    res: Response,
    data: T,
    statusCode: number = 200
  ): void {
    const response: ApiResponse<T> = {
      success: true,
      data,
    };
    res.status(statusCode).json(response);
  }

  /**
   * Send an error API response
   */
  private sendErrorResponse(
    res: Response,
    statusCode: number,
    code: string,
    message: string,
    details?: any
  ): void {
    const response: ApiResponse = {
      success: false,
      error: {
        code,
        message,
        details,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(statusCode).json(response);
  }

  /**
   * Handle health check endpoint
   */
  private async handleHealthCheck(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const activeContainers = this.containerManager.getActiveContainerCount();
      const dockerInfo = await this.docker.info();

      const healthData = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        containers: {
          active: activeContainers,
          total: activeContainers,
        },
        docker: {
          version: dockerInfo.ServerVersion,
          containers: dockerInfo.Containers,
          images: dockerInfo.Images,
        },
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        },
      };

      this.sendSuccessResponse(res, healthData);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle container creation
   */
  private async handleCreateContainer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Validate request body
      const validationError = this.validateCreateContainerRequest(req.body);
      if (validationError) {
        const error = new Error(validationError);
        error.name = "ValidationError";
        throw error;
      }

      const createRequest = req.body;

      // Create container
      const container = await this.containerManager.createContainer(
        createRequest
      );

      // Start monitoring the container
      this.activityMonitor.startMonitoring(container.id, container.dockerId);

      // Convert to API response format
      const response = {
        id: container.id,
        status: container.status,
        connection: container.connection,
        created_at: container.createdAt.toISOString(),
        last_activity: container.lastActivity.toISOString(),
        image: container.image,
        environment: container.environment,
      };

      this.sendSuccessResponse(res, response, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle listing all containers
   */
  private async handleListContainers(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const containers = await this.containerManager.listContainers();

      const response = containers.map((container) => ({
        id: container.id,
        status: container.status,
        connection: container.connection,
        created_at: container.createdAt.toISOString(),
        last_activity: container.lastActivity.toISOString(),
        image: container.image,
        environment: container.environment,
      }));

      this.sendSuccessResponse(res, response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle getting a specific container
   */
  private async handleGetContainer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const containerId = req.params.id;

      if (
        !containerId ||
        typeof containerId !== "string" ||
        containerId.trim() === ""
      ) {
        const error = new Error(
          "Container ID is required and must be a non-empty string"
        );
        error.name = "ValidationError";
        throw error;
      }

      const container = await this.containerManager.getContainer(containerId);

      if (!container) {
        const error = ErrorHandler.createError(
          `Container with ID ${containerId} not found`,
          "CONTAINER_NOT_FOUND"
        );
        error.name = "ContainerManagerError";
        throw error;
      }

      // Get activity information
      const lastActivity = this.activityMonitor.getLastActivity(containerId);
      if (lastActivity) {
        container.lastActivity = lastActivity;
      }

      const response = {
        id: container.id,
        status: container.status,
        connection: container.connection,
        created_at: container.createdAt.toISOString(),
        last_activity: container.lastActivity.toISOString(),
        image: container.image,
        environment: container.environment,
        metadata: container.metadata,
      };

      this.sendSuccessResponse(res, response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle container deletion
   */
  private async handleDeleteContainer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const containerId = req.params.id;

      if (
        !containerId ||
        typeof containerId !== "string" ||
        containerId.trim() === ""
      ) {
        const error = new Error(
          "Container ID is required and must be a non-empty string"
        );
        error.name = "ValidationError";
        throw error;
      }

      // Check if container exists
      const container = await this.containerManager.getContainer(containerId);
      if (!container) {
        const error = ErrorHandler.createError(
          `Container with ID ${containerId} not found`,
          "CONTAINER_NOT_FOUND"
        );
        error.name = "ContainerManagerError";
        throw error;
      }

      // Stop monitoring
      this.activityMonitor.stopMonitoring(containerId);

      // Remove container
      await this.containerManager.removeContainer(containerId);

      // Remove activity record
      this.activityMonitor.removeActivityRecord(containerId);

      const response = {
        id: containerId,
        message: "Container removed successfully",
        timestamp: new Date().toISOString(),
      };

      this.sendSuccessResponse(res, response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate container creation request
   */
  private validateCreateContainerRequest(body: any): string | null {
    if (!body || typeof body !== "object") {
      return "Request body must be a valid JSON object";
    }

    // Image is optional (will use default if not provided)
    if (body.image !== undefined) {
      if (typeof body.image !== "string" || body.image.trim() === "") {
        return "Image must be a non-empty string if provided";
      }
    }

    // Environment is optional
    if (body.environment !== undefined) {
      if (
        typeof body.environment !== "object" ||
        Array.isArray(body.environment)
      ) {
        return "Environment must be an object if provided";
      }

      // Validate environment variables
      for (const [key, value] of Object.entries(body.environment)) {
        if (typeof key !== "string" || key.trim() === "") {
          return "Environment variable keys must be non-empty strings";
        }
        if (typeof value !== "string") {
          return "Environment variable values must be strings";
        }
      }
    }

    // Ports is optional and not currently used in implementation
    if (body.ports !== undefined) {
      if (!Array.isArray(body.ports)) {
        return "Ports must be an array if provided";
      }

      for (const port of body.ports) {
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          return "Ports must be valid port numbers (1-65535)";
        }
      }
    }

    return null;
  }
}
