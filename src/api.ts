import axios, { AxiosError } from 'axios';
import { Repository, Commit, Branch, Employee } from './types';
import { getFromCache, saveToCache } from './cache';

const createGithubClient = (token?: string) => axios.create({
  baseURL: 'https://api.github.com',
  params: {
    per_page: '100',
  },
  headers: token ? {
    Authorization: `Bearer ${token}`,
  } : {},
});

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

const silentFetch = async <T>(promise: Promise<T>, context: string): Promise<T | []> => {
  try {
    return await promise;
  } catch (error) {
    console.debug(`Error fetching ${context}:`, error);
    return [];
  }
};

const fetchAllPages = async <T>(
  url: string,
  token?: string,
  params: Record<string, string> = {},
  context: string = 'data'
): Promise<T[]> => {
  const github = createGithubClient(token);
  let page = 1;
  let allData: T[] = [];
  let consecutiveEmptyPages = 0;
  const MAX_EMPTY_PAGES = 3;
  
  while (true) {
    try {
      const response = await silentFetch(
        github.get<T[]>(url, { params: { ...params, page: page.toString() } }),
        `${context} page ${page}`
      );
      
      const data = Array.isArray(response) ? response : [];
      
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
  const github = createGithubClient(token);
  const employees: Record<string, Employee> = {};
  const batchSize = 10;
  const retryDelay = 1000;
  const maxRetries = 3;
  
  // Cache key for batch
  const cacheKey = `employees_${employeeIds.sort().join('_')}_${token ? 'auth' : 'noauth'}`;
  const cachedEmployees = getFromCache<Record<string, Employee>>('employees', cacheKey);
  
  if (cachedEmployees) {
    console.log('Using cached employee data');
    return cachedEmployees;
  }
  
  for (let i = 0; i < employeeIds.length; i += batchSize) {
    const batch = employeeIds.slice(i, i + batchSize);
    const promises = batch.map(async id => {
      let retries = 0;
      while (retries < maxRetries) {
        try {
          const response = await github.get<any>(`/users/${id}`);
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
      // Return a default employee object if all retries fail
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
    
    // Add small delay between batches to avoid rate limiting
    if (i + batchSize < employeeIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Cache the results
  if (Object.keys(employees).length > 0) {
    saveToCache('employees', cacheKey, employees);
  }
  
  return employees;
};

export const fetchOrgRepos = async (org: string, token?: string): Promise<Repository[]> => {
  const cacheKey = `org_${org}_${token ? 'auth' : 'noauth'}`;
  
  const cachedRepos = getFromCache<Repository[]>('repositories', cacheKey);
  if (cachedRepos) {
    console.log(`Using cached repositories for ${org}`);
    return cachedRepos;
  }
  
  console.log(`Fetching repositories for ${org} from GitHub API`);
  try {
    const repos = await fetchAllPages<Repository>(
      `/orgs/${org}/repos`,
      token,
      {},
      `repositories for ${org}`
    );
    
    if (repos.length > 0) {
      saveToCache('repositories', cacheKey, repos);
    }
    
    return repos;
  } catch (error) {
    return handleApiError(error, `repositories for ${org}`);
  }
};

export const fetchRepoBranches = async (fullName: string, token?: string): Promise<Branch[]> => {
  const cacheKey = `branches_${fullName}_${token ? 'auth' : 'noauth'}`;
  
  const cachedBranches = getFromCache<Branch[]>('branches', cacheKey);
  if (cachedBranches) {
    console.log(`Using cached branches for ${fullName}`);
    return cachedBranches;
  }
  
  console.log(`Fetching branches for ${fullName} from GitHub API`);
  try {
    const branches = await fetchAllPages<Branch>(
      `/repos/${fullName}/branches`,
      token,
      {},
      `branches for ${fullName}`
    );
    
    if (branches.length > 0) {
      saveToCache('branches', cacheKey, branches);
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
  
  const sinceStr = since ? since.toISOString() : 'none';
  const untilStr = until ? until.toISOString() : 'none';
  const cacheKey = `commits_${fullName}_${branch.name}_${sinceStr}_${untilStr}_${token ? 'auth' : 'noauth'}`;
  
  const cachedCommits = getFromCache<Commit[]>('commits', cacheKey);
  if (cachedCommits) {
    console.log(`Using cached commits for ${fullName}/${branch.name}`);
    return cachedCommits;
  }
  
  console.log(`Fetching commits for ${fullName}/${branch.name} from GitHub API`);
  try {
    const commits = await fetchAllPages<Commit>(
      `/repos/${fullName}/commits`,
      token,
      params,
      `commits for ${fullName}/${branch.name}`
    );
    
    if (commits.length > 0) {
      saveToCache('commits', cacheKey, commits);
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