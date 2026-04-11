#!/bin/bash

echo "🚀 Starting production server..."

# Run database migrations
echo "📊 Running database migrations..."
npm run db:migrate

# Start the server
echo "🌐 Starting server..."
npm start
