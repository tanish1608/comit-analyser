import express from 'express';
import fs from 'fs';
import path from 'path';
import { clearExpiredCache } from './cache';

// Create a simple Express server to handle cache management
const app = express();
const PORT = process.env.PORT || 3001;

// Cache file path
const CACHE_FILE = path.join(process.cwd(), 'github-cache.json');

// Middleware to parse JSON
app.use(express.json());

// Endpoint to get cache statistics
app.get('/api/cache/stats', (req, res) => {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      const cache = JSON.parse(data);
      
      // Calculate stats
      const stats = {
        repositories: {
          count: Object.keys(cache.repositories).length,
          size: JSON.stringify(cache.repositories).length,
        },
        branches: {
          count: Object.keys(cache.branches).length,
          size: JSON.stringify(cache.branches).length,
        },
        commits: {
          count: Object.keys(cache.commits).length,
          size: JSON.stringify(cache.commits).length,
        },
        totalSize: JSON.stringify(cache).length,
        lastUpdated: new Date().toISOString(),
      };
      
      res.json(stats);
    } else {
      res.json({
        repositories: { count: 0, size: 0 },
        branches: { count: 0, size: 0 },
        commits: { count: 0, size: 0 },
        totalSize: 0,
        lastUpdated: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({ error: 'Failed to get cache statistics' });
  }
});

// Endpoint to clear expired cache entries
app.post('/api/cache/clear-expired', (req, res) => {
  try {
    clearExpiredCache();
    res.json({ success: true, message: 'Expired cache entries cleared' });
  } catch (error) {
    console.error('Error clearing expired cache:', error);
    res.status(500).json({ error: 'Failed to clear expired cache entries' });
  }
});

// Endpoint to clear all cache
app.post('/api/cache/clear-all', (req, res) => {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Cache management server running on port ${PORT}`);
});