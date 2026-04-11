# Media Server Load Test Tool

A standalone load testing tool for video conferencing applications built with Puppeteer.

## Overview

This tool simulates multiple video call participants to test the performance and scalability of video conferencing servers. It uses a single browser instance with multiple tabs for optimal resource usage.

## Features

- 🎯 **Interactive Setup** - Prompts for URL and bot count
- 🌐 **Shared Browser** - Uses single browser with multiple tabs for efficiency
- ⚡ **Optimized Performance** - CPU optimizations and resource blocking
- 🎥 **Media Simulation** - Fake media streams for realistic testing
- 📊 **Real-time Monitoring** - Status updates and connection monitoring
- 🧹 **Clean Shutdown** - Proper cleanup on exit

## Installation

1. Navigate to the load-test directory:
   ```bash
   cd load-test
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

Run the load test tool:
```bash
npm start
```

The tool will prompt you for:
- **Target URL**: The video call application URL to test
- **Number of Bots**: How many simulated participants to create

## How It Works

1. **Browser Initialization**: Creates a single Puppeteer browser instance with performance optimizations
2. **Tab Creation**: Opens multiple tabs (one per bot) in the shared browser
3. **Page Navigation**: Each bot navigates to the target URL
4. **Join Simulation**: Bots automatically click the join button (`#join-call-btn`)
5. **Connection Monitoring**: Tracks video/audio elements and connection status
6. **Status Reporting**: Provides periodic updates on active connections

## Performance Optimizations

- Single browser instance shared across all bots
- Resource blocking (images, stylesheets, fonts)
- Reduced viewport sizes (640x480)
- CPU optimizations and memory limits
- Minimal console logging after setup

## Configuration

The tool uses these default settings:
- **Join Button Selector**: `#join-call-btn`
- **Bot Stagger Delay**: 3 seconds between bot launches
- **Status Update Interval**: 30 seconds
- **Connection Timeout**: 30 seconds

## Cleanup

The tool automatically cleans up resources on exit:
- Closes all bot tabs
- Terminates the shared browser
- Handles SIGINT and SIGTERM signals

## Troubleshooting

### Common Issues

**"Join button not found"**
- Verify the target URL is correct
- Check if the join button selector (`#join-call-btn`) matches your application

**"Browser launch failed"**
- Ensure sufficient system resources are available
- Try reducing the number of bots
- Check Puppeteer installation

**High CPU usage**
- Reduce the number of concurrent bots
- Check system resource availability
- Consider running on a more powerful machine

## System Requirements

- Node.js 16+ 
- Sufficient RAM (recommended: 2GB+ for 10+ bots)
- CPU resources for browser instances
- Network bandwidth for video streaming simulation

## License

ISC License