---
title: "API Examples and Testing"
description: "Postman collection and examples for testing the Docker On-Demand API"
audience: ["developers", "testers", "api-users"]
last_updated: "2025-01-23"
version: "1.0.0"
related_docs:
  - "../endpoints.md"
  - "../authentication.md"
  - "../errors.md"
---

# API Examples and Testing

This directory contains comprehensive examples and testing tools for the Docker On-Demand API, including Postman collections, cURL examples, and JavaScript client examples.

## Files Overview

- **`postman-collection.json`** - Complete Postman collection with all API endpoints
- **`postman-environment.json`** - Environment variables for Postman testing
- **`curl-examples.md`** - cURL command examples for all endpoints
- **`javascript-examples.md`** - JavaScript client examples using fetch API

## Postman Collection

### Features

The Postman collection includes:

- **Complete API Coverage**: All available endpoints with proper request/response examples
- **Automated Testing**: Built-in test scripts for response validation
- **Environment Variables**: Configurable base URL and dynamic container ID management
- **Error Scenarios**: Test cases for error handling and validation
- **Documentation**: Detailed descriptions for each endpoint

### Collection Structure

```
Docker On-Demand API/
├── Health Check/
│   └── Get System Health
├── Container Management/
│   ├── Create Container (Default)
│   ├── Create Container (Custom Image)
│   ├── Create Container (With Environment)
│   ├── List All Containers
│   ├── Get Container Details
│   └── Delete Container
└── Error Scenarios/
    ├── Invalid JSON Request
    ├── Container Not Found
    └── Invalid Endpoint
```

### Setup Instructions

#### 1. Import Collection

**Option A: Import from File**
1. Open Postman
2. Click "Import" button
3. Select "Upload Files"
4. Choose `postman-collection.json`
5. Click "Import"

**Option B: Import from URL**
```
https://raw.githubusercontent.com/your-repo/ephemeral/main/docs/api/examples/postman-collection.json
```

#### 2. Import Environment

1. In Postman, click the gear icon (Manage Environments)
2. Click "Import"
3. Select `postman-environment.json`
4. Click "Import"
5. Select "Docker On-Demand Environment" from the environment dropdown

#### 3. Configure Environment

Update the environment variables as needed:

| Variable | Default Value | Description |
|----------|---------------|-------------|
| `baseUrl` | `http://localhost:3000` | Base URL for the API |
| `apiHost` | `localhost` | API server host |
| `apiPort` | `3000` | API server port |
| `containerId` | `` | Container ID (auto-populated) |
| `testImage` | `nginx:alpine` | Default test image |
| `testImageNode` | `node:18-alpine` | Node.js test image |

### Usage Guide

#### Basic Workflow

1. **Health Check**: Start with "Get System Health" to verify the API is running
2. **Create Container**: Use any of the create container requests
3. **List Containers**: Verify the container was created
4. **Get Details**: Get detailed information about the container
5. **Delete Container**: Clean up the test container

#### Automated Testing

Each request includes automated tests that verify:

- **Response Status**: Correct HTTP status codes
- **Response Structure**: Required fields and data types
- **Business Logic**: Container creation, status updates, etc.
- **Error Handling**: Proper error responses and codes

#### Variable Management

The collection automatically manages variables:

- **Container ID**: Automatically captured from create responses
- **Base URL**: Configurable for different environments
- **Test Data**: Predefined test images and configurations

### Test Scenarios

#### Happy Path Testing

1. **System Health**: Verify API availability
2. **Container Lifecycle**: Create → List → Get → Delete
3. **Different Configurations**: Test various container options
4. **Multiple Containers**: Create and manage multiple containers

#### Error Testing

1. **Invalid JSON**: Test malformed request bodies
2. **Missing Resources**: Test non-existent container IDs
3. **Invalid Endpoints**: Test undefined API routes
4. **Validation Errors**: Test invalid parameters

#### Performance Testing

1. **Response Times**: All requests include response time validation
2. **Concurrent Requests**: Test multiple simultaneous requests
3. **Load Testing**: Use Postman's collection runner for load tests

### Advanced Usage

#### Collection Runner

1. Select the collection
2. Click "Run" to open Collection Runner
3. Configure iterations and delay
4. Run automated test suite

#### Newman (CLI)

Run tests from command line:

```bash
# Install Newman
npm install -g newman

# Run collection
newman run postman-collection.json -e postman-environment.json

# Generate HTML report
newman run postman-collection.json -e postman-environment.json -r html
```

#### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run API Tests
  run: |
    npm install -g newman
    newman run docs/api/examples/postman-collection.json \
      -e docs/api/examples/postman-environment.json \
      --reporters cli,junit \
      --reporter-junit-export results.xml
```

## Environment Configuration

### Local Development

```json
{
  "baseUrl": "http://localhost:3000",
  "apiHost": "localhost",
  "apiPort": "3000"
}
```

### Docker Environment

```json
{
  "baseUrl": "http://ephemeral:3000",
  "apiHost": "ephemeral",
  "apiPort": "3000"
}
```

### Production Environment

```json
{
  "baseUrl": "https://api.yourdomain.com",
  "apiHost": "api.yourdomain.com",
  "apiPort": "443"
}
```

## Troubleshooting

### Common Issues

#### Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:3000
```

**Solutions**:
- Verify the Docker On-Demand service is running
- Check the `baseUrl` environment variable
- Ensure no firewall is blocking the connection

#### Invalid JSON Response

```
Error: Unexpected token < in JSON at position 0
```

**Solutions**:
- Check if the API is returning HTML error pages
- Verify the correct endpoint URL
- Check server logs for errors

#### Container Creation Fails

```
Error: DOCKER_DAEMON_UNAVAILABLE
```

**Solutions**:
- Ensure Docker daemon is running
- Check Docker socket permissions
- Verify Docker image availability

### Debug Mode

Enable Postman console for detailed debugging:

1. View → Show Postman Console
2. Run requests and check console output
3. Look for request/response details and test results

## Best Practices

### Request Organization

1. **Group Related Requests**: Use folders for logical grouping
2. **Descriptive Names**: Use clear, descriptive request names
3. **Documentation**: Add descriptions to all requests
4. **Examples**: Include request/response examples

### Test Writing

1. **Comprehensive Coverage**: Test both success and error scenarios
2. **Clear Assertions**: Write descriptive test names
3. **Data Validation**: Verify response structure and content
4. **Error Handling**: Test all error conditions

### Environment Management

1. **Variable Usage**: Use variables for all configurable values
2. **Environment Separation**: Separate environments for dev/staging/prod
3. **Sensitive Data**: Never commit sensitive data in collections
4. **Documentation**: Document all environment variables

## Contributing

When adding new API endpoints:

1. **Add Request**: Create new request in appropriate folder
2. **Add Tests**: Include comprehensive test scripts
3. **Update Documentation**: Add descriptions and examples
4. **Test Thoroughly**: Verify all scenarios work correctly
5. **Update Environment**: Add any new variables needed

## Support

For issues with the Postman collection:

1. Check the [API Documentation](../endpoints.md)
2. Review [Error Codes](../errors.md)
3. Check server logs for detailed error information
4. Create an issue with reproduction steps

---

*This collection provides comprehensive testing capabilities for the Docker On-Demand API, enabling efficient development, testing, and integration workflows.*