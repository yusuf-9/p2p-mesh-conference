#!/bin/bash

# Simple Development Environment Starter

echo "🚀 Starting development environment..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose and try again."
    exit 1
fi

# Stop any existing containers
echo "🧹 Stopping existing containers..."
docker-compose down --remove-orphans > /dev/null 2>&1
docker container stop janus-gateway > /dev/null 2>&1 || true
docker container rm janus-gateway > /dev/null 2>&1 || true

# Start the essential services
echo "📡 Starting PostgreSQL and Janus Gateway..."
docker-compose up

# Wait for postgres to be ready
echo "⏱️  Waiting for PostgreSQL to be ready..."
while [ "$(docker inspect --format='{{.State.Health.Status}}' postgres 2>/dev/null)" != "healthy" ]; do
    printf "."
    sleep 1
done
echo " ✅ PostgreSQL is ready!"

echo ""
echo "🎉 Development environment is ready!"
echo ""
echo "📋 Next steps:"
echo "   1. Navigate to the server directory: cd server"
echo "   2. Install dependencies: npm install"
echo "   3. Copy development environment: cp .env.dev .env"
echo "   4. Run database migrations: npm run db:migrate"
echo "   5. Start the websocket server: npm run dev"
echo ""
echo "🌐 Services available:"
echo "   - PostgreSQL: localhost:5432"
echo "   - Janus Gateway: localhost:8088 (HTTP API), localhost:8089 (WebSocket)"
echo ""
echo "💡 To stop the environment: docker-compose down"
echo "" 