# ---- Stage 1: Builder ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (including devDependencies for tsc)
COPY package*.json ./
RUN npm ci

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Stage 2: Runner ----
FROM node:20-alpine AS runner

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy database schema, migrations, and migration runner for one-off migration runs
COPY schema.sql ./schema.sql
COPY migrations ./migrations
COPY run-migrations.mjs ./run-migrations.mjs

# Pre-create the media-uploads directory and give ownership to node user
RUN mkdir -p /app/media-uploads && chown node:node /app/media-uploads

# Use non-root node user (built into alpine node images)
USER node

ENV PORT=4001
ENV TZ=America/New_York

EXPOSE 4001

CMD ["node", "dist/server.js"]
