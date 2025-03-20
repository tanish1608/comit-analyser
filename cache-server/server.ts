import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { subMonths, subDays } from 'date-fns';

const app = express();
const PORT = 3001;

// Create a .cache directory in the project root
const CACHE_DIR = path.join(process.cwd(), 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'cache-data.json');

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

const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const COMMIT_RETENTION_DAYS = 4; // Change to 120 (4 months) for production

// Initialize cache with default values
let cache: Cache = {
  repositories: {},
  branches: {},
  commits: {},
  employees: {},
  lastCommitDates: {}
};

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log('Cache directory created:', CACHE_DIR);
  } catch (error) {
    console.error('Error creating cache directory:', error);
  }
}

// Initialize cache file if it doesn't exist
if (!fs.existsSync(CACHE_FILE)) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');
    console.log('Cache file initialized:', CACHE_FILE);
  } catch (error) {
    console.error('Error initializing cache file:', error);
  }
}

// Load cache from file if it exists
try {
  const fileContent = fs.readFileSync(CACHE_FILE, 'utf-8');
  if (fileContent.trim()) {
    const loadedCache = JSON.parse(fileContent);
    cache = {
      repositories: loadedCache.repositories || {},
      branches: loadedCache.branches || {},
      commits: loadedCache.commits || {},
      employees: loadedCache.employees || {},
      lastCommitDates: loadedCache.lastCommitDates || {}
    };
    console.log('Cache loaded from file');
  }
} catch (error) {
  console.error('Error loading cache from file:', error);
}

// Clean up old commits
const cleanupOldCommits = () => {
  const retentionDate = subDays(new Date(), COMMIT_RETENTION_DAYS);
  let removedCount = 0;

  Object.entries(cache.commits).forEach(([key, entry]) => {
    const commitDate = new Date(entry.data.commit.author.date);
    if (commitDate < retentionDate) {
      delete cache.commits[key];
      removedCount++;
    }
  });

  if (removedCount > 0) {
    console.log(`Cleaned up ${removedCount} commits older than ${COMMIT_RETENTION_DAYS} days`);
    saveCache();
  }
};

// Save cache to file with error handling
const saveCache = () => {
  try {
    const tempFile = `${CACHE_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(cache), 'utf-8');
    fs.renameSync(tempFile, CACHE_FILE);
    console.log('Cache saved successfully');
  } catch (error) {
    console.error('Error saving cache to file:', error);
  }
};

// Run cleanup every hour
setInterval(cleanupOldCommits, 1000 * 60 * 60);

// Save cache every 5 minutes and on process exit
const saveInterval = setInterval(saveCache, 5 * 60 * 1000);

process.on('SIGINT', () => {
  clearInterval(saveInterval);
  saveCache();
  process.exit();
});

process.on('SIGTERM', () => {
  clearInterval(saveInterval);
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

// Get all cached data in a single call
app.get('/api/cache/all-data', (req, res) => {
  const { startDate, endDate } = req.query;
  console.log('Fetching all cached data');

  try {
    const data = {
      repositories: {},
      commits: {},
      stats: {
        totalRepos: 0,
        totalCommits: 0,
        organizations: new Set()
      }
    };

    // Process repositories
    Object.entries(cache.repositories).forEach(([key, entry]) => {
      const [org] = key.split('/');
      if (!data.repositories[org]) {
        data.repositories[org] = [];
        data.stats.organizations.add(org);
      }
      data.repositories[org].push(entry.data);
      data.stats.totalRepos++;
    });

    // Process commits within date range
    const start = startDate ? new Date(startDate as string) : subMonths(new Date(), 4);
    const end = endDate ? new Date(endDate as string) : new Date();

    Object.entries(cache.commits).forEach(([key, entry]) => {
      if (!entry.data || !entry.data.commit) return;
      
      const commitDate = new Date(entry.data.commit.author.date);
      if (commitDate >= start && commitDate <= end) {
        const [org, repo] = key.split('/');
        const repoKey = `${org}/${repo}`;
        if (!data.commits[repoKey]) {
          data.commits[repoKey] = [];
        }
        data.commits[repoKey].push(entry.data);
        data.stats.totalCommits++;
      }
    });

    // Convert stats.organizations Set to Array for JSON serialization
    data.stats.organizations = Array.from(data.stats.organizations);

    console.log(`Sending data: ${data.stats.totalRepos} repositories, ${data.stats.totalCommits} commits`);
    res.json(data);
  } catch (error) {
    console.error('Error fetching all cached data:', error);
    res.status(500).json({ error: 'Failed to fetch cached data' });
  }
});

// Cache repositories
app.post('/api/cache/repositories', (req, res) => {
  const { org, data } = req.body;

  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid repository data' });
  }

  data.forEach(repo => {
    const key = repo.full_name;
    cache.repositories[key] = {
      data: repo,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_TTL
    };
  });

  saveCache();
  res.json({ success: true });
});

// Cache commits
app.post('/api/cache/commits', (req, res) => {
  const { repository, commits, dateRange } = req.body;

  if (!repository || !commits || !Array.isArray(commits)) {
    return res.status(400).json({ error: 'Invalid commit data' });
  }

  // Clean up old commits before adding new ones
  cleanupOldCommits();

  // Update commits in cache
  commits.forEach(commit => {
    const key = `${repository}/${commit.sha}`;
    cache.commits[key] = {
      data: commit,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_TTL,
      date: commit.commit.author.date.split('T')[0]
    };
  });

  // Update last commit date for the organization
  if (dateRange?.until) {
    const [org] = repository.split('/');
    // Only update if the new date is more recent
    const currentLastDate = cache.lastCommitDates[org];
    if (!currentLastDate || new Date(dateRange.until) > new Date(currentLastDate)) {
      cache.lastCommitDates[org] = dateRange.until;
    }
  }

  saveCache();
  res.json({ success: true });
});

// Get cache statistics
app.get('/api/cache/stats', (req, res) => {
  const stats = {
    repositories: Object.fromEntries(
      Object.entries(cache.repositories).map(([key, value]) => [
        key,
        {
          count: 1,
          lastUpdated: value.timestamp
        }
      ])
    ),
    commits: Object.fromEntries(
      Object.entries(cache.commits).map(([key, value]) => [
        key,
        {
          count: 1,
          lastUpdated: value.timestamp
        }
      ])
    ),
    employees: {
      count: Object.keys(cache.employees).length,
      size: JSON.stringify(cache.employees).length,
    },
    totalSize: JSON.stringify(cache).length,
    lastCommitDates: cache.lastCommitDates
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