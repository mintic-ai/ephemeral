#!/bin/bash

# Docker build script for Ephemeral
# Usage: ./scripts/build-docker.sh [OPTIONS]

set -e

# Default values
IMAGE_NAME="ephemeral"
TAG="latest"
BUILD_ARGS=""
PUSH=false
PLATFORM=""
CACHE_FROM=""
TARGET="production"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Build Docker image for Ephemeral application

OPTIONS:
    -n, --name NAME         Image name (default: ephemeral)
    -t, --tag TAG          Image tag (default: latest)
    -p, --push             Push image to registry after build
    --platform PLATFORM   Target platform (e.g., linux/amd64,linux/arm64)
    --cache-from IMAGE     Use image as cache source
    --target TARGET        Build target (builder|production, default: production)
    --build-arg ARG        Pass build argument (can be used multiple times)
    -h, --help             Show this help message

EXAMPLES:
    $0                                          # Build with defaults
    $0 -t v1.0.0                               # Build with specific tag
    $0 -t v1.0.0 -p                           # Build and push
    $0 --platform linux/amd64,linux/arm64     # Multi-platform build
    $0 --target builder                        # Build development image
    $0 --build-arg NODE_ENV=production         # Pass build argument

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        -t|--tag)
            TAG="$2"
            shift 2
            ;;
        -p|--push)
            PUSH=true
            shift
            ;;
        --platform)
            PLATFORM="$2"
            shift 2
            ;;
        --cache-from)
            CACHE_FROM="$2"
            shift 2
            ;;
        --target)
            TARGET="$2"
            shift 2
            ;;
        --build-arg)
            BUILD_ARGS="$BUILD_ARGS --build-arg $2"
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate target
if [[ "$TARGET" != "builder" && "$TARGET" != "production" ]]; then
    print_error "Invalid target: $TARGET. Must be 'builder' or 'production'"
    exit 1
fi

# Build full image name
FULL_IMAGE_NAME="${IMAGE_NAME}:${TAG}"

print_status "Building Docker image: $FULL_IMAGE_NAME"
print_status "Target: $TARGET"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running or not accessible"
    exit 1
fi

# Check if Dockerfile exists
if [[ ! -f "Dockerfile" ]]; then
    print_error "Dockerfile not found in current directory"
    exit 1
fi

# Build Docker command
DOCKER_CMD="docker build"

# Add platform if specified
if [[ -n "$PLATFORM" ]]; then
    DOCKER_CMD="$DOCKER_CMD --platform $PLATFORM"
fi

# Add cache from if specified
if [[ -n "$CACHE_FROM" ]]; then
    DOCKER_CMD="$DOCKER_CMD --cache-from $CACHE_FROM"
fi

# Add target
DOCKER_CMD="$DOCKER_CMD --target $TARGET"

# Add build args
if [[ -n "$BUILD_ARGS" ]]; then
    DOCKER_CMD="$DOCKER_CMD $BUILD_ARGS"
fi

# Add tag and context
DOCKER_CMD="$DOCKER_CMD -t $FULL_IMAGE_NAME ."

print_status "Executing: $DOCKER_CMD"

# Execute build
if eval $DOCKER_CMD; then
    print_success "Successfully built $FULL_IMAGE_NAME"
else
    print_error "Failed to build $FULL_IMAGE_NAME"
    exit 1
fi

# Show image size
IMAGE_SIZE=$(docker images --format "table {{.Size}}" $FULL_IMAGE_NAME | tail -n 1)
print_status "Image size: $IMAGE_SIZE"

# Push if requested
if [[ "$PUSH" == true ]]; then
    print_status "Pushing $FULL_IMAGE_NAME to registry..."
    if docker push $FULL_IMAGE_NAME; then
        print_success "Successfully pushed $FULL_IMAGE_NAME"
    else
        print_error "Failed to push $FULL_IMAGE_NAME"
        exit 1
    fi
fi

# Show final status
print_success "Build completed successfully!"
print_status "Image: $FULL_IMAGE_NAME"
print_status "Target: $TARGET"
print_status "Size: $IMAGE_SIZE"

# Show next steps
echo
print_status "Next steps:"
echo "  Run locally:     docker run -p 3000:3000 $FULL_IMAGE_NAME"
echo "  Run with compose: docker-compose up -d"
echo "  View logs:       docker logs $FULL_IMAGE_NAME"
echo "  Shell access:    docker exec -it <container_id> sh"