import axios, { AxiosError } from 'axios';
import { Repository, Commit, Branch, Employee } from './types';

const API_URL = 'http://localhost:3001/api';
const github = axios.create({
  baseURL: 'https://api.github.com',
  params: {
    per_page: '100',
  },
});

// Check if cache server is running
const checkCacheServer = async () => {
  try {
    await axios.get(`${API_URL}/health`);
    return true;
  } catch (error) {
    console.warn('Cache server not available');
    return false;
  }
};

const handleApiError = (error: unknown, context: string): never => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 404) {
      throw new Error(`${context} not found`);
    } else if (axiosError.response?.status === 403) {
      throw new Error(`Rate limit exceeded for ${context}. Please try again later or use a GitHub token`);
    } else if (axiosError.response?.status === 401) {
      throw new Error(`Invalid GitHub token for ${context}`);
    }
  }
  throw new Error(`Failed to fetch ${context}`);
};

const fetchAllPages = async <T>(
  url: string,
  token?: string,
  params: Record<string, string> = {},
  context: string = 'data'
): Promise<T[]> => {
  let page = 1;
  let allData: T[] = [];
  let consecutiveEmptyPages = 0;
  const MAX_EMPTY_PAGES = 3;
  
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  
  while (true) {
    try {
      const response = await github.get<T[]>(url, {
        params: { ...params, page: page.toString() },
        headers
      });
      
      const data = response.data;
      
      if (!data.length) {
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= MAX_EMPTY_PAGES) break;
      } else {
        consecutiveEmptyPages = 0;
        allData = allData.concat(data);
      }
      
      page++;
      
      if (page > 10) break;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        console.warn('Rate limit reached, stopping pagination');
        break;
      }
      throw error;
    }
  }
  
  return allData;
};

export const fetchEmployeeNames = async (employeeIds: string[], token?: string): Promise<Record<string, Employee>> => {
  const employees: Record<string, Employee> = {};
  const batchSize = 10;
  const retryDelay = 1000;
  const maxRetries = 3;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  
  for (let i = 0; i < employeeIds.length; i += batchSize) {
    const batch = employeeIds.slice(i, i + batchSize);
    const promises = batch.map(async id => {
      let retries = 0;
      while (retries < maxRetries) {
        try {
          const response = await github.get(`/users/${id}`, { headers });
          if (response.data) {
            return {
              login: id,
              name: response.data.name || id,
              email: response.data.email || null,
              avatar_url: response.data.avatar_url,
              data: response.data
            } as Employee;
          }
        } catch (error) {
          if (axios.isAxiosError(error)) {
            if (error.response?.status === 403) {
              console.warn(`Rate limit reached for user ${id}, waiting longer...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay * 5));
            } else if (error.response?.status === 404) {
              console.warn(`User ${id} not found`);
              break;
            }
          }
          retries++;
          if (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay * retries));
          }
        }
      }
      return {
        login: id,
        name: id,
        email: null,
        avatar_url: undefined
      } as Employee;
    });
    
    const results = await Promise.all(promises);
    results.forEach((employee) => {
      if (employee) {
        employees[employee.login] = employee;
      }
    });
    
    if (i + batchSize < employeeIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return employees;
};

export const fetchOrgRepos = async (org: string, token?: string): Promise<Repository[]> => {
  const isCacheAvailable = await checkCacheServer();

  if (isCacheAvailable) {
    try {
      const cacheResponse = await axios.get(`${API_URL}/cache/repositories/${org}`);
      if (cacheResponse.data && cacheResponse.data.length > 0) {
        console.log('Using cached repositories');
        return cacheResponse.data;
      }
    } catch (error) {
      console.log('Cache miss for repositories');
    }
  }

  try {
    const repos = await fetchAllPages<Repository>(
      `/orgs/${org}/repos`,
      token,
      {},
      `repositories for ${org}`
    );
    
    if (repos.length > 0 && isCacheAvailable) {
      try {
        await axios.post(`${API_URL}/cache/repositories/${org}`, { data: repos });
      } catch (error) {
        console.warn('Failed to cache repositories:', error);
      }
    }
    
    return repos;
  } catch (error) {
    return handleApiError(error, `repositories for ${org}`);
  }
};

export const fetchRepoBranches = async (fullName: string, token?: string): Promise<Branch[]> => {
  const isCacheAvailable = await checkCacheServer();

  if (isCacheAvailable) {
    try {
      const cacheResponse = await axios.get(`${API_URL}/cache/branches/${fullName}`);
      if (cacheResponse.data && cacheResponse.data.length > 0) {
        console.log('Using cached branches');
        return cacheResponse.data;
      }
    } catch (error) {
      console.log('Cache miss for branches');
    }
  }

  try {
    const branches = await fetchAllPages<Branch>(
      `/repos/${fullName}/branches`,
      token,
      {},
      `branches for ${fullName}`
    );
    
    if (branches.length > 0 && isCacheAvailable) {
      try {
        await axios.post(`${API_URL}/cache/branches/${fullName}`, { data: branches });
      } catch (error) {
        console.warn('Failed to cache branches:', error);
      }
    }
    
    return branches;
  } catch (error) {
    return handleApiError(error, `branches for ${fullName}`);
  }
};

export const fetchBranchCommits = async (
  fullName: string,
  branch: Branch,
  token?: string,
  since?: Date,
  until?: Date
): Promise<Commit[]> => {
  const params: Record<string, string> = {
    sha: branch.commit.sha,
  };
  
  if (since) {
    params.since = since.toISOString();
  }
  
  if (until) {
    params.until = until.toISOString();
  }

  const cacheKey = `${fullName}/${branch.name}/${since?.toISOString() || 'none'}/${until?.toISOString() || 'none'}`;
  const isCacheAvailable = await checkCacheServer();
  
  if (isCacheAvailable) {
    try {
      const cacheResponse = await axios.get(`${API_URL}/cache/commits/${encodeURIComponent(cacheKey)}`);
      if (cacheResponse.data && cacheResponse.data.length > 0) {
        console.log('Using cached commits');
        return cacheResponse.data;
      }
    } catch (error) {
      console.log('Cache miss for commits');
    }
  }

  try {
    const commits = await fetchAllPages<Commit>(
      `/repos/${fullName}/commits`,
      token,
      params,
      `commits for ${fullName}/${branch.name}`
    );
    
    if (commits.length > 0 && isCacheAvailable) {
      try {
        await axios.post(`${API_URL}/cache/commits/${encodeURIComponent(cacheKey)}`, { data: commits });
      } catch (error) {
        console.warn('Failed to cache commits:', error);
      }
    }
    
    return commits;
  } catch (error) {
    return handleApiError(error, `commits for ${fullName}/${branch.name}`);
  }
};

export const fetchAllRepoCommits = async (
  repo: Repository,
  token?: string,
  since?: Date,
  until?: Date
): Promise<{ commits: Commit[]; branches: Branch[] }> => {
  try {
    const branches = await fetchRepoBranches(repo.full_name, token);
    
    const commitsPromises = branches.map(branch => 
      fetchBranchCommits(repo.full_name, branch, token, since, until)
        .catch(error => {
          console.error(`Error fetching commits for ${repo.full_name}/${branch.name}:`, error);
          return [];
        })
    );
    
    const results = await Promise.allSettled(commitsPromises);
    
    const commits = results
      .filter((result): result is PromiseFulfilledResult<Commit[]> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value)
      .flat();
    
    return { commits, branches };
  } catch (error) {
    console.error(`Error fetching data for ${repo.full_name}:`, error);
    return { commits: [], branches: [] };
  }
};