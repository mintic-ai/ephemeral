// Main application entry point
export * from './models';
export * from './services';
export * from './api';

import Docker from 'dockerode';
import { ConfigManager } from './services/ConfigManager.js';
import { ContainerManager } from './services/ContainerManager.js';
import { ActivityMonitor } from './services/ActivityMonitor.js';
import { CleanupScheduler } from './services/CleanupScheduler.js';
import { ApiServer } from './api/server.js';
import { Logger } from './utils/Logger.js';
import { ErrorHandler } from './utils/ErrorHandler.js';

class DockerOnDemandApp {
  private configManager!: ConfigManager;
  private containerManager!: ContainerManager;
  private activityMonitor!: ActivityMonitor;
  private cleanupScheduler!: CleanupScheduler;
  private apiServer!: ApiServer;
  private docker!: Docker;
  private logger: Logger;
  private isShuttingDown: boolean = false;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Initialize all services in proper dependency order
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('DockerOnDemandApp', 'Starting application initialization');

      // 1. Initialize configuration manager first
      this.configManager = ConfigManager.getInstance();
      const config = this.configManager.loadConfig();
      this.logger.info('DockerOnDemandApp', 'Configuration loaded successfully', {
        dockerImage: config.docker.defaultImage,
        apiPort: config.api.port,
        cleanupInterval: config.cleanup.interval
      });

      // 2. Initialize Docker client
      this.docker = new Docker({
        socketPath: config.docker.socketPath
      });

      // Verify Docker connection
      await this.verifyDockerConnection();

      // 3. Initialize container manager
      this.containerManager = new ContainerManager(this.configManager);
      this.logger.info('DockerOnDemandApp', 'Container manager initialized');

      // 4. Initialize activity monitor
      this.activityMonitor = new ActivityMonitor(this.docker);
      this.logger.info('DockerOnDemandApp', 'Activity monitor initialized');

      // 5. Initialize cleanup scheduler
      this.cleanupScheduler = new CleanupScheduler(
        this.containerManager,
        this.activityMonitor,
        this.configManager
      );
      this.logger.info('DockerOnDemandApp', 'Cleanup scheduler initialized');

      // 6. Initialize API server
      this.apiServer = new ApiServer(
        this.containerManager,
        this.activityMonitor,
        this.configManager
      );
      this.logger.info('DockerOnDemandApp', 'API server initialized');

      this.logger.info('DockerOnDemandApp', 'All services initialized successfully');

    } catch (error) {
      const appError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('DockerOnDemandApp', 'Failed to initialize application', appError);
      throw new Error(`Application initialization failed: ${appError.message}`);
    }
  }

  /**
   * Start all services
   */
  async start(): Promise<void> {
    try {
      this.logger.info('DockerOnDemandApp', 'Starting all services');

      // Start cleanup scheduler
      this.cleanupScheduler.start();
      this.logger.info('DockerOnDemandApp', 'Cleanup scheduler started');

      // Start API server (this should be last as it indicates the system is ready)
      await this.apiServer.start();
      this.logger.info('DockerOnDemandApp', 'API server started');

      this.logger.info('DockerOnDemandApp', 'Docker On-Demand system is now running');

    } catch (error) {
      const appError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('DockerOnDemandApp', 'Failed to start application', appError);
      
      // Attempt cleanup if startup fails
      await this.shutdown();
      throw new Error(`Application startup failed: ${appError.message}`);
    }
  }

  /**
   * Graceful shutdown of all services
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn('DockerOnDemandApp', 'Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('DockerOnDemandApp', 'Starting graceful shutdown');

    try {
      // Stop cleanup scheduler first to prevent new cleanup operations
      if (this.cleanupScheduler) {
        this.cleanupScheduler.stop();
        this.logger.info('DockerOnDemandApp', 'Cleanup scheduler stopped');
      }

      // Stop activity monitoring
      if (this.activityMonitor) {
        this.activityMonitor.cleanup();
        this.logger.info('DockerOnDemandApp', 'Activity monitor stopped');
      }

      // Clean up any remaining containers (optional - could be configurable)
      if (this.containerManager) {
        await this.cleanupRemainingContainers();
      }

      this.logger.info('DockerOnDemandApp', 'Graceful shutdown completed');

    } catch (error) {
      const shutdownError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('DockerOnDemandApp', 'Error during shutdown', shutdownError);
      throw shutdownError;
    }
  }

  /**
   * Verify Docker daemon connection
   */
  private async verifyDockerConnection(): Promise<void> {
    try {
      await ErrorHandler.executeDockerOperation(
        () => this.docker.ping(),
        'verify Docker connection'
      );
      this.logger.info('DockerOnDemandApp', 'Docker connection verified');
    } catch (error) {
      const dockerError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('DockerOnDemandApp', 'Failed to connect to Docker daemon', dockerError);
      throw new Error(`Docker connection failed: ${dockerError.message}`);
    }
  }

  /**
   * Clean up remaining containers during shutdown
   */
  private async cleanupRemainingContainers(): Promise<void> {
    try {
      const containers = await this.containerManager.listContainers();
      
      if (containers.length > 0) {
        this.logger.info('DockerOnDemandApp', `Cleaning up ${containers.length} remaining containers during shutdown`);
        
        for (const container of containers) {
          try {
            await this.containerManager.removeContainer(container.id);
            this.logger.info('DockerOnDemandApp', `Removed container ${container.id} during shutdown`);
          } catch (error) {
            const containerError = error instanceof Error ? error : new Error(String(error));
            this.logger.warn('DockerOnDemandApp', `Failed to remove container ${container.id} during shutdown`, {
              containerId: container.id,
              error: containerError.message
            });
          }
        }
      }
    } catch (error) {
      const cleanupError = error instanceof Error ? error : new Error(String(error));
      this.logger.warn('DockerOnDemandApp', 'Error during container cleanup', {
        error: cleanupError.message
      });
    }
  }

  /**
   * Get application status
   */
  getStatus(): {
    initialized: boolean;
    running: boolean;
    shuttingDown: boolean;
    containerCount: number;
  } {
    return {
      initialized: !!this.configManager,
      running: !!this.apiServer && !this.isShuttingDown,
      shuttingDown: this.isShuttingDown,
      containerCount: this.containerManager ? this.containerManager.getActiveContainerCount() : 0
    };
  }
}

// Global application instance
let appInstance: DockerOnDemandApp | null = null;

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  try {
    // Create application instance
    appInstance = new DockerOnDemandApp();

    // Set up graceful shutdown handlers
    setupShutdownHandlers(appInstance);

    // Initialize and start the application
    await appInstance.initialize();
    await appInstance.start();

  } catch (error) {
    const mainError = error instanceof Error ? error : new Error(String(error));
    console.error('Failed to start Docker On-Demand system:', mainError.message);
    process.exit(1);
  }
}

/**
 * Set up graceful shutdown signal handlers
 */
function setupShutdownHandlers(app: DockerOnDemandApp): void {
  const shutdownHandler = async (signal: string) => {
    console.log(`\nReceived ${signal}, starting graceful shutdown...`);
    
    try {
      await app.shutdown();
      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      const shutdownError = error instanceof Error ? error : new Error(String(error));
      console.error('Error during shutdown:', shutdownError.message);
      process.exit(1);
    }
  };

  // Handle various shutdown signals
  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  process.on('SIGINT', () => shutdownHandler('SIGINT'));
  process.on('SIGUSR2', () => shutdownHandler('SIGUSR2')); // nodemon restart

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    if (appInstance) {
      try {
        await appInstance.shutdown();
      } catch (shutdownError) {
        console.error('Error during emergency shutdown:', shutdownError);
      }
    }
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    if (appInstance) {
      try {
        await appInstance.shutdown();
      } catch (shutdownError) {
        console.error('Error during emergency shutdown:', shutdownError);
      }
    }
    process.exit(1);
  });
}

// Export the application class and main function
export { DockerOnDemandApp, main };

// Start the application if this file is run directly (Node.js CommonJS style check)
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}