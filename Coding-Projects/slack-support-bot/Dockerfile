# ---- Base Stage ----
# Use an official Node.js LTS version
FROM node:18-slim AS base
WORKDIR /usr/src/app

# ---- Dependencies Stage ----
FROM base AS dependencies
# Copy only package files
COPY package*.json ./
# Install production dependencies only
RUN npm ci --only=production --ignore-scripts

# ---- Runtime Stage ----
FROM base AS runtime
WORKDIR /usr/src/app
# Copy installed production dependencies from the dependencies stage
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
# Copy application code
COPY src ./src
COPY scripts ./scripts

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose the port the app runs on
EXPOSE 8080

# Define the command to run the application
CMD [ "node", "src/app.js" ] 