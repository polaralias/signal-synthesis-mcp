# Smithery MCP Server
# Use Node.js LTS (Long Term Support) as the base image
# Upgraded to node:22-slim to satisfy Prisma 7.2.0 requirements (Node >= 20.19)
FROM node:22-slim AS builder

WORKDIR /app

# Install OpenSSL for Prisma (required for slim images)
RUN apt-get update -y && apt-get install -y openssl

# Copy package.json and package-lock.json
COPY package*.json ./
# Copy prisma directory (needed for prisma generate during install)
COPY prisma ./prisma

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the TypeScript code
RUN npm run build

# Production stage
FROM node:22-slim

WORKDIR /app

# Install OpenSSL for Prisma (required for slim images)
RUN apt-get update -y && apt-get install -y openssl

# Copy package files
COPY package*.json ./
# Copy prisma directory (needed for prisma generate during postinstall)
COPY prisma ./prisma

# Install only production dependencies
# This will trigger postinstall (prisma generate) which works because 'prisma' is in dependencies
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Expose the port the app runs on (default 3000)
EXPOSE 3000

# Define environment variables with defaults (can be overridden at runtime)
ENV PORT=3000
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]
