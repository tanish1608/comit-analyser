# GitHub API Cache Server

This is a standalone Express server that manages caching for GitHub API data. It helps reduce the number of API calls to GitHub by storing responses in a local file cache.

## Features

- Caches GitHub API responses for repositories, branches, and commits
- Automatically expires cache entries after a configurable time period
- Provides API endpoints to manage and inspect the cache
- Reduces GitHub API rate limit usage
- Improves application performance by serving cached data

## API Endpoints

### Get Cache Statistics
```
GET /api/cache/stats
```
Returns statistics about the current cache state, including counts and sizes for each cache type.

### Get Cache Entry
```
GET /api/cache/:type/:key
```
Retrieves a specific cache entry by type and key.

### Save Cache Entry
```
POST /api/cache/:type/:key
```
Saves data to the cache with the specified type and key.

### Clear Expired Cache Entries
```
POST /api/cache/clear-expired
```
Removes all expired cache entries.

### Clear All Cache
```
POST /api/cache/clear-all
```
Removes all cache entries and deletes the cache file.

### Health Check
```
GET /health
```
Simple health check endpoint to verify the server is running.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Start the server:
   ```
   npm start
   ```

3. For development with auto-restart:
   ```
   npm run dev
   ```

## Configuration

- The server runs on port 3001 by default (configurable via PORT environment variable)
- Cache entries expire after 1 hour by default (configurable in the code)
- Cache is stored in a local file named `github-cache.json`

## Integration with Main Application

To use this cache server with the main GitHub Commit Analyzer application, update the API client to make requests to this server first before falling back to the GitHub API.