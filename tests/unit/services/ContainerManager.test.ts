import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { ContainerManager, ContainerManagerError } from '../../../src/services/ContainerManager.js';
import { ConfigManager } from '../../../src/services/ConfigManager.js';
import { Container, ContainerCreateRequest } from '../../../src/models/Container.js';
import Docker from 'dockerode';

// Mock dockerode
vi.mock('dockerode');
const MockedDocker = Docker as unknown as Mock;

// Mock ConfigManager
vi.mock('../../../src/services/ConfigManager.js');
const MockedConfigManager = ConfigManager as unknown as Mock;

describe('ContainerManager', () => {
  let containerManager: ContainerManager;
  let mockDocker: any;
  let mockConfigManager: any;
  let mockConfig: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock configuration
    mockConfig = {
      docker: {
        socketPath: '/var/run/docker.sock',
        defaultImage: 'alpine:latest',
        networkMode: 'bridge',
        portRange: {
          start: 8000,
          end: 8010
        }
      },
      api: {
        host: 'localhost',
        port: 3000,
        authEnabled: false
      }
    };

    // Mock ConfigManager
    mockConfigManager = {
      getConfig: vi.fn().mockReturnValue(mockConfig)
    };
    MockedConfigManager.getInstance = vi.fn().mockReturnValue(mockConfigManager);

    // Mock Docker container methods
    const mockDockerContainer = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      inspect: vi.fn().mockResolvedValue({
        Id: 'docker-container-id-123',
        State: { Running: true }
      })
    };

    // Mock Docker client
    mockDocker = {
      createContainer: vi.fn().mockResolvedValue(mockDockerContainer),
      getContainer: vi.fn().mockReturnValue(mockDockerContainer)
    };
    MockedDocker.mockImplementation(() => mockDocker);

    // Create ContainerManager instance
    containerManager = new ContainerManager(mockConfigManager);
  });

  describe('createContainer', () => {
    it('should create a container with default image', async () => {
      const request: ContainerCreateRequest = {};
      
      const container = await containerManager.createContainer(request);

      expect(container).toBeDefined();
      expect(container.id).toBeDefined();
      expect(container.dockerId).toBe('docker-container-id-123');
      expect(container.image).toBe('alpine:latest');
      expect(container.status).toBe('running');
      expect(container.connection.port).toBe(8000);
      expect(container.connection.host).toBe('localhost');
      expect(container.createdAt).toBeInstanceOf(Date);
      expect(container.lastActivity).toBeInstanceOf(Date);
    });

    it('should create a container with specified image', async () => {
      const request: ContainerCreateRequest = {
        image: 'nginx:latest'
      };
      
      const container = await containerManager.createContainer(request);

      expect(container.image).toBe('nginx:latest');
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Image: 'nginx:latest'
        })
      );
    });

    it('should create a container with environment variables', async () => {
      const request: ContainerCreateRequest = {
        environment: {
          NODE_ENV: 'production',
          PORT: '3000'
        }
      };
      
      await containerManager.createContainer(request);

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Env: ['NODE_ENV=production', 'PORT=3000']
        })
      );
    });

    it('should allocate sequential ports', async () => {
      const request: ContainerCreateRequest = {};
      
      const container1 = await containerManager.createContainer(request);
      const container2 = await containerManager.createContainer(request);

      expect(container1.connection.port).toBe(8000);
      expect(container2.connection.port).toBe(8001);
    });

    it('should throw error when no ports available', async () => {
      const request: ContainerCreateRequest = {};
      
      // Create containers to exhaust port range (8000-8010 = 11 ports)
      for (let i = 0; i < 11; i++) {
        await containerManager.createContainer(request);
      }

      // This should fail
      await expect(containerManager.createContainer(request))
        .rejects.toThrow(ContainerManagerError);
    });

    it('should throw ContainerManagerError when Docker creation fails', async () => {
      mockDocker.createContainer.mockRejectedValue(new Error('Docker daemon not available'));
      
      const request: ContainerCreateRequest = {};

      await expect(containerManager.createContainer(request))
        .rejects.toThrow(ContainerManagerError);
    });

    it('should generate unique container IDs', async () => {
      const request: ContainerCreateRequest = {};
      
      const container1 = await containerManager.createContainer(request);
      const container2 = await containerManager.createContainer(request);

      expect(container1.id).not.toBe(container2.id);
      expect(container1.id).toMatch(/^[a-f0-9]{8}$/);
      expect(container2.id).toMatch(/^[a-f0-9]{8}$/);
    });
  });

  describe('removeContainer', () => {
    let createdContainer: Container;

    beforeEach(async () => {
      const request: ContainerCreateRequest = {};
      createdContainer = await containerManager.createContainer(request);
    });

    it('should remove an existing container', async () => {
      await expect(containerManager.removeContainer(createdContainer.id))
        .resolves.not.toThrow();

      const mockDockerContainer = mockDocker.getContainer();
      expect(mockDockerContainer.stop).toHaveBeenCalledWith({ t: 10 });
      expect(mockDockerContainer.remove).toHaveBeenCalledWith({ force: true });
    });

    it('should throw error for non-existent container', async () => {
      await expect(containerManager.removeContainer('non-existent-id'))
        .rejects.toThrow(ContainerManagerError);
    });

    it('should continue removal even if stop fails', async () => {
      const mockDockerContainer = mockDocker.getContainer();
      mockDockerContainer.stop.mockRejectedValue(new Error('Container already stopped'));

      await expect(containerManager.removeContainer(createdContainer.id))
        .resolves.not.toThrow();

      expect(mockDockerContainer.remove).toHaveBeenCalled();
    });

    it('should throw error if Docker removal fails', async () => {
      const mockDockerContainer = mockDocker.getContainer();
      mockDockerContainer.remove.mockRejectedValue(new Error('Permission denied'));

      await expect(containerManager.removeContainer(createdContainer.id))
        .rejects.toThrow(ContainerManagerError);
    });

    it('should free up the allocated port after removal', async () => {
      const originalPort = createdContainer.connection.port;
      
      await containerManager.removeContainer(createdContainer.id);
      
      // Create a new container, it should reuse the freed port
      const newContainer = await containerManager.createContainer({});
      expect(newContainer.connection.port).toBe(originalPort);
    });
  });

  describe('getContainer', () => {
    let createdContainer: Container;

    beforeEach(async () => {
      const request: ContainerCreateRequest = {};
      createdContainer = await containerManager.createContainer(request);
    });

    it('should return container information for existing container', async () => {
      const container = await containerManager.getContainer(createdContainer.id);

      expect(container).toBeDefined();
      expect(container!.id).toBe(createdContainer.id);
      expect(container!.status).toBe('running');
    });

    it('should return null for non-existent container', async () => {
      const container = await containerManager.getContainer('non-existent-id');

      expect(container).toBeNull();
    });

    it('should update container status based on Docker state', async () => {
      const mockDockerContainer = mockDocker.getContainer();
      mockDockerContainer.inspect.mockResolvedValue({
        Id: 'docker-container-id-123',
        State: { Running: false }
      });

      const container = await containerManager.getContainer(createdContainer.id);

      expect(container!.status).toBe('stopped');
    });

    it('should remove container from registry if it no longer exists in Docker', async () => {
      const mockDockerContainer = mockDocker.getContainer();
      mockDockerContainer.inspect.mockRejectedValue(new Error('No such container'));

      const container = await containerManager.getContainer(createdContainer.id);

      expect(container).toBeNull();
      expect(containerManager.hasContainer(createdContainer.id)).toBe(false);
    });
  });

  describe('listContainers', () => {
    it('should return empty array when no containers exist', async () => {
      const containers = await containerManager.listContainers();

      expect(containers).toEqual([]);
    });

    it('should return all active containers', async () => {
      const request: ContainerCreateRequest = {};
      const container1 = await containerManager.createContainer(request);
      const container2 = await containerManager.createContainer(request);

      const containers = await containerManager.listContainers();

      expect(containers).toHaveLength(2);
      expect(containers.map(c => c.id)).toContain(container1.id);
      expect(containers.map(c => c.id)).toContain(container2.id);
    });

    it('should update container statuses when listing', async () => {
      const request: ContainerCreateRequest = {};
      await containerManager.createContainer(request);

      const mockDockerContainer = mockDocker.getContainer();
      mockDockerContainer.inspect.mockResolvedValue({
        Id: 'docker-container-id-123',
        State: { Running: false }
      });

      const containers = await containerManager.listContainers();

      expect(containers[0].status).toBe('stopped');
    });

    it('should remove containers that no longer exist in Docker', async () => {
      const request: ContainerCreateRequest = {};
      const container1 = await containerManager.createContainer(request);
      const container2 = await containerManager.createContainer(request);

      // Mock one container as no longer existing
      let callCount = 0;
      const mockDockerContainer = mockDocker.getContainer();
      mockDockerContainer.inspect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('No such container');
        }
        return Promise.resolve({
          Id: 'docker-container-id-123',
          State: { Running: true }
        });
      });

      const containers = await containerManager.listContainers();

      expect(containers).toHaveLength(1);
      expect(containers[0].id).toBe(container2.id);
    });
  });

  describe('utility methods', () => {
    it('should return correct active container count', async () => {
      expect(containerManager.getActiveContainerCount()).toBe(0);

      await containerManager.createContainer({});
      expect(containerManager.getActiveContainerCount()).toBe(1);

      await containerManager.createContainer({});
      expect(containerManager.getActiveContainerCount()).toBe(2);
    });

    it('should return container IDs', async () => {
      const container1 = await containerManager.createContainer({});
      const container2 = await containerManager.createContainer({});

      const ids = containerManager.getContainerIds();

      expect(ids).toHaveLength(2);
      expect(ids).toContain(container1.id);
      expect(ids).toContain(container2.id);
    });

    it('should check if container exists', async () => {
      const container = await containerManager.createContainer({});

      expect(containerManager.hasContainer(container.id)).toBe(true);
      expect(containerManager.hasContainer('non-existent')).toBe(false);
    });

    it('should clear all containers', async () => {
      await containerManager.createContainer({});
      await containerManager.createContainer({});

      expect(containerManager.getActiveContainerCount()).toBe(2);

      containerManager.clear();

      expect(containerManager.getActiveContainerCount()).toBe(0);
      expect(containerManager.getContainerIds()).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should create ContainerManagerError with proper properties', () => {
      const originalError = new Error('Original error');
      const error = new ContainerManagerError('Test message', 'TEST_CODE', originalError);

      expect(error.name).toBe('ContainerManagerError');
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.cause).toBe(originalError);
    });

    it('should handle unknown errors in createContainer', async () => {
      mockDocker.createContainer.mockRejectedValue('String error');

      await expect(containerManager.createContainer({}))
        .rejects.toThrow('Failed to create container: String error');
    });

    it('should handle unknown errors in removeContainer', async () => {
      const container = await containerManager.createContainer({});
      const mockDockerContainer = mockDocker.getContainer();
      mockDockerContainer.remove.mockRejectedValue('String error');

      await expect(containerManager.removeContainer(container.id))
        .rejects.toThrow(ContainerManagerError);
    });
  });
});