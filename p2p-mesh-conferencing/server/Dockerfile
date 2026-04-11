FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy all files
COPY . .

# Install dependencies and create package-lock.json
RUN npm install

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application (with migrations)
CMD ["sh", "./start-production.sh"] 