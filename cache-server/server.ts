import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

// Cache storage
let serverCache = {
  repositories: {},
  branches: {},
  commits: {},
  timestamp: Date.now(),
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Get cache data
app.get('/api/cache/data', (req, res) => {
  res.json(serverCache);
});

// Get cache statistics
app.get('/api/cache/stats', (req, res) => {
  const stats = {
    repositories: {
      count: Object.keys(serverCache.repositories).length,
      size: JSON.stringify(serverCache.repositories).length,
    },
    branches: {
      count: Object.keys(serverCache.branches).length,
      size: JSON.stringify(serverCache.branches).length,
    },
    commits: {
      count: Object.keys(serverCache.commits).length,
      size: JSON.stringify(serverCache.commits).length,
    },
    totalSize: JSON.stringify(serverCache).length,
    lastUpdated: serverCache.timestamp,
  };
  
  res.json(stats);
});

// Update cache
app.post('/api/cache/update', (req, res) => {
  try {
    const newCache = req.body;
    
    // Only update if the new cache is newer
    if (newCache.timestamp > serverCache.timestamp) {
      serverCache = newCache;
      res.json({ success: true, message: 'Cache updated successfully' });
    } else {
      res.json({ success: false, message: 'Cache is not newer than server cache' });
    }
  } catch (error) {
    console.error('Error updating cache:', error);
    res.status(500).json({ error: 'Failed to update cache' });
  }
});

// Clear expired cache entries
app.post('/api/cache/clear-expired', (req, res) => {
  try {
    Object.keys(serverCache).forEach((type) => {
      if (type === 'timestamp') return;
      
      Object.keys(serverCache[type]).forEach((key) => {
        const entry = serverCache[type][key];
        if (Date.now() > entry.expiresAt) {
          delete serverCache[type][key];
        }
      });
    });
    
    serverCache.timestamp = Date.now();
    res.json({ success: true, message: 'Expired cache entries cleared' });
  } catch (error) {
    console.error('Error clearing expired cache:', error);
    res.status(500).json({ error: 'Failed to clear expired cache entries' });
  }
});

// Clear all cache
app.post('/api/cache/clear-all', (req, res) => {
  try {
    serverCache = {
      repositories: {},
      branches: {},
      commits: {},
      timestamp: Date.now(),
    };
    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

app.listen(PORT, () => {
  console.log(`Cache management server running on port ${PORT}`);
});