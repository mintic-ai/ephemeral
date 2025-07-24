---
title: "Development Environment Setup"
description: "Step-by-step guide to set up the Ephemeral development environment"
audience: ["developers"]
last_updated: "2025-01-23"
version: "1.0.0"
related_docs:
  - "contributing.md"
  - "testing.md"
  - "../api/README.md"
---

# Development Environment Setup

This guide will help you set up a complete development environment for the Ephemeral system.

## Prerequisites

Before setting up the development environment, ensure you have the following installed:

### Required Software

1. **Node.js** (version 18 or higher)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify installation: `node --version`

2. **npm** (comes with Node.js)
   - Verify installation: `npm --version`

3. **Docker** (Docker Desktop or Docker Engine)
   - Download Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop/)
   - Verify installation: `docker --version`
   - Ensure Docker daemon is running: `docker ps`

4. **Git**
   - Download from [git-scm.com](https://git-scm.com/)
   - Verify installation: `git --version`

### Optional but Recommended

1. **Visual Studio Code** or your preferred IDE
2. **Docker Desktop** (for GUI management of containers)
3. **Postman** or similar API testing tool

## Installation Steps

### 1. Clone the Repository

```bash
git clone <repository-url>
cd ephemeral
```

### 2. Install Dependencies

Install all project dependencies:

```bash
npm install
```

This will install both production and development dependencies as defined in `package.json`.

### 3. Environment Configuration

Create your local environment configuration:

```bash
cp .env.example .env
```

Edit the `.env` file to match your local setup. Key settings for development:

```bash
# Docker Configuration
DOCKER_SOCKET_PATH=/var/run/docker.sock
DOCKER_DEFAULT_IMAGE=nginx:alpine
DOCKER_PORT_RANGE_START=8000
DOCKER_PORT_RANGE_END=9000

# API Configuration
API_PORT=3000
API_HOST=localhost

# Development-friendly cleanup settings
CLEANUP_INTERVAL=300
CLEANUP_INACTIVITY_TIMEOUT=600
```

### 4. Build the Project

Compile TypeScript to JavaScript:

```bash
npm run build
```

### 5. Verify Installation

Run the test suite to ensure everything is working:

```bash
npm test
```

## Development Workflow

### Starting the Development Server

For development with hot reload:

```bash
npm run dev
```

This starts the application using `ts-node` with automatic restart on file changes.

### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (recommended for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Code Quality

```bash
# Run linting
npm run lint

# Build the project
npm run build

# Clean build artifacts
npm run clean
```

## Verification Steps

### 1. Docker Connection Test

Verify Docker is accessible:

```bash
docker ps
```

Should return a list of running containers (may be empty).

### 2. API Server Test

Start the development server:

```bash
npm run dev
```

In another terminal, test the health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-01-23T10:00:00.000Z",
    "version": "1.0.0"
  }
}
```

### 3. Container Creation Test

Test container creation:

```bash
curl -X POST http://localhost:3000/containers \
  -H "Content-Type: application/json" \
  -d '{"image": "nginx:alpine"}'
```

Should return a container creation response with connection details.

## Common Setup Issues

### Docker Socket Permission Issues

**Problem**: `Error: Docker connection failed: connect ENOENT /var/run/docker.sock`

**Solutions**:
- Ensure Docker daemon is running: `sudo systemctl start docker` (Linux)
- Add user to docker group: `sudo usermod -aG docker $USER` (Linux)
- Restart terminal/IDE after group changes
- On macOS with Docker Desktop, ensure Docker Desktop is running

### Port Already in Use

**Problem**: `Error: listen EADDRINUSE :::3000`

**Solutions**:
- Change `API_PORT` in `.env` file to an available port
- Kill process using port 3000: `lsof -ti:3000 | xargs kill -9`
- Use a different port: `API_PORT=3001 npm run dev`

### Node.js Version Issues

**Problem**: `Error: Unsupported Node.js version`

**Solutions**:
- Install Node.js 18 or higher
- Use Node Version Manager (nvm): `nvm install 18 && nvm use 18`
- Update package.json engines field if needed

### TypeScript Compilation Errors

**Problem**: TypeScript compilation fails

**Solutions**:
- Ensure TypeScript is installed: `npm install -g typescript`
- Check `tsconfig.json` configuration
- Clear node_modules and reinstall: `rm -rf node_modules package-lock.json && npm install`

### Docker Image Pull Issues

**Problem**: `Error: Unable to pull image nginx:alpine`

**Solutions**:
- Check internet connection
- Verify Docker Hub access
- Try pulling manually: `docker pull nginx:alpine`
- Use alternative image in `.env`: `DOCKER_DEFAULT_IMAGE=httpd:alpine`

### Test Failures

**Problem**: Tests fail during setup verification

**Solutions**:
- Ensure Docker is running and accessible
- Check if ports in test configuration are available
- Run tests individually to isolate issues: `npm test -- --reporter=verbose`
- Clear test cache: `npm run test -- --clearCache`

## IDE Configuration

### Visual Studio Code

Recommended extensions:
- TypeScript and JavaScript Language Features (built-in)
- ESLint
- Prettier
- Docker
- REST Client (for API testing)

Workspace settings (`.vscode/settings.json`):
```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### Debugging Configuration

VS Code debug configuration (`.vscode/launch.json`):
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Development Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/ts-node",
      "args": ["src/index.ts"],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "restart": true,
      "runtimeArgs": ["--nolazy"]
    }
  ]
}
```

## Next Steps

After completing the setup:

1. Read the [Contributing Guidelines](contributing.md)
2. Review [Coding Standards](coding-standards.md)
3. Explore [Testing Documentation](testing.md)
4. Check out the [API Documentation](../api/README.md)

## Getting Help

If you encounter issues not covered in this guide:

1. Check the [Debugging Guide](debugging.md)
2. Review existing GitHub issues
3. Create a new issue with detailed error information
4. Include your environment details (OS, Node.js version, Docker version)

## Environment Details

For reference, here are the key files and their purposes:

- `package.json` - Project dependencies and scripts
- `tsconfig.json` - TypeScript compilation configuration
- `.env` - Environment variables (local configuration)
- `.env.example` - Template for environment configuration
- `vitest.config.ts` - Test configuration
- `.eslintrc.js` - Code linting rules