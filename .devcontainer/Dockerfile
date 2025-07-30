# Use the official Bun image as base
FROM oven/bun:1

# Set working directory
WORKDIR /app

# Copy package.json and bun.lock for dependency installation
COPY package.json bun.lock* ./

# Copy bun configuration
COPY bunfig.toml ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code and configuration files
COPY src/ ./src/
COPY public/ ./public/
COPY styles/ ./styles/
COPY tsconfig.json ./
COPY components.json ./
COPY build.ts ./

# Environment files will be mounted at runtime if needed

# Expose the development server port
EXPOSE 3000

# Set environment variables for development
ENV NODE_ENV=development

# Run the development server with hot reloading
CMD ["bun", "--hot", "src/index.tsx"]
