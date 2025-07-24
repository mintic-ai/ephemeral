# Multi-stage build for optimized production image
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Build the TypeScript application
RUN npm run build

# Remove dev dependencies to reduce size
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:18-alpine AS production

# Install security updates and required packages
RUN apk update && apk upgrade && \
    apk add --no-cache \
    ca-certificates \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S dockerondemand -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Create necessary directories with proper ownership
RUN mkdir -p /app/logs /app/data && \
    chown -R dockerondemand:nodejs /app

# Copy built application from builder stage
COPY --from=builder --chown=dockerondemand:nodejs /app/dist ./dist
COPY --from=builder --chown=dockerondemand:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=dockerondemand:nodejs /app/package*.json ./

# Copy environment configuration
COPY --chown=dockerondemand:nodejs .env.example ./.env.example

# Switch to non-root user
USER dockerondemand

# Expose the API port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["node", "dist/index.js"]