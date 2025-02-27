const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Cache file path
const CACHE_FILE = path.join(__dirname, 'github-cache.json');
const CACHE_TTL = 1000 * 60 * 60; // 1 hour in milliseconds

// Initialize cache
let cache = {
  repositories: {},
  branches: {},
  commits: {},
};

// Middleware
app.use(cors());
app.use(express.json());

// Load cache from file
const loadCache = () => {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      cache = JSON.parse(data);
      console.log('Cache loaded from file');
    }
  } catch (error) {
    console.error('Error loading cache:', error);
    // If there's an error loading the cache, we'll start with a fresh one
    cache = {
      repositories: {},
      branches: {},
      commits: {},
    };
  }
};

// Save cache to file
const saveCache = () => {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log('Cache saved to file');
  } catch (error) {
    console.error('Error saving cache:', error);
  }
};

// Get data from cache
const getFromCache = (cacheType, key) => {
  loadCache();
  
  const entry = cache[cacheType][key];
  
  if (!entry) {
    return null;
  }
  
  // Check if cache entry has expired
  if (Date.now() > entry.expiresAt) {
    delete cache[cacheType][key];
    saveCache();
    return null;
  }
  
  return entry.data;
};

// Save data to cache
const saveToCache = (cacheType, key, data) => {
  loadCache();
  
  cache[cacheType][key] = {
    timestamp: Date.now(),
    data,
    expiresAt: Date.now() + CACHE_TTL,
  };
  
  saveCache();
};

// Clear expired cache entries
const clearExpiredCache = () => {
  loadCache();
  
  let entriesRemoved = 0;
  
  Object.keys(cache).forEach((type) => {
    Object.keys(cache[type]).forEach((key) => {
      const entry = cache[type][key];
      if (Date.now() > entry.expiresAt) {
        delete cache[type][key];
        entriesRemoved++;
      }
    });
  });
  
  if (entriesRemoved > 0) {
    console.log(`Cleared ${entriesRemoved} expired cache entries`);
    saveCache();
  }
  
  return entriesRemoved;
};

// Initialize cache on server start
loadCache();

// API Routes

// Get cache statistics
app.get('/api/cache/stats', (req, res) => {
  try {
    loadCache();
    
    // Calculate stats
    const stats = {
      repositories: {
        count: Object.keys(cache.repositories).length,
        size: JSON.stringify(cache.repositories).length,
        entries: Object.keys(cache.repositories).map(key => ({
          key,
          expires: new Date(cache.repositories[key].expiresAt).toISOString(),
          itemCount: cache.repositories[key].data.length
        }))
      },
      branches: {
        count: Object.keys(cache.branches).length,
        size: JSON.stringify(cache.branches).length,
        entries: Object.keys(cache.branches).map(key => ({
          key,
          expires: new Date(cache.branches[key].expiresAt).toISOString(),
          itemCount: cache.branches[key].data.length
        }))
      },
      commits: {
        count: Object.keys(cache.commits).length,
        size: JSON.stringify(cache.commits).length,
        entries: Object.keys(cache.commits).map(key => ({
          key,
          expires: new Date(cache.commits[key].expiresAt).toISOString(),
          itemCount: cache.commits[key].data.length
        }))
      },
      totalSize: JSON.stringify(cache).length,
      lastUpdated: new Date().toISOString(),
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({ error: 'Failed to get cache statistics' });
  }
});

// Get specific cache entry
app.get('/api/cache/:type/:key', (req, res) => {
  try {
    const { type, key } = req.params;
    
    if (!['repositories', 'branches', 'commits'].includes(type)) {
      return res.status(400).json({ error: 'Invalid cache type' });
    }
    
    const data = getFromCache(type, key);
    
    if (!data) {
      return res.status(404).json({ error: 'Cache entry not found or expired' });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error getting cache entry:', error);
    res.status(500).json({ error: 'Failed to get cache entry' });
  }
});

// Save cache entry
app.post('/api/cache/:type/:key', (req, res) => {
  try {
    const { type, key } = req.params;
    const { data } = req.body;
    
    if (!['repositories', 'branches', 'commits'].includes(type)) {
      return res.status(400).json({ error: 'Invalid cache type' });
    }
    
    if (!data) {
      return res.status(400).json({ error: 'Data is required' });
    }
    
    saveToCache(type, key, data);
    
    res.json({ success: true, message: 'Cache entry saved successfully' });
  } catch (error) {
    console.error('Error saving cache entry:', error);
    res.status(500).json({ error: 'Failed to save cache entry' });
  }
});

// Clear expired cache entries
app.post('/api/cache/clear-expired', (req, res) => {
  try {
    const entriesRemoved = clearExpiredCache();
    res.json({ 
      success: true, 
      message: `Expired cache entries cleared (${entriesRemoved} entries removed)` 
    });
  } catch (error) {
    console.error('Error clearing expired cache:', error);
    res.status(500).json({ error: 'Failed to clear expired cache entries' });
  }
});

// Clear all cache
app.post('/api/cache/clear-all', (req, res) => {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
    
    // Reset cache object
    cache = {
      repositories: {},
      branches: {},
      commits: {},
    };
    
    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Cache management server running on http://localhost:${PORT}`);
  
  // Set up interval to clear expired cache entries
  setInterval(clearExpiredCache, CACHE_TTL);
});