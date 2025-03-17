import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = 3001;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface Cache {
  repositories: { [key: string]: CacheEntry<any> };
  branches: { [key: string]: CacheEntry<any> };
  commits: { [key: string]: CacheEntry<any> };
  employees: { [key: string]: CacheEntry<any> };
}

const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const cache: Cache = {
  repositories: {},
  branches: {},
  commits: {},
  employees: {}
};

// Configure CORS before other middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  credentials: true
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

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Cache server running on http://localhost:${PORT}`);
});