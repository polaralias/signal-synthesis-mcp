# Smithery MCP Server
# Use Node.js LTS (Long Term Support) as the base image
FROM node:18-slim

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
# Using npm ci for a clean and reproducible install
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the TypeScript code
RUN npm run build

# Expose the port the app runs on (default 3000)
EXPOSE 3000

# Define environment variables with defaults (can be overridden at runtime)
ENV PORT=3000
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]
