import axios, { AxiosError } from 'axios';
import { Repository, Commit, Branch, Employee, PodEmployee } from './types';
import { subMonths, subDays, parseISO } from 'date-fns';

const API_URL = 'http://localhost:3001/api';
const CACHE_PERIOD_DAYS = 4; // Change to 120 (4 months) for production

const github = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Accept: 'application/vnd.github.v3+json',
  },
  params: {
    per_page: 100,
  },
  validateStatus: (status) => {
    return status >= 200 && status < 600;
  },
});

// Check if cache server is running
const checkCacheServer = async () => {
  try {
    console.log('Checking cache server status...');
    const response = await axios.get(`${API_URL}/health`, {
      validateStatus: (status) => status === 200,
    });
    console.log('Cache server status:', response.data);
    return response.data.status === 'ok';
  } catch (error) {
    console.error('Cache server not available:', error);
    return false;
  }
};

const handleApiError = (error: unknown, context: string): never => {
  console.error(`API Error in ${context}:`, error);
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    const rateLimitRemaining = axiosError.response?.headers?.['x-ratelimit-remaining'];
    const rateLimitReset = axiosError.response?.headers?.['x-ratelimit-reset'];

    if (!axiosError.response) {
      throw new Error(`Connection error: Unable to reach GitHub API. Please check your internet connection and try again.`);
    }

    if (status === 530) {
      throw new Error('Server connection error. Please try again in a few minutes.');
    } else if (status === 403 && rateLimitRemaining === '0') {
      const resetDate = rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000) : new Date();
      const waitTime = Math.ceil((resetDate.getTime() - Date.now()) / 1000 / 60);
      throw new Error(
        `GitHub API rate limit exceeded. Please try again in ${waitTime} minutes or use a GitHub token.`
      );
    } else if (status === 404) {
      throw new Error(`${context} not found`);
    } else if (status === 401) {
      throw new Error(`Invalid GitHub token for ${context}`);
    } else if (status >= 500) {
      throw new Error(`GitHub server error (${status}). Please try again later.`);
    }
  }
  throw new Error(`Failed to fetch ${context}`);
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchAllPages = async <T>(
  url: string,
  token?: string,
  params: Record<string, string> = {},
  context: string = 'data'
): Promise<T[]> => {
  let page = 1;
  let allData: T[] = [];
  let hasMorePages = true;
  let retryCount = 0;
  const maxRetries = 3;
  const baseDelay = 1000;
  
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  console.log(`Starting pagination for ${url}`);
  
  while (hasMorePages) {
    try {
      console.log(`Fetching page ${page} for ${url}`);
      const response = await github.get<T[]>(url, {
        params: { ...params, page: page.toString() },
        headers
      });
      
      if (response.status === 530) {
        throw new Error('Server connection error (530). Please try again in a few minutes.');
      }

      if (response.status >= 500) {
        throw new Error(`GitHub server error (${response.status}). Please try again later.`);
      }
      
      const data = response.data;
      console.log(`Received ${data?.length || 0} items from page ${page}`);
      
      if (!data || data.length === 0) {
        hasMorePages = false;
      } else {
        allData = allData.concat(data);
        page++;
      }
      
      const linkHeader = response.headers.link;
      if (!linkHeader || !linkHeader.includes('rel="next"')) {
        hasMorePages = false;
      }

      retryCount = 0;

      const remaining = parseInt(response.headers['x-ratelimit-remaining'] || '0');
      const resetTime = parseInt(response.headers['x-ratelimit-reset'] || '0') * 1000;
      
      if (remaining <= 1) {
        const waitTime = resetTime - Date.now();
        if (waitTime > 0) {
          console.log(`Rate limit nearly exceeded, waiting for ${Math.ceil(waitTime / 1000)} seconds`);
          await delay(waitTime);
        }
      }
    } catch (error) {
      console.error(`Error fetching page ${page} for ${url}:`, error);
      
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        
        if (status === 403) {
          const rateLimitRemaining = error.response?.headers?.['x-ratelimit-remaining'];
          const rateLimitReset = error.response?.headers?.['x-ratelimit-reset'];
          
          if (rateLimitRemaining === '0' && rateLimitReset) {
            const resetTime = parseInt(rateLimitReset) * 1000;
            const waitTime = resetTime - Date.now();
            
            if (waitTime > 0) {
              console.log(`Rate limit exceeded, waiting for ${Math.ceil(waitTime / 1000)} seconds`);
              await delay(waitTime);
              continue;
            }
          }
        }

        if (status === 530 || (status && status >= 500)) {
          if (retryCount < maxRetries) {
            retryCount++;
            const waitTime = baseDelay * Math.pow(2, retryCount - 1);
            console.log(`Server error (${status}), retrying in ${waitTime}ms (attempt ${retryCount} of ${maxRetries})`);
            await delay(waitTime);
            continue;
          }
        }
      }
      
      throw error;
    }
  }
  
  console.log(`Finished fetching all pages for ${url}. Total items: ${allData.length}`);
  return allData;
};

export const fetchEmployeeNames = async (employeeIds: string[]): Promise<Record<string, Employee>> => {
  const employees: Record<string, Employee> = {};
  const batchSize = 10;
  
  console.log(`Fetching employee names for ${employeeIds.length} employees`);
  
  for (let i = 0; i < employeeIds.length; i += batchSize) {
    const batch = employeeIds.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1}, size: ${batch.length}`);
    
    const promises = batch.map(async id => {
      try {
        const response = await axios.get(`${API_URL}/employees/${id}`, {
          validateStatus: (status) => status === 200,
        });
        return {
          login: id,
          name: response.data.name || id,
          email: response.data.email || null,
          data: response.data
        } as Employee;
      } catch (error) {
        console.error(`Error fetching employee ${id}:`, error);
        return {
          login: id,
          name: id,
          email: null
        } as Employee;
      }
    });
    
    const results = await Promise.all(promises);
    results.forEach((employee) => {
      if (employee) {
        employees[employee.login] = employee;
      }
    });
    
    if (i + batchSize < employeeIds.length) {
      await delay(1000);
    }
  }
  
  console.log(`Finished fetching employee names. Found ${Object.keys(employees).length} employees`);
  return employees;
};

export const fetchPodEmployees = async (podIds: string[]): Promise<PodEmployee[]> => {
  const employees: PodEmployee[] = [];
  
  for (const podId of podIds) {
    try {
      const response = await axios.get(`${API_URL}/pods/${podId}/employees`, {
        validateStatus: (status) => status === 200,
      });
      employees.push(...response.data);
    } catch (error) {
      console.error(`Error fetching employees from pod ${podId}:`, error);
    }
  }
  
  return employees;
};

export const fetchOrgRepos = async (org: string, token?: string): Promise<Repository[]> => {
  console.log(`Fetching repositories for organization: ${org}`);
  const isCacheAvailable = await checkCacheServer();
  console.log('Cache server available:', isCacheAvailable);

  if (isCacheAvailable) {
    try {
      console.log('Checking cache for repositories');
      const cacheResponse = await axios.get(`${API_URL}/cache/all-data`);
      const repos = cacheResponse.data.repositories[org];
      if (repos && repos.length > 0) {
        console.log('Using cached repositories');
        return repos;
      }
    } catch (error) {
      console.log('Cache miss for repositories');
    }
  }

  try {
    console.log('Fetching repositories from GitHub API');
    const repos = await fetchAllPages<Repository>(
      `/orgs/${org}/repos`,
      token,
      {},
      `repositories for ${org}`
    );
    
    console.log(`Found ${repos.length} repositories`);
    
    if (repos.length > 0 && isCacheAvailable) {
      try {
        console.log('Caching repositories');
        await axios.post(`${API_URL}/cache/repositories`, { org, data: repos });
        console.log('Cached repositories successfully');
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
  console.log(`Fetching branches for repository: ${fullName}`);
  const isCacheAvailable = await checkCacheServer();
  console.log('Cache server available:', isCacheAvailable);

  if (isCacheAvailable) {
    try {
      console.log('Checking cache for branches');
      const cacheResponse = await axios.get(`${API_URL}/cache/all-data`);
      const [org, repo] = fullName.split('/');
      const branches = cacheResponse.data.branches?.[`${org}/${repo}`];
      if (branches && branches.length > 0) {
        console.log('Using cached branches');
        return branches;
      }
    } catch (error) {
      console.log('Cache miss for branches');
    }
  }

  try {
    console.log('Fetching branches from GitHub API');
    const branches = await fetchAllPages<Branch>(
      `/repos/${fullName}/branches`,
      token,
      {},
      `branches for ${fullName}`
    );
    
    console.log(`Found ${branches.length} branches`);
    
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
  console.log(`Fetching commits for ${fullName}/${branch.name}`);
  const params: Record<string, string> = {
    sha: branch.commit.sha,
  };
  
  if (since) {
    params.since = since.toISOString();
  }
  
  if (until) {
    params.until = until.toISOString();
  }

  try {
    console.log(`Fetching commits for ${fullName}/${branch.name}`);
    const commits = await fetchAllPages<Commit>(
      `/repos/${fullName}/commits`,
      token,
      params,
      `commits for ${fullName}/${branch.name}`
    );
    
    console.log(`Found ${commits.length} commits before filtering`);
    
    const filteredCommits = commits
      .filter(commit => {
        const message = commit.commit.message.toLowerCase();
        return !message.includes('merge') && 
               !message.includes('pull request') && 
               !message.includes('pr #');
      })
      .map(commit => ({
        ...commit,
        timestamp: new Date(commit.commit.author.date).getTime(),
        date: commit.commit.author.date.split('T')[0]
      }));
    
    console.log(`Filtered to ${filteredCommits.length} commits`);
    return filteredCommits;
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
    console.log(`Fetching all commits for repository: ${repo.full_name}`);
    const branches = await fetchRepoBranches(repo.full_name, token);
    console.log(`Found ${branches.length} branches`);
    
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
    
    console.log(`Fetched ${commits.length} total commits for ${repo.full_name}`);
    return { commits, branches };
  } catch (error) {
    console.error(`Error fetching data for ${repo.full_name}:`, error);
    return { commits: [], branches: [] };
  }
};

export const cacheOrgData = async (
  org: string,
  token?: string
): Promise<void> => {
  const endDate = new Date();
  let startDate: Date;

  try {
    // Get the last commit date for this organization
    const cacheResponse = await axios.get(`${API_URL}/cache/stats`);
    const lastCommitDate = cacheResponse.data?.lastCommitDates?.[org];

    if (lastCommitDate) {
      // If we have a last commit date, start from there
      startDate = parseISO(lastCommitDate);
      console.log(`Continuing from last cached date: ${startDate.toISOString()}`);
    } else {
      // If no previous cache, start from CACHE_PERIOD_DAYS ago
      startDate = subDays(endDate, CACHE_PERIOD_DAYS);
      console.log(`Starting fresh ${CACHE_PERIOD_DAYS}-day cache from: ${startDate.toISOString()}`);
    }
  } catch (error) {
    console.error('Error checking cache stats:', error);
    startDate = subDays(endDate, CACHE_PERIOD_DAYS);
  }

  const BATCH_SIZE = 5; // Process 5 repos at a time

  console.log(`Caching data from ${startDate.toISOString()} to ${endDate.toISOString()}`);

  try {
    // First, fetch and cache repositories
    const repos = await fetchOrgRepos(org, token);
    console.log(`Found ${repos.length} repositories to cache`);
    
    // Cache repositories
    await axios.post(`${API_URL}/cache/repositories`, {
      org,
      data: repos
    });
    
    // Process repositories in batches
    for (let i = 0; i < repos.length; i += BATCH_SIZE) {
      const batch = repos.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(repos.length/BATCH_SIZE)}`);
      
      // Process each repo in the batch concurrently
      const batchPromises = batch.map(async (repo) => {
        try {
          console.log(`Processing repository: ${repo.full_name}`);
          const { commits, branches } = await fetchAllRepoCommits(repo, token, startDate, endDate);
          
          if (commits.length > 0) {
            await axios.post(`${API_URL}/cache/commits`, {
              repository: repo.full_name,
              commits,
              dateRange: {
                since: startDate.toISOString(),
                until: endDate.toISOString()
              }
            });
            console.log(`Cached ${commits.length} commits for ${repo.full_name}`);
            return { success: true, repo: repo.full_name, commits: commits.length };
          }
          return { success: true, repo: repo.full_name, commits: 0 };
        } catch (error) {
          console.error(`Failed to cache data for ${repo.full_name}:`, error);
          return { success: false, repo: repo.full_name, error };
        }
      });
      
      // Wait for batch to complete
      const results = await Promise.allSettled(batchPromises);
      
      // Log batch results
      const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
      console.log(`Batch completed: ${succeeded} succeeded, ${failed} failed`);
      
      // Add delay between batches to avoid rate limits
      if (i + BATCH_SIZE < repos.length) {
        console.log('Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log('Finished caching organization data');
  } catch (error) {
    console.error('Error caching organization data:', error);
    throw error;
  }
};