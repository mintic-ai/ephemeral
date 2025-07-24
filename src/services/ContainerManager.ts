import Docker from 'dockerode';
import { Container, ContainerCreateRequest } from '../models/Container.js';
import { ConfigManager } from './ConfigManager.js';
import { SystemConfig } from '../models/SystemConfig.js';
import { Logger } from '../utils/Logger.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { randomUUID } from 'crypto';

export class ContainerManagerError extends Error {
  constructor(message: string, public code: string, public cause?: Error) {
    super(message);
    this.name = 'ContainerManagerError';
  }
}

export class ContainerManager {
  private docker: Docker;
  private config: SystemConfig;
  private containers: Map<string, Container> = new Map();
  private usedPorts: Set<number> = new Set();
  private logger: Logger;

  constructor(configManager?: ConfigManager) {
    const config = configManager ? configManager.getConfig() : ConfigManager.getInstance().getConfig();
    this.config = config;
    this.logger = Logger.getInstance();
    
    // Initialize Docker client
    this.docker = new Docker({
      socketPath: this.config.docker.socketPath
    });
  }

  /**
   * Create a new container with unique ID and port allocation
   */
  async createContainer(request: ContainerCreateRequest): Promise<Container> {
    const containerId = this.generateUniqueId();
    let allocatedPort: number | null = null;

    try {
      this.logger.info('ContainerManager', `Starting container creation`, {
        containerId,
        image: request.image || this.config.docker.defaultImage,
        environment: Object.keys(request.environment || {})
      });

      // Allocate port for the container
      allocatedPort = this.allocatePort();
      
      // Use provided image or default
      const image = request.image || this.config.docker.defaultImage;
      
      // Prepare container configuration
      const containerConfig = {
        Image: image,
        Env: this.formatEnvironmentVariables(request.environment || {}),
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: {
            '80/tcp': [{ HostPort: allocatedPort.toString() }]
          },
          NetworkMode: this.config.docker.networkMode,
          AutoRemove: false
        },
        name: `ephemeral-${containerId}`
      };

      // Create container using Docker API with retry logic
      const dockerContainer = await ErrorHandler.executeDockerOperation(
        () => this.docker.createContainer(containerConfig),
        `create container ${containerId}`
      );
      
      // Start the container with retry logic
      await ErrorHandler.executeDockerOperation(
        () => dockerContainer.start(),
        `start container ${containerId}`
      );
      
      // Get container info to verify it's running
      const containerInfo = await ErrorHandler.executeDockerOperation(
        () => dockerContainer.inspect(),
        `inspect container ${containerId}`
      );
      
      // Create our container object
      const container: Container = {
        id: containerId,
        dockerId: containerInfo.Id,
        image: image,
        status: 'running',
        createdAt: new Date(),
        lastActivity: new Date(),
        connection: {
          host: this.config.api.host === '0.0.0.0' ? 'localhost' : this.config.api.host,
          port: allocatedPort,
          url: `http://${this.config.api.host === '0.0.0.0' ? 'localhost' : this.config.api.host}:${allocatedPort}`
        },
        environment: request.environment || {},
        metadata: {
          dockerName: containerConfig.name,
          networkMode: this.config.docker.networkMode
        }
      };

      // Store container in our registry
      this.containers.set(containerId, container);
      
      this.logger.logContainerOperation('create', containerId, true, {
        dockerId: containerInfo.Id,
        port: allocatedPort,
        image
      });
      
      return container;
      
    } catch (error) {
      // Clean up allocated port if container creation failed
      if (allocatedPort !== null) {
        this.usedPorts.delete(allocatedPort);
      }

      const containerError = error instanceof Error ? error : new Error(String(error));
      this.logger.logContainerOperation('create', containerId, false, {
        port: allocatedPort,
        image: request.image || this.config.docker.defaultImage
      }, containerError);

      if (error instanceof Error) {
        throw new ContainerManagerError(
          `Failed to create container: ${error.message}`,
          'CONTAINER_CREATE_FAILED',
          error
        );
      }
      throw new ContainerManagerError(
        'Failed to create container: Unknown error',
        'CONTAINER_CREATE_FAILED'
      );
    }
  }

  /**
   * Remove a container by ID with proper cleanup
   */
  async removeContainer(containerId: string): Promise<void> {
    try {
      this.logger.info('ContainerManager', `Starting container removal`, {
        containerId
      });

      const container = this.containers.get(containerId);
      if (!container) {
        throw new ContainerManagerError(
          `Container with ID ${containerId} not found`,
          'CONTAINER_NOT_FOUND'
        );
      }

      // Get Docker container
      const dockerContainer = this.docker.getContainer(container.dockerId);
      
      try {
        // Stop the container first with retry logic
        await ErrorHandler.executeDockerOperation(
          () => dockerContainer.stop({ t: 10 }),
          `stop container ${containerId}`,
          { maxAttempts: 2 } // Fewer retries for stop operation
        );
      } catch (stopError) {
        // Container might already be stopped, log warning and continue with removal
        this.logger.warn('ContainerManager', `Could not stop container ${containerId}, continuing with removal`, {
          containerId,
          dockerId: container.dockerId,
          error: stopError instanceof Error ? stopError.message : String(stopError)
        });
      }

      try {
        // Remove the container with retry logic
        await ErrorHandler.executeDockerOperation(
          () => dockerContainer.remove({ force: true }),
          `remove container ${containerId}`
        );
      } catch (removeError) {
        const error = removeError instanceof Error ? removeError : new Error(String(removeError));
        this.logger.logContainerOperation('remove', containerId, false, {
          dockerId: container.dockerId,
          port: container.connection.port
        }, error);

        throw new ContainerManagerError(
          `Failed to remove Docker container: ${error.message}`,
          'DOCKER_REMOVE_FAILED',
          error
        );
      }

      // Free up the allocated port
      this.usedPorts.delete(container.connection.port);
      
      // Remove from our registry
      this.containers.delete(containerId);
      
      this.logger.logContainerOperation('remove', containerId, true, {
        dockerId: container.dockerId,
        port: container.connection.port
      });
      
    } catch (error) {
      if (error instanceof ContainerManagerError) {
        // Re-log the error if it's already a ContainerManagerError but wasn't logged yet
        if (error.code !== 'DOCKER_REMOVE_FAILED') {
          this.logger.logContainerOperation('remove', containerId, false, {}, error);
        }
        throw error;
      }
      
      const containerError = error instanceof Error ? error : new Error(String(error));
      this.logger.logContainerOperation('remove', containerId, false, {}, containerError);
      
      throw new ContainerManagerError(
        `Failed to remove container: ${containerError.message}`,
        'CONTAINER_REMOVE_FAILED',
        containerError
      );
    }
  }

  /**
   * Get container information by ID
   */
  async getContainer(containerId: string): Promise<Container | null> {
    const container = this.containers.get(containerId);
    if (!container) {
      return null;
    }

    try {
      // Verify container still exists in Docker
      const dockerContainer = this.docker.getContainer(container.dockerId);
      const containerInfo = await dockerContainer.inspect();
      
      // Update status based on Docker state
      const isRunning = containerInfo.State.Running;
      container.status = isRunning ? 'running' : 'stopped';
      
      return container;
    } catch (error) {
      // Container no longer exists in Docker, remove from our registry
      this.containers.delete(containerId);
      this.usedPorts.delete(container.connection.port);
      return null;
    }
  }

  /**
   * List all managed containers
   */
  async listContainers(): Promise<Container[]> {
    const containers: Container[] = [];
    
    // Check each container's status with Docker
    for (const [containerId, container] of this.containers.entries()) {
      try {
        const dockerContainer = this.docker.getContainer(container.dockerId);
        const containerInfo = await dockerContainer.inspect();
        
        // Update status
        const isRunning = containerInfo.State.Running;
        container.status = isRunning ? 'running' : 'stopped';
        
        containers.push(container);
      } catch (error) {
        // Container no longer exists in Docker, remove from registry
        this.containers.delete(containerId);
        this.usedPorts.delete(container.connection.port);
      }
    }
    
    return containers;
  }

  /**
   * Generate a unique container ID
   */
  private generateUniqueId(): string {
    let id: string;
    do {
      id = randomUUID().substring(0, 8);
    } while (this.containers.has(id));
    
    return id;
  }

  /**
   * Allocate an available port from the configured range
   */
  private allocatePort(): number {
    const { start, end } = this.config.docker.portRange;
    
    for (let port = start; port <= end; port++) {
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    
    throw new ContainerManagerError(
      `No available ports in range ${start}-${end}`,
      'NO_AVAILABLE_PORTS'
    );
  }

  /**
   * Format environment variables for Docker container
   */
  private formatEnvironmentVariables(env: Record<string, string>): string[] {
    return Object.entries(env).map(([key, value]) => `${key}=${value}`);
  }

  /**
   * Get the count of active containers
   */
  getActiveContainerCount(): number {
    return this.containers.size;
  }

  /**
   * Get all container IDs
   */
  getContainerIds(): string[] {
    return Array.from(this.containers.keys());
  }

  /**
   * Check if a container exists
   */
  hasContainer(containerId: string): boolean {
    return this.containers.has(containerId);
  }

  /**
   * Clear all containers (for testing purposes)
   */
  clear(): void {
    this.containers.clear();
    this.usedPorts.clear();
  }
}