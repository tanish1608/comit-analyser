import { Repository, Commit, Branch } from './types';

interface CacheEntry<T> {
  timestamp: number;
  data: T;
  expiresAt: number;
  source: 'API' | 'Cache';
}

interface Cache {
  repositories: Record<string, CacheEntry<Repository[]>>;
  branches: Record<string, CacheEntry<Branch[]>>;
  commits: Record<string, CacheEntry<Commit[]>>;
}

const CACHE_KEY = 'github-analyzer-cache';
const CACHE_TTL = 1000 * 60 * 60; // 1 hour in milliseconds
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB

let cache: Cache = {
  repositories: {},
  branches: {},
  commits: {},
};

const getCacheSize = (): number => {
  try {
    return new Blob([JSON.stringify(cache)]).size;
  } catch (error) {
    console.error('Error calculating cache size:', error);
    return 0;
  }
};

const trimCache = () => {
  while (getCacheSize() > MAX_CACHE_SIZE) {
    let oldestTimestamp = Date.now();
    let oldestType: keyof Cache | null = null;
    let oldestKey = '';
    
    Object.keys(cache).forEach((type) => {
      const cacheType = type as keyof Cache;
      Object.entries(cache[cacheType]).forEach(([key, entry]) => {
        if (entry.timestamp < oldestTimestamp) {
          oldestTimestamp = entry.timestamp;
          oldestType = cacheType;
          oldestKey = key;
        }
      });
    });
    
    if (oldestType && oldestKey) {
      delete cache[oldestType][oldestKey];
      console.log(`Removed old cache entry: ${oldestType}/${oldestKey}`);
    } else {
      break;
    }
  }
};

const loadCache = (): void => {
  try {
    const savedCache = localStorage.getItem(CACHE_KEY);
    if (savedCache) {
      cache = JSON.parse(savedCache);
      console.log('Cache loaded from localStorage');
      trimCache();
    }
  } catch (error) {
    console.error('Error loading cache:', error);
    cache = {
      repositories: {},
      branches: {},
      commits: {},
    };
  }
};

const saveCache = (): void => {
  try {
    trimCache();
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    console.log('Cache saved to localStorage');
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded, clearing old entries');
      clearExpiredCache();
      trimCache();
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch (retryError) {
        console.error('Failed to save cache even after trimming:', retryError);
      }
    } else {
      console.error('Error saving cache:', error);
    }
  }
};

export const getFromCache = <T>(
  cacheType: keyof Cache,
  key: string
): T | null => {
  loadCache();
  
  const entry = cache[cacheType][key] as CacheEntry<T> | undefined;
  
  if (!entry) {
    return null;
  }
  
  if (Date.now() > entry.expiresAt) {
    delete cache[cacheType][key];
    saveCache();
    return null;
  }
  
  return entry.data;
};

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
    source: 'API'
  };
  
  saveCache();
};

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

loadCache();

setInterval(clearExpiredCache, CACHE_TTL);