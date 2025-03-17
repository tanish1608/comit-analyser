import axios, { AxiosError } from 'axios';
import { Repository, Commit, Branch, Employee } from './types';

const API_URL = 'http://localhost:3001/api';
const github = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Accept: 'application/vnd.github.v3+json',
  },
  params: {
    per_page: 100,
  },
});

// Check if cache server is running
const checkCacheServer = async () => {
  try {
    console.log('Checking cache server status...');
    const response = await axios.get(`${API_URL}/health`);
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

    if (status === 403 && rateLimitRemaining === '0') {
      const resetDate = rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000) : new Date();
      const waitTime = Math.ceil((resetDate.getTime() - Date.now()) / 1000 / 60);
      throw new Error(
        `GitHub API rate limit exceeded. Please try again in ${waitTime} minutes or use a GitHub token.`
      );
    } else if (status === 404) {
      throw new Error(`${context} not found`);
    } else if (status === 401) {
      throw new Error(`Invalid GitHub token for ${context}`);
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
      
      const data = response.data;
      console.log(`Received ${data?.length || 0} items from page ${page}`);
      
      if (!data || data.length === 0) {
        hasMorePages = false;
      } else {
        allData = allData.concat(data);
        page++;
      }
      
      // Check for last page using Link header
      const linkHeader = response.headers.link;
      if (!linkHeader || !linkHeader.includes('rel="next"')) {
        hasMorePages = false;
      }

      // Reset retry count on successful request
      retryCount = 0;

      // Check rate limit headers
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
              continue; // Retry the same page after waiting
            }
          }
        }
      }
      
      if (retryCount < maxRetries) {
        retryCount++;
        const waitTime = baseDelay * Math.pow(2, retryCount - 1);
        console.log(`Retrying in ${waitTime}ms (attempt ${retryCount} of ${maxRetries})`);
        await delay(waitTime);
        continue; // Retry the same page
      }
      
      throw error;
    }
  }
  
  console.log(`Finished fetching all pages for ${url}. Total items: ${allData.length}`);
  return allData;
};

export const fetchEmployeeNames = async (employeeIds: string[], token?: string): Promise<Record<string, Employee>> => {
  const employees: Record<string, Employee> = {};
  const batchSize = 10;
  const retryDelay = 1000;
  const maxRetries = 3;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  
  console.log(`Fetching employee names for ${employeeIds.length} employees`);
  
  for (let i = 0; i < employeeIds.length; i += batchSize) {
    const batch = employeeIds.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1}, size: ${batch.length}`);
    
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
          console.error(`Error fetching user ${id}, attempt ${retries + 1}:`, error);
          if (axios.isAxiosError(error)) {
            if (error.response?.status === 403) {
              const rateLimitReset = error.response?.headers?.['x-ratelimit-reset'];
              if (rateLimitReset) {
                const resetTime = parseInt(rateLimitReset) * 1000;
                const waitTime = resetTime - Date.now();
                if (waitTime > 0) {
                  console.log(`Rate limit reached for user ${id}, waiting for ${Math.ceil(waitTime / 1000)} seconds`);
                  await delay(waitTime);
                  continue;
                }
              }
            } else if (error.response?.status === 404) {
              console.warn(`User ${id} not found`);
              break;
            }
          }
          retries++;
          if (retries < maxRetries) {
            await delay(retryDelay * retries);
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
      await delay(1000);
    }
  }
  
  console.log(`Finished fetching employee names. Found ${Object.keys(employees).length} employees`);
  return employees;
};

export const fetchOrgRepos = async (org: string, token?: string): Promise<Repository[]> => {
  console.log(`Fetching repositories for organization: ${org}`);
  const isCacheAvailable = await checkCacheServer();
  console.log('Cache server available:', isCacheAvailable);

  if (isCacheAvailable) {
    try {
      console.log('Checking cache for repositories');
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
        await axios.post(`${API_URL}/cache/repositories/${org}`, { data: repos });
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
    console.log('Fetching branches from GitHub API');
    const branches = await fetchAllPages<Branch>(
      `/repos/${fullName}/branches`,
      token,
      {},
      `branches for ${fullName}`
    );
    
    console.log(`Found ${branches.length} branches`);
    
    if (branches.length > 0 && isCacheAvailable) {
      try {
        console.log('Caching branches');
        await axios.post(`${API_URL}/cache/branches/${fullName}`, { data: branches });
        console.log('Cached branches successfully');
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

  const cacheKey = `${fullName}/${branch.name}/${since?.toISOString() || 'none'}/${until?.toISOString() || 'none'}`;
  const isCacheAvailable = await checkCacheServer();
  console.log('Cache server available:', isCacheAvailable);
  
  if (isCacheAvailable) {
    try {
      console.log('Checking cache for commits');
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
    console.log(`Fetching commits for ${fullName}/${branch.name}`);
    const commits = await fetchAllPages<Commit>(
      `/repos/${fullName}/commits`,
      token,
      params,
      `commits for ${fullName}/${branch.name}`
    );
    
    console.log(`Found ${commits.length} commits before filtering`);
    
    // Filter out merge commits and pull request commits
    const filteredCommits = commits.filter(commit => {
      const message = commit.commit.message.toLowerCase();
      return !message.includes('merge') && 
             !message.includes('pull request') && 
             !message.includes('pr #');
    });
    
    console.log(`Filtered to ${filteredCommits.length} commits`);
    
    if (filteredCommits.length > 0 && isCacheAvailable) {
      try {
        console.log('Caching commits');
        await axios.post(`${API_URL}/cache/commits/${encodeURIComponent(cacheKey)}`, { data: filteredCommits });
        console.log('Cached commits successfully');
      } catch (error) {
        console.warn('Failed to cache commits:', error);
      }
    }
    
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

export const fetchPodEmployees = async (pods: Pod[]): Promise<PodEmployee[]> => {
  const employees: PodEmployee[] = [];
  
  for (const pod of pods) {
    try {
      const response = await axios.get(pod.apiUrl);
      const podEmployees = response.data.map((emp: any) => ({
        empiId: emp.empiId,
        name: emp.name,
        pod: pod.name,
        hasCommits: false
      }));
      employees.push(...podEmployees);
    } catch (error) {
      console.error(`Error fetching employees from pod ${pod.name}:`, error);
    }
  }
  
  return employees;
};

export const compareEmployeesWithCommits = (
  podEmployees: PodEmployee[],
  commitStats: Record<string, UserStats>
): PodEmployee[] => {
  return podEmployees.map(employee => ({
    ...employee,
    hasCommits: !!commitStats[employee.empiId]
  }));
};