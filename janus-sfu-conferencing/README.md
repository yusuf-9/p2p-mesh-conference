# Media Server Development Environment

Simple Docker setup for development with PostgreSQL and Redis.

## Prerequisites

- Docker and Docker Compose
- Node.js (for running the websocket server locally)

## Architecture

This development environment runs essential services in Docker while allowing you to run the websocket server locally for faster development:

- **PostgreSQL**: Database (Docker)
- **Redis**: Caching and pub/sub (Docker)
- **WebSocket Server**: Runs locally for development

## Quick Start

### 1. Start Infrastructure Services

```bash
./start.sh
```

This will start PostgreSQL and Redis in Docker containers.

### 2. Set Up WebSocket Server

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Copy environment variables (optional - has good defaults)
cp ../env.example .env

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

## Development Workflow

### Fresh Start Every Time
- No persistent volumes - database starts fresh each time
- Perfect for development and testing
- Run `./start.sh` whenever you want a clean slate

### Services Available
- **PostgreSQL**: `localhost:5432`
- **Redis**: `localhost:6379`
- **WebSocket Server**: `http://localhost:8080` (when running locally)

### Stopping Services

```bash
docker-compose down
```

## Environment Variables

Most configuration is hardcoded for simplicity. Check `env.example` for websocket server configuration options.

## Database Management

- **Migrations**: `npm run db:migrate` (run from server directory)
- **Schema Generation**: `npm run db:generate`
- **Fresh Database**: Just restart with `./start.sh`