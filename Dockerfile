FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY src/ ./src/

# Expose port
EXPOSE 3100

# Run
CMD ["node", "src/server.js"]
