#!/bin/bash

# P2P Mesh Video Conferencing - PostgreSQL Docker Startup Script
# This script reads environment variables from .env file and starts PostgreSQL container

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_error ".env file not found in current directory"
    print_status "Please make sure you're running this script from the server directory"
    exit 1
fi

# Load environment variables from .env file
print_status "Loading environment variables from .env file..."
export $(grep -v '^#' .env | grep -v '^$' | xargs)

# Validate required PostgreSQL environment variables
if [ -z "$POSTGRES_HOST" ] || [ -z "$POSTGRES_PORT" ] || [ -z "$POSTGRES_DB" ] || [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASSWORD" ]; then
    print_error "Missing required PostgreSQL environment variables in .env file"
    print_status "Required variables: POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD"
    exit 1
fi

# Container name
CONTAINER_NAME="p2p-mesh-postgres"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if container already exists and remove it for interactive mode
if docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    print_status "Container ${CONTAINER_NAME} already exists"
    print_warning "Removing existing container to start in interactive mode..."
    
    # Stop if running
    if docker ps --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        print_status "Stopping running container..."
        docker stop ${CONTAINER_NAME} >/dev/null 2>&1
    fi
    
    # Remove the container
    docker rm ${CONTAINER_NAME} >/dev/null 2>&1
    print_success "Existing container removed"
fi

# Create and start new PostgreSQL container
print_status "Creating new PostgreSQL container: ${CONTAINER_NAME}"
print_status "Database configuration:"
echo "  - Host: ${POSTGRES_HOST}"
echo "  - Port: ${POSTGRES_PORT}"
echo "  - Database: ${POSTGRES_DB}"
echo "  - User: ${POSTGRES_USER}"
echo "  - Password: [HIDDEN]"

# Run PostgreSQL container in interactive mode with live logging
print_status "Starting PostgreSQL container in interactive mode..."
print_warning "The container will run in the foreground with live logs"
print_status "Press Ctrl+C to stop the container and exit"
print_status "Container will be accessible at: ${POSTGRES_HOST}:${POSTGRES_PORT}"
echo ""

# Cleanup function for graceful shutdown
cleanup() {
    print_warning "\nReceived interrupt signal. Stopping container..."
    docker stop ${CONTAINER_NAME} >/dev/null 2>&1
    docker rm ${CONTAINER_NAME} >/dev/null 2>&1
    print_success "Container stopped and removed"
    exit 0
}

# Set trap for graceful shutdown
trap cleanup SIGINT SIGTERM

# Run PostgreSQL container in interactive mode
docker run -it --rm \
  --name ${CONTAINER_NAME} \
  -e POSTGRES_DB=${POSTGRES_DB} \
  -e POSTGRES_USER=${POSTGRES_USER} \
  -e POSTGRES_PASSWORD=${POSTGRES_PASSWORD} \
  -p ${POSTGRES_PORT}:5432 \
  -v p2p_mesh_postgres_data:/var/lib/postgresql/data \
  postgres:15-alpine