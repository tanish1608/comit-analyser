import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { subMonths } from 'date-fns';

const app = express();
const PORT = 3001;
const CACHE_FILE = path.join(process.cwd(), 'cache-data.json');

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CommitCacheEntry extends CacheEntry<any> {
  date: string;
}

interface Cache {
  repositories: { [key: string]: CacheEntry<any> };
  branches: { [key: string]: CacheEntry<any> };
  commits: { [key: string]: CommitCacheEntry };
  employees: { [key: string]: CacheEntry<any> };
  lastCommitDates: { [org: string]: string };
}

const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// Initialize cache with default values
let cache: Cache = {
  repositories: {},
  branches: {},
  commits: {},
  employees: {},
  lastCommitDates: {}
};

// Load cache from file if it exists
try {
  if (fs.existsSync(CACHE_FILE)) {
    const fileContent = fs.readFileSync(CACHE_FILE, 'utf-8');
    const loadedCache = JSON.parse(fileContent);
    // Ensure lastCommitDates exists in loaded cache
    cache = {
      ...loadedCache,
      lastCommitDates: loadedCache.lastCommitDates || {}
    };
    console.log('Cache loaded from file');
  }
} catch (error) {
  console.error('Error loading cache from file:', error);
}

// Save cache to file periodically
const saveCache = () => {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');
    console.log('Cache saved to file');
  } catch (error) {
    console.error('Error saving cache to file:', error);
  }
};

// Save cache every 5 minutes and on process exit
setInterval(saveCache, 5 * 60 * 1000);
process.on('SIGINT', () => {
  saveCache();
  process.exit();
});

// Configure CORS and other middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('Health check request received');
  res.json({ status: 'ok' });
});

// Mock employee API response
const mockEmployeeData = {
  name: 'John Doe',
  email: 'john.doe@example.com',
  department: 'Engineering'
};

// Employee name fetching endpoint
app.get('/api/employees/:empiId', async (req, res) => {
  const { empiId } = req.params;
  
  try {
    const cacheKey = `employee_${empiId}`;
    const cachedData = cache.employees[cacheKey];
    
    if (cachedData && Date.now() < cachedData.expiresAt) {
      console.log(`Cache hit for employee ${empiId}`);
      return res.json(cachedData.data);
    }
    
    const employeeData = { ...mockEmployeeData };
    
    cache.employees[cacheKey] = {
      data: employeeData,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_TTL
    };
    
    saveCache();
    res.json(employeeData);
  } catch (error) {
    console.error(`Error fetching employee ${empiId}:`, error);
    res.status(500).json({ error: 'Failed to fetch employee data' });
  }
});

// Mock pod employees data
const mockPodEmployees = [
  { empiId: 'emp1', name: 'John Doe', pod: 'pod-a' },
  { empiId: 'emp2', name: 'Jane Smith', pod: 'pod-a' },
  { empiId: 'emp3', name: 'Bob Johnson', pod: 'pod-b' }
];

// Pod employees fetching endpoint
app.get('/api/pods/:podId/employees', async (req, res) => {
  const { podId } = req.params;
  
  try {
    const cacheKey = `pod_${podId}`;
    const cachedData = cache.employees[cacheKey];
    
    if (cachedData && Date.now() < cachedData.expiresAt) {
      console.log(`Cache hit for pod ${podId}`);
      return res.json(cachedData.data);
    }
    
    const employees = mockPodEmployees.filter(emp => emp.pod === podId);
    
    cache.employees[cacheKey] = {
      data: employees,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_TTL
    };
    
    saveCache();
    res.json(employees);
  } catch (error) {
    console.error(`Error fetching employees for pod ${podId}:`, error);
    res.status(500).json({ error: 'Failed to fetch pod employees' });
  }
});

// Get last cached commit date for an organization
app.get('/api/cache/last-commit-date/:org', (req, res) => {
  const { org } = req.params;
  
  if (!cache.lastCommitDates) {
    cache.lastCommitDates = {};
    saveCache();
  }
  
  const lastCommitDate = cache.lastCommitDates[org];
  
  if (lastCommitDate) {
    res.json({ lastCommitDate });
  } else {
    res.status(404).json({ error: 'No cached commit date found' });
  }
});

// Clean up old commits
app.post('/api/cache/cleanup/:org', (req, res) => {
  const { org } = req.params;
  const { olderThan } = req.body;
  const olderThanDate = new Date(olderThan);
  let cleanedCount = 0;

  Object.entries(cache.commits).forEach(([key, entry]) => {
    if (key.startsWith(org) && new Date(entry.date) < olderThanDate) {
      delete cache.commits[key];
      cleanedCount++;
    }
  });

  console.log(`Cleaned up ${cleanedCount} old commits for ${org}`);
  saveCache();
  
  res.json({ success: true, cleanedCount });
});

// Update last commit date for an organization
app.post('/api/cache/last-commit-date/:org', (req, res) => {
  const { org } = req.params;
  const { date } = req.body;
  
  if (!cache.lastCommitDates) {
    cache.lastCommitDates = {};
  }
  
  cache.lastCommitDates[org] = date;
  saveCache();
  
  res.json({ success: true });
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
      saveCache();
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
  
  if (!data) {
    console.log('No data provided');
    return res.status(400).json({ error: 'No data provided' });
  }
  
  try {
    cache[type as keyof Cache][decodeURIComponent(key)] = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_TTL,
    };
    
    saveCache();
    console.log(`Cache entry created for ${type}/${key}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error creating cache entry:', error);
    res.status(500).json({ error: 'Failed to create cache entry' });
  }
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
    employees: {
      count: Object.keys(cache.employees).length,
      size: JSON.stringify(cache.employees).length,
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
    if (type !== 'lastCommitDates') {
      Object.keys(cache[type as keyof Cache]).forEach((key) => {
        if (now > cache[type as keyof Cache][key].expiresAt) {
          delete cache[type as keyof Cache][key];
          cleared++;
        }
      });
    }
  });
  
  if (cleared > 0) {
    saveCache();
  }
  
  console.log(`Cleared ${cleared} expired cache entries`);
  res.json({ success: true, cleared });
});

// Clear all cache
app.post('/api/cache/clear', (req, res) => {
  Object.keys(cache).forEach((type) => {
    if (type !== 'lastCommitDates') {
      cache[type as keyof Cache] = {};
    }
  });
  
  saveCache();
  console.log('Cache cleared');
  res.json({ success: true });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Cache server running on http://localhost:${PORT}`);
});