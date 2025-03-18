import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { subMonths, isAfter, parseISO } from 'date-fns';

const app = express();
const PORT = 3001;
const CACHE_FILE = path.join(process.cwd(), 'cache-data.json');
const CACHE_RETENTION_MONTHS = 4;

// Initialize cache from file
let cache = {
  lastUpdated: '',
  organizations: {}
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

// Save cache to file
const saveCache = () => {
  try {
    cache.lastUpdated = new Date().toISOString();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    console.log('Cache saved to file');
  } catch (error) {
    console.error('Error saving cache to file:', error);
  }
};

// Clean old data
const cleanOldData = () => {
  const cutoffDate = subMonths(new Date(), CACHE_RETENTION_MONTHS);
  
  Object.entries(cache.organizations).forEach(([orgName, orgData]) => {
    Object.entries(orgData.commits).forEach(([repoName, repoData]) => {
      repoData.data = repoData.data.filter(commit => 
        isAfter(parseISO(commit.commit.author.date), cutoffDate)
      );
      
      if (repoData.data.length === 0) {
        delete orgData.commits[repoName];
      }
    });
    
    if (Object.keys(orgData.commits).length === 0) {
      delete cache.organizations[orgName];
    }
  });
  
  saveCache();
};

// Configure middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', lastUpdated: cache.lastUpdated });
});

// Get cached data for organization
app.get('/api/cache/org/:orgName', (req, res) => {
  const { orgName } = req.params;
  const orgData = cache.organizations[orgName];
  
  if (!orgData) {
    return res.status(404).json({ error: 'Organization not found in cache' });
  }
  
  res.json(orgData);
});

// Store organization data in cache
app.post('/api/cache/org/:orgName', (req, res) => {
  const { orgName } = req.params;
  const { repositories, commits, branches } = req.body;
  
  if (!cache.organizations[orgName]) {
    cache.organizations[orgName] = {
      lastFetched: new Date().toISOString(),
      repositories: [],
      commits: {},
      branches: {}
    };
  }
  
  const orgData = cache.organizations[orgName];
  
  if (repositories) {
    orgData.repositories = repositories;
  }
  
  if (commits) {
    Object.entries(commits).forEach(([repoName, commitData]) => {
      if (!orgData.commits[repoName]) {
        orgData.commits[repoName] = {
          data: [],
          lastFetched: new Date().toISOString()
        };
      }
      
      // Merge new commits with existing ones, avoiding duplicates
      const existingCommits = new Set(orgData.commits[repoName].data.map(c => c.sha));
      commitData.forEach(commit => {
        if (!existingCommits.has(commit.sha)) {
          orgData.commits[repoName].data.push(commit);
        }
      });
    });
  }
  
  if (branches) {
    Object.entries(branches).forEach(([repoName, branchData]) => {
      orgData.branches[repoName] = {
        data: branchData,
        lastFetched: new Date().toISOString()
      };
    });
  }
  
  cleanOldData();
  saveCache();
  
  res.json({
    success: true,
    message: 'Cache updated successfully',
    timestamp: new Date().toISOString()
  });
});

// Get filtered commits
app.get('/api/cache/commits/:orgName', (req, res) => {
  const { orgName } = req.params;
  const { startDate, endDate, repository } = req.query;
  
  const orgData = cache.organizations[orgName];
  if (!orgData) {
    return res.status(404).json({ error: 'Organization not found in cache' });
  }
  
  let commits = [];
  
  if (repository) {
    const repoCommits = orgData.commits[repository as string]?.data || [];
    commits = repoCommits;
  } else {
    commits = Object.values(orgData.commits)
      .flatMap(repo => repo.data);
  }
  
  if (startDate && endDate) {
    const start = parseISO(startDate as string);
    const end = parseISO(endDate as string);
    
    commits = commits.filter(commit => {
      const commitDate = parseISO(commit.commit.author.date);
      return isAfter(commitDate, start) && isAfter(end, commitDate);
    });
  }
  
  res.json(commits);
});

// Clear cache
app.delete('/api/cache', (req, res) => {
  cache = {
    lastUpdated: '',
    organizations: {}
  };
  
  saveCache();
  
  res.json({
    success: true,
    message: 'Cache cleared successfully',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Cache server running on http://localhost:${PORT}`);
  cleanOldData(); // Clean old data on startup
});