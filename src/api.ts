import axios from 'axios';
import { Repository, Commit, Branch } from './types';
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

const silentFetch = async <T>(promise: Promise<T>): Promise<T | []> => {
  try {
    return await promise;
  } catch (error) {
    console.debug('Suppressed error:', error);
    return [];
  }
};

const fetchAllPages = async <T>(
  url: string,
  token?: string,
  params: Record<string, string> = {}
): Promise<T[]> => {
  const github = createGithubClient(token);
  let page = 1;
  let allData: T[] = [];
  
  while (true) {
    const { data = [] } = await silentFetch(
      github.get<T[]>(url, { params: { ...params, page: page.toString() } })
    );
    
    if (!data.length) break;
    allData = allData.concat(data);
    page++;
    
    // GitHub's API typically has a max of 1000 items (10 pages)
    if (page > 10) break;
  }
  
  return allData;
};

export const fetchOrgRepos = async (org: string, token?: string): Promise<Repository[]> => {
  // Generate a cache key based on org and token presence
  const cacheKey = `org_${org}_${token ? 'auth' : 'noauth'}`;
  
  // Try to get from cache first
  const cachedRepos = getFromCache<Repository[]>('repositories', cacheKey);
  if (cachedRepos) {
    console.log(`Using cached repositories for ${org}`);
    return cachedRepos;
  }
  
  // If not in cache, fetch from API
  console.log(`Fetching repositories for ${org} from GitHub API`);
  const repos = await fetchAllPages<Repository>(`/orgs/${org}/repos`, token);
  
  // Save to cache
  saveToCache('repositories', cacheKey, repos);
  
  return repos;
};

export const fetchRepoBranches = async (fullName: string, token?: string): Promise<Branch[]> => {
  // Generate a cache key
  const cacheKey = `branches_${fullName}_${token ? 'auth' : 'noauth'}`;
  
  // Try to get from cache first
  const cachedBranches = getFromCache<Branch[]>('branches', cacheKey);
  if (cachedBranches) {
    console.log(`Using cached branches for ${fullName}`);
    return cachedBranches;
  }
  
  // If not in cache, fetch from API
  console.log(`Fetching branches for ${fullName} from GitHub API`);
  const branches = await fetchAllPages<Branch>(`/repos/${fullName}/branches`, token);
  
  // Save to cache
  saveToCache('branches', cacheKey, branches);
  
  return branches;
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
  
  // Generate a cache key that includes the date range
  const sinceStr = since ? since.toISOString() : 'none';
  const untilStr = until ? until.toISOString() : 'none';
  const cacheKey = `commits_${fullName}_${branch.name}_${sinceStr}_${untilStr}_${token ? 'auth' : 'noauth'}`;
  
  // Try to get from cache first
  const cachedCommits = getFromCache<Commit[]>('commits', cacheKey);
  if (cachedCommits) {
    console.log(`Using cached commits for ${fullName}/${branch.name}`);
    return cachedCommits;
  }
  
  // If not in cache, fetch from API
  console.log(`Fetching commits for ${fullName}/${branch.name} from GitHub API`);
  const commits = await fetchAllPages<Commit>(`/repos/${fullName}/commits`, token, params);
  
  // Save to cache
  saveToCache('commits', cacheKey, commits);
  
  return commits;
};

export const fetchAllRepoCommits = async (
  repo: Repository,
  token?: string,
  since?: Date,
  until?: Date
): Promise<{ commits: Commit[]; branches: Branch[] }> => {
  const branches = await fetchRepoBranches(repo.full_name, token);
  
  // Fetch commits for each branch in parallel
  const commitsPromises = branches.map(branch => 
    fetchBranchCommits(repo.full_name, branch, token, since, until)
  );
  
  const results = await Promise.allSettled(commitsPromises);
  
  const commits = results
    .filter((result): result is PromiseFulfilledResult<Commit[]> => 
      result.status === 'fulfilled'
    )
    .map(result => result.value)
    .flat();
  
  return { commits, branches };
};