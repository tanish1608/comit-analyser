const axios = require('axios');

class CacheClient {
  constructor(baseURL = 'http://localhost:3001') {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL,
      timeout: 5000,
    });
  }

  async getStats() {
    try {
      const response = await this.client.get('/api/cache/stats');
      return response.data;
    } catch (error) {
      console.error('Error getting cache stats:', error.message);
      throw error;
    }
  }

  async getFromCache(type, key) {
    try {
      const response = await this.client.get(`/api/cache/${type}/${key}`);
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        // Cache miss
        return null;
      }
      console.error(`Error getting ${type} from cache:`, error.message);
      throw error;
    }
  }

  async saveToCache(type, key, data) {
    try {
      await this.client.post(`/api/cache/${type}/${key}`, { data });
      return true;
    } catch (error) {
      console.error(`Error saving ${type} to cache:`, error.message);
      throw error;
    }
  }

  async clearExpired() {
    try {
      const response = await this.client.post('/api/cache/clear-expired');
      return response.data;
    } catch (error) {
      console.error('Error clearing expired cache:', error.message);
      throw error;
    }
  }

  async clearAll() {
    try {
      const response = await this.client.post('/api/cache/clear-all');
      return response.data;
    } catch (error) {
      console.error('Error clearing all cache:', error.message);
      throw error;
    }
  }

  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      console.error('Cache server health check failed:', error.message);
      throw error;
    }
  }
}

module.exports = CacheClient;