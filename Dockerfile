# Smithery MCP Server
# Use Node.js LTS (Long Term Support) as the base image
# Upgraded to node:22-slim to satisfy Prisma 7.2.0 requirements (Node >= 20.19)
FROM node:22-slim AS builder

WORKDIR /app

# Install OpenSSL for Prisma (required for slim images)
RUN apt-get update -y && apt-get install -y openssl

# Copy package.json and package-lock.json
COPY package*.json ./
# Copy prisma directory (needed for prisma generate during install/build)
COPY prisma ./prisma

# Install all dependencies (including devDependencies)
# This includes 'prisma' CLI (now in devDependencies)
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the TypeScript code (includes prisma generate)
RUN npm run build

# Production stage
FROM node:22-slim

WORKDIR /app

# Install OpenSSL for Prisma (required for slim images)
RUN apt-get update -y && apt-get install -y openssl

# Copy package files
COPY package*.json ./
# Copy prisma directory (some users/tools rely on schema presence)
COPY prisma ./prisma

# Install only production dependencies
# Use --ignore-scripts to prevent 'postinstall' (prisma generate) from running,
# as the 'prisma' CLI is not available in production dependencies.
RUN npm ci --omit=dev --ignore-scripts

# Copy generated Prisma Client from builder
# The client is typically generated in node_modules/.prisma and node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Expose the port the app runs on (default 3000)
EXPOSE 3000

# Define environment variables with defaults (can be overridden at runtime)
ENV PORT=3000
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]
