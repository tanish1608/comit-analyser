import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Admin } from './types';

const app = express();
const PORT = 3001;
const CACHE_FILE = path.join(process.cwd(), 'cache-data.json');

// Admin credentials
const ADMIN: Admin = {
  username: 'admin',
  password: 'gh-analyzer-2025!'
};

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  lastUpdate?: number;
}

interface Cache {
  repositories: { [key: string]: CacheEntry<any> };
  branches: { [key: string]: CacheEntry<any> };
  commits: { [key: string]: CacheEntry<any> };
  employees: { [key: string]: CacheEntry<any> };
}

const CACHE_TTL = 1000 * 60 * 60 * 24 * 30 * 4; // 4 months

// Load cache from file if it exists
let cache: Cache = {
  repositories: {},
  branches: {},
  commits: {},
  employees: {}
};

try {
  if (fs.existsSync(CACHE_FILE)) {
    const fileContent = fs.readFileSync(CACHE_FILE, 'utf-8');
    cache = JSON.parse(fileContent);
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

// Admin authentication middleware
const authenticateAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  if (username === ADMIN.username && password === ADMIN.password) {
    next();
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
};

// Configure CORS before other middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  credentials: true,
  exposedHeaders: ['WWW-Authenticate']
}));

app.use(express.json({ limit: '50mb' }));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('Health check request received');
  res.json({ status: 'ok' });
});

// Admin authentication endpoint
app.post('/api/auth', (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN.username && password === ADMIN.password) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Employee name fetching endpoint
app.get('/api/employees/:empiId', async (req, res) => {
  const { empiId } = req.params;
  
  try {
    // Check cache first
    const cacheKey = `employee_${empiId}`;
    const cachedData = cache.employees[cacheKey];
    
    if (cachedData && Date.now() < cachedData.expiresAt) {
      console.log(`Cache hit for employee ${empiId}`);
      return res.json(cachedData.data);
    }
    
    // Fetch from employee API
    const response = await axios.get(`https://api.example.com/employees/${empiId}`);
    const employeeData = {
      name: response.data.name,
      email: response.data.email,
      department: response.data.department
    };
    
    // Cache the result
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

// Pod employees fetching endpoint
app.get('/api/pods/:podId/employees', async (req, res) => {
  const { podId } = req.params;
  
  try {
    // Check cache first
    const cacheKey = `pod_${podId}`;
    const cachedData = cache.employees[cacheKey];
    
    if (cachedData && Date.now() < cachedData.expiresAt) {
      console.log(`Cache hit for pod ${podId}`);
      return res.json(cachedData.data);
    }
    
    // Fetch from pod API
    const response = await axios.get(`https://api.example.com/pods/${podId}/employees`);
    const employees = response.data.map((emp: any) => ({
      empiId: emp.empiId,
      name: emp.name,
      pod: podId
    }));
    
    // Cache the result
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
  res.json({ ...entry.data, lastUpdate: entry.lastUpdate });
});

// Generic cache set endpoint - requires admin authentication
app.post('/api/cache/:type/:key', authenticateAdmin, (req, res) => {
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
    const now = Date.now();
    cache[type as keyof Cache][decodeURIComponent(key)] = {
      data,
      timestamp: now,
      expiresAt: now + CACHE_TTL,
      lastUpdate: now
    };
    
    saveCache();
    console.log(`Cache entry created for ${type}/${key}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error creating cache entry:', error);
    res.status(500).json({ error: 'Failed to create cache entry' });
  }
});

// Get cache statistics - requires admin authentication
app.get('/api/cache/stats', authenticateAdmin, (req, res) => {
  const stats = {
    repositories: {
      count: Object.keys(cache.repositories).length,
      size: JSON.stringify(cache.repositories).length,
      lastUpdate: Math.max(...Object.values(cache.repositories).map(entry => entry.lastUpdate || 0))
    },
    branches: {
      count: Object.keys(cache.branches).length,
      size: JSON.stringify(cache.branches).length,
      lastUpdate: Math.max(...Object.values(cache.branches).map(entry => entry.lastUpdate || 0))
    },
    commits: {
      count: Object.keys(cache.commits).length,
      size: JSON.stringify(cache.commits).length,
      lastUpdate: Math.max(...Object.values(cache.commits).map(entry => entry.lastUpdate || 0))
    },
    employees: {
      count: Object.keys(cache.employees).length,
      size: JSON.stringify(cache.employees).length,
      lastUpdate: Math.max(...Object.values(cache.employees).map(entry => entry.lastUpdate || 0))
    },
    totalSize: JSON.stringify(cache).length,
  };
  
  res.json(stats);
});

// Clear expired cache entries - requires admin authentication
app.post('/api/cache/clear-expired', authenticateAdmin, (req, res) => {
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
  
  if (cleared > 0) {
    saveCache();
  }
  
  console.log(`Cleared ${cleared} expired cache entries`);
  res.json({ success: true, cleared });
});

// Clear all cache - requires admin authentication
app.post('/api/cache/clear', authenticateAdmin, (req, res) => {
  Object.keys(cache).forEach((type) => {
    cache[type as keyof Cache] = {};
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