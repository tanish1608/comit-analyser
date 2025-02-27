// Browser-compatible cache implementation
// Uses localStorage instead of file system

import { Repository, Commit, Branch } from './types';

// Define cache structure
interface CacheEntry<T> {
  timestamp: number;
  data: T;
  expiresAt: number;
}

interface Cache {
  repositories: Record<string, CacheEntry<Repository[]>>;
  branches: Record<string, CacheEntry<Branch[]>>;
  commits: Record<string, CacheEntry<Commit[]>>;
}

// Cache storage key
const CACHE_STORAGE_KEY = 'github-cache';
const CACHE_TTL = 1000 * 60 * 60; // 1 hour in milliseconds

// Initialize cache
let cache: Cache = {
  repositories: {},
  branches: {},
  commits: {},
};

// Load cache from localStorage
const loadCache = (): void => {
  try {
    const storedCache = localStorage.getItem(CACHE_STORAGE_KEY);
    if (storedCache) {
      cache = JSON.parse(storedCache);
      console.log('Cache loaded from localStorage');
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

// Save cache to localStorage
const saveCache = (): void => {
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
    console.log('Cache saved to localStorage');
  } catch (error) {
    console.error('Error saving cache:', error);
  }
};

// Get data from cache
export const getFromCache = <T>(
  cacheType: keyof Cache,
  key: string
): T | null => {
  loadCache();
  
  const entry = cache[cacheType][key] as CacheEntry<T> | undefined;
  
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
export const saveToCache = <T>(
  cacheType: keyof Cache,
  key: string,
  data: T
): void => {
  loadCache();
  
  cache[cacheType][key] = {
    timestamp: Date.now(),
    data,
    expiresAt: Date.now() + CACHE_TTL,
  };
  
  saveCache();
};

// Clear expired cache entries
export const clearExpiredCache = (): void => {
  loadCache();
  
  let entriesRemoved = 0;
  
  Object.keys(cache).forEach((type) => {
    const cacheType = type as keyof Cache;
    Object.keys(cache[cacheType]).forEach((key) => {
      const entry = cache[cacheType][key];
      if (Date.now() > entry.expiresAt) {
        delete cache[cacheType][key];
        entriesRemoved++;
      }
    });
  });
  
  if (entriesRemoved > 0) {
    console.log(`Cleared ${entriesRemoved} expired cache entries`);
    saveCache();
  }
};

// Initialize cache on module load
loadCache();

// Clear expired cache entries every hour
setInterval(clearExpiredCache, CACHE_TTL);