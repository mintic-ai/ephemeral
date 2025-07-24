# Ephemeral

A Docker container orchestration system with automatic lifecycle management. This system provides on-demand container creation, activity monitoring, and automatic cleanup of inactive containers through a REST API.

## Features

- **On-Demand Container Creation**: Create Docker containers dynamically via REST API
- **Automatic Activity Monitoring**: Track container activity and usage patterns
- **Intelligent Cleanup**: Automatically remove inactive containers based on configurable timeouts
- **REST API**: Full REST API for container management operations
- **Health Monitoring**: Built-in health checks and system status reporting
- **Graceful Shutdown**: Proper cleanup of resources during application shutdown
- **Comprehensive Logging**: Structured logging for monitoring and debugging
- **Error Handling**: Robust error handling with retry mechanisms

## Use Cases

Ephemeral is designed for scenarios where you need dynamic, temporary container environments with automatic lifecycle management. Here are some practical applications:

### 🧪 **Development and Testing**

**Temporary Test Environments**

- Create isolated environments for feature testing
- Spin up database instances for integration tests
- Generate clean environments for each test suite run
- Automatic cleanup prevents resource accumulation

```bash
# Create a test database
curl -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d '{
    "image": "postgres:15-alpine",
    "environment": {
      "POSTGRES_DB": "testdb",
      "POSTGRES_USER": "testuser",
      "POSTGRES_PASSWORD": "testpass"
    }
  }'
```

**Code Review Environments**

- Deploy pull requests to temporary environments
- Provide reviewers with live instances to test changes
- Automatically clean up after review completion
- Support multiple concurrent review environments

### 🎓 **Educational and Training**

**Coding Workshops and Bootcamps**

- Provide each student with isolated development environments
- Pre-configured containers with specific tools and dependencies
- Automatic cleanup after session ends
- Scale to hundreds of concurrent users

```bash
# Create a Node.js development environment
curl -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d '{
    "image": "node:18-alpine",
    "environment": {
      "NODE_ENV": "development",
      "WORKSHOP_SESSION": "react-basics"
    }
  }'
```

**Interactive Tutorials**

- Hands-on learning environments for Docker, Kubernetes, etc.
- Sandboxed environments for security training
- Reset environments between tutorial steps
- Support for complex multi-container scenarios

### 🔬 **Research and Experimentation**

**Data Science Notebooks**

- On-demand Jupyter notebook instances
- Pre-loaded with datasets and libraries
- Automatic cleanup of completed experiments
- Resource isolation between different research projects

```bash
# Create a Jupyter environment
curl -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d '{
    "image": "jupyter/datascience-notebook",
    "environment": {
      "JUPYTER_ENABLE_LAB": "yes",
      "GRANT_SUDO": "yes"
    }
  }'
```

**Algorithm Testing**

- Isolated environments for testing different algorithms
- Consistent baseline environments for performance comparisons
- Automatic resource cleanup after experiments
- Support for GPU-enabled containers for ML workloads

### 🏢 **Enterprise Applications**

**Customer Demos and Trials**

- Instant demo environments for sales presentations
- Trial instances for potential customers
- Automatic cleanup after demo/trial period
- Customized environments per customer requirements

```bash
# Create a demo application
curl -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d '{
    "image": "mycompany/demo-app:latest",
    "environment": {
      "DEMO_MODE": "true",
      "CUSTOMER_ID": "prospect-123",
      "TRIAL_DURATION": "7d"
    }
  }'
```

**Microservices Development**

- Temporary service instances for development
- Integration testing between services
- Feature flag testing with isolated instances
- A/B testing with parallel service versions

### 🚀 **CI/CD and DevOps**

**Build and Test Environments**

- Isolated build environments for each commit
- Parallel testing across different configurations
- Temporary staging environments for deployment testing
- Automatic cleanup after pipeline completion

```bash
# Create a build environment
curl -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d '{
    "image": "node:18-alpine",
    "environment": {
      "CI": "true",
      "BUILD_ID": "build-456",
      "BRANCH": "feature/new-api"
    }
  }'
```

**Performance Testing**

- Isolated environments for load testing
- Consistent baseline for performance benchmarks
- Resource monitoring during tests
- Automatic cleanup of test infrastructure

### 🎮 **Gaming and Interactive Applications**

**Game Server Instances**

- On-demand game servers for multiplayer sessions
- Temporary servers for tournaments or events
- Automatic scaling based on player demand
- Resource cleanup when sessions end

```bash
# Create a Minecraft server
curl -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d '{
    "image": "itzg/minecraft-server",
    "environment": {
      "EULA": "TRUE",
      "MODE": "creative",
      "MAX_PLAYERS": "10"
    }
  }'
```

### 🔧 **Development Tools and Utilities**

**Database Instances**

- Temporary databases for development and testing
- Different database versions for compatibility testing
- Isolated instances for each developer
- Automatic cleanup prevents resource waste

```bash
# Create a Redis instance
curl -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d '{
    "image": "redis:7-alpine",
    "environment": {
      "REDIS_PASSWORD": "dev-password"
    }
  }'
```

**Development Services**

- Message queues, caches, and other infrastructure services
- Mock services for API development
- Temporary file storage and processing services
- Development proxies and load balancers

### 🌐 **Web Development and Hosting**

**Preview Environments**

- Temporary hosting for website previews
- Branch-specific deployments for review
- Client presentation environments
- A/B testing different versions

```bash
# Create a static site preview
curl -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx:alpine",
    "environment": {
      "SITE_VERSION": "v2.1.0",
      "PREVIEW_MODE": "true"
    }
  }'
```

### 📊 **Analytics and Monitoring**

**Temporary Analytics Environments**

- On-demand analytics tools (Grafana, Kibana)
- Temporary data processing environments
- Isolated environments for sensitive data analysis
- Automatic cleanup of processed data

### 🔒 **Security and Compliance**

**Security Testing**

- Isolated environments for penetration testing
- Vulnerability scanning in contained environments
- Security training sandboxes
- Compliance testing environments

```bash
# Create a security testing environment
curl -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d '{
    "image": "kalilinux/kali-rolling",
    "environment": {
      "SECURITY_TEST": "true",
      "TARGET_SCOPE": "internal"
    }
  }'
```

### 💡 **Benefits Across All Use Cases**

**Resource Efficiency**

- Automatic cleanup prevents resource waste
- Pay-per-use model for cloud deployments
- Optimal resource utilization
- Reduced infrastructure costs

**Developer Productivity**

- Instant environment provisioning
- Consistent, reproducible environments
- No manual cleanup required
- Focus on development, not infrastructure

**Scalability**

- Handle hundreds of concurrent environments
- Automatic scaling based on demand
- Resource limits prevent system overload
- Efficient container orchestration

**Operational Simplicity**

- Single API for all container operations
- Built-in monitoring and health checks
- Comprehensive logging and error handling
- Easy integration with existing systems

## Prerequisites

- **Node.js**: Version 18 or higher
- **Docker**: Docker daemon must be running and accessible
- **TypeScript**: For development (installed as dev dependency)

## Installation

### Option 1: Docker (Recommended)

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd ephemeral
   ```

2. **Build and run with Docker Compose**:

   ```bash
   # Build and start the application
   docker-compose up -d

   # View logs
   docker-compose logs -f ephemeral

   # Stop the application
   docker-compose down
   ```

3. **Or build Docker image manually**:

   ```bash
   # Build the image
   ./scripts/build-docker.sh

   # Run the container
   docker run -d \
     -p 3000:3000 \
     -v /var/run/docker.sock:/var/run/docker.sock:ro \
     --name ephemeral \
     ephemeral:latest
   ```

### Option 2: Local Development

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd ephemeral
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Build the project**:

   ```bash
   npm run build
   ```

## Configuration

The system can be configured using environment variables. All configuration options have sensible defaults.

### Environment Variables

| Variable                        | Default                | Description                            |
| ------------------------------- | ---------------------- | -------------------------------------- |
| `DOCKER_SOCKET_PATH`            | `/var/run/docker.sock` | Path to Docker daemon socket           |
| `DOCKER_DEFAULT_IMAGE`          | `nginx:alpine`         | Default Docker image for containers    |
| `DOCKER_NETWORK_MODE`           | `bridge`               | Docker network mode                    |
| `DOCKER_PORT_RANGE_START`       | `8000`                 | Start of port allocation range         |
| `DOCKER_PORT_RANGE_END`         | `9000`                 | End of port allocation range           |
| `CLEANUP_INTERVAL`              | `300`                  | Cleanup check interval (seconds)       |
| `CLEANUP_INACTIVITY_TIMEOUT`    | `300`                  | Container inactivity timeout (seconds) |
| `CLEANUP_MAX_RETRY_ATTEMPTS`    | `3`                    | Max retry attempts for failed cleanups |
| `CLEANUP_FORCE_REMOVAL_TIMEOUT` | `30`                   | Force removal timeout (seconds)        |
| `API_PORT`                      | `3000`                 | API server port                        |
| `API_HOST`                      | `localhost`            | API server host                        |
| `API_AUTH_ENABLED`              | `false`                | Enable API authentication              |

### Example Configuration

1. **Copy the example environment file**:

   ```bash
   cp .env.example .env
   ```

2. **Edit the `.env` file** to match your environment:

   ```bash
   # Docker Configuration
   DOCKER_SOCKET_PATH=/var/run/docker.sock
   DOCKER_DEFAULT_IMAGE=nginx:alpine
   DOCKER_PORT_RANGE_START=8000
   DOCKER_PORT_RANGE_END=9000

   # Cleanup Configuration
   CLEANUP_INTERVAL=300
   CLEANUP_INACTIVITY_TIMEOUT=600

   # API Configuration
   API_PORT=3000
   API_HOST=0.0.0.0
   ```

The `.env.example` file contains detailed comments and examples for all configuration options.

## Docker Deployment

### Docker Build Options

The project includes a comprehensive build script with multiple options:

```bash
# Basic build
./scripts/build-docker.sh

# Build with custom tag
./scripts/build-docker.sh -t v1.0.0

# Build and push to registry
./scripts/build-docker.sh -t v1.0.0 -p

# Multi-platform build
./scripts/build-docker.sh --platform linux/amd64,linux/arm64

# Development build (includes dev tools)
./scripts/build-docker.sh --target builder

# Build with custom arguments
./scripts/build-docker.sh --build-arg NODE_ENV=production
```

### Docker Compose Configurations

**Production deployment**:

```bash
# Start production services
docker-compose up -d

# View logs
docker-compose logs -f ephemeral

# Scale the application
docker-compose up -d --scale ephemeral=3

# Stop services
docker-compose down
```

**Development with hot reload**:

```bash
# Start development environment
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# View development logs
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f
```

### Docker Image Features

- **Multi-stage build**: Optimized production image size
- **Security hardened**: Non-root user, minimal attack surface
- **Health checks**: Built-in container health monitoring
- **Resource limits**: CPU and memory constraints
- **Alpine Linux**: Minimal base image for security and size

### Container Configuration

The Docker setup includes:

- **Port mapping**: API on port 3000, container range 8000-9000
- **Volume mounts**: Docker socket access, persistent logs and data
- **Environment variables**: Full configuration via environment
- **Network isolation**: Custom Docker network for security
- **Resource limits**: Configurable CPU and memory limits

## Usage

### Starting the Application

**With Docker (Recommended)**:

```bash
# Quick start
docker-compose up -d

# Development mode
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

**Local Development**:

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm start
```

The API server will start on `http://localhost:3000` by default.

### API Endpoints

#### Health Check

```bash
GET /health
```

Returns system health status and statistics.

**Response**:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-01-23T10:00:00.000Z",
    "version": "1.0.0",
    "containers": {
      "active": 2,
      "total": 2
    },
    "docker": {
      "version": "24.0.7",
      "containers": 5,
      "images": 12
    },
    "system": {
      "uptime": 3600,
      "memory": {
        "rss": 45678592,
        "heapTotal": 20971520,
        "heapUsed": 15728640
      }
    }
  }
}
```

#### Create Container

```bash
POST /containers
Content-Type: application/json

{
  "image": "nginx:alpine",
  "environment": {
    "ENV_VAR": "value"
  },
  "ports": [80]
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "id": "container-uuid",
    "status": "running",
    "connection": {
      "host": "localhost",
      "port": 8001,
      "url": "http://localhost:8001"
    },
    "created_at": "2025-01-23T10:00:00.000Z",
    "last_activity": "2025-01-23T10:00:00.000Z",
    "image": "nginx:alpine",
    "environment": {
      "ENV_VAR": "value"
    }
  }
}
```

#### List Containers

```bash
GET /containers
```

Returns all active containers.

#### Get Container Details

```bash
GET /containers/:id
```

Returns details for a specific container.

#### Delete Container

```bash
DELETE /containers/:id
```

Manually removes a container.

**Response**:

```json
{
  "success": true,
  "data": {
    "id": "container-uuid",
    "message": "Container removed successfully",
    "timestamp": "2025-01-23T10:05:00.000Z"
  }
}
```

### Example Usage

**Create a container**:

```bash
curl -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx:alpine",
    "environment": {
      "NGINX_PORT": "80"
    }
  }'
```

**List all containers**:

```bash
curl http://localhost:3000/containers
```

**Check system health**:

```bash
curl http://localhost:3000/health
```

## Development

### Scripts

- `npm run build` - Build the TypeScript project
- `npm run dev` - Start in development mode with hot reload
- `npm start` - Start the built application
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Run ESLint
- `npm run clean` - Clean build artifacts

### Testing

The project includes comprehensive unit and integration tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Project Structure

```
src/
├── api/           # REST API server and routes
├── models/        # Data models and interfaces
├── services/      # Core business logic services
├── utils/         # Utility functions and helpers
└── index.ts       # Main application entry point

tests/
├── unit/          # Unit tests for individual components
└── integration/   # Integration tests for complete workflows
```

## Architecture

The system follows a modular architecture with clear separation of concerns:

- **ContainerManager**: Handles Docker container lifecycle operations
- **ActivityMonitor**: Tracks container activity and usage patterns
- **CleanupScheduler**: Manages automatic cleanup of inactive containers
- **ConfigManager**: Handles system configuration and validation
- **ApiServer**: Provides REST API endpoints for external interaction

## Monitoring and Logging

The system provides comprehensive logging and monitoring:

- **Structured Logging**: All operations are logged with contextual information
- **Health Checks**: Built-in health monitoring endpoint
- **Error Tracking**: Detailed error reporting with stack traces
- **Activity Monitoring**: Container usage tracking and reporting

## Error Handling

The system includes robust error handling:

- **Graceful Degradation**: System continues operating when individual components fail
- **Retry Logic**: Automatic retry for transient failures
- **Structured Errors**: Consistent error response format
- **Docker Failures**: Specific handling for Docker daemon issues

## Security Considerations

- **Docker Socket Access**: Ensure proper permissions for Docker socket access
- **Port Allocation**: Configure appropriate port ranges for container exposure
- **Network Security**: Consider network isolation for containers
- **Resource Limits**: Monitor system resources to prevent exhaustion

## Troubleshooting

### Common Issues

**Docker daemon not accessible**:

```
Error: Docker connection failed: connect ENOENT /var/run/docker.sock
```

- Ensure Docker daemon is running
- Check Docker socket path configuration
- Verify user permissions for Docker socket access

**Port allocation failures**:

```
Error: PORT_ALLOCATION_FAILED
```

- Check if configured port range is available
- Ensure no conflicts with other services
- Consider expanding the port range

**Container creation failures**:

```
Error: DOCKER_DAEMON_UNAVAILABLE
```

- Verify Docker daemon is running and accessible
- Check Docker image availability
- Review Docker daemon logs

### Logs

Application logs are written to stdout with structured JSON format. Use log aggregation tools for production monitoring.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

MIT License - see LICENSE file for details.
