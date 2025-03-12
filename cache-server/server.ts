import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface Cache {
  repositories: { [key: string]: CacheEntry<any> };
  branches: { [key: string]: CacheEntry<any> };
  commits: { [key: string]: CacheEntry<any> };
}

const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const cache: Cache = {
  repositories: {},
  branches: {},
  commits: {},
};

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Generic cache get endpoint
app.get('/api/cache/:type/:key', (req, res) => {
  const { type, key } = req.params;
  console.log(`Cache GET request for ${type}/${key}`);
  
  if (!cache[type as keyof Cache]) {
    console.log(`Invalid cache type: ${type}`);
    return res.status(404).json({ error: 'Invalid cache type' });
  }
  
  const entry = cache[type as keyof Cache][decodeURIComponent(key)];
  
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) {
      delete cache[type as keyof Cache][decodeURIComponent(key)];
      console.log(`Cache entry expired for ${type}/${key}`);
    } else {
      console.log(`Cache miss for ${type}/${key}`);
    }
    return res.status(404).json({ error: 'Cache miss' });
  }
  
  console.log(`Cache hit for ${type}/${key}`);
  res.json(entry.data);
});

// Generic cache set endpoint
app.post('/api/cache/:type/:key', (req, res) => {
  const { type, key } = req.params;
  const { data } = req.body;
  console.log(`Cache POST request for ${type}/${key}`);
  
  if (!cache[type as keyof Cache]) {
    console.log(`Invalid cache type: ${type}`);
    return res.status(400).json({ error: 'Invalid cache type' });
  }
  
  cache[type as keyof Cache][decodeURIComponent(key)] = {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + CACHE_TTL,
  };
  
  console.log(`Cache entry created for ${type}/${key}`);
  res.json({ success: true });
});

// Get cache statistics
app.get('/api/cache/stats', (req, res) => {
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
  };
  
  res.json(stats);
});

// Clear expired cache entries
app.post('/api/cache/clear-expired', (req, res) => {
  const now = Date.now();
  let cleared = 0;
  
  Object.keys(cache).forEach((type) => {
    Object.keys(cache[type as keyof Cache]).forEach((key) => {
      if (now > cache[type as keyof Cache][key].expiresAt) {
        delete cache[type as keyof Cache][key];
        cleared++;
      }
    });
  });
  
  console.log(`Cleared ${cleared} expired cache entries`);
  res.json({ success: true, cleared });
});

// Clear all cache
app.post('/api/cache/clear', (req, res) => {
  Object.keys(cache).forEach((type) => {
    cache[type as keyof Cache] = {};
  });
  
  console.log('Cache cleared');
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Cache server running on port ${PORT}`);
});