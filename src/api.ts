import axios from 'axios';
import { Repository, Commit, Branch } from './types';

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
    const result = await silentFetch(
      github.get<T[]>(url, { params: { ...params, page: page.toString() } })
    );
    const data = 'data' in result ? result.data : [];
    
    if (!data.length) break;
    allData = allData.concat(data);
    page++;
    
    // GitHub's API typically has a max of 1000 items (10 pages)
    if (page > 10) break;
  }
  
  return allData;
};

export const fetchOrgRepos = async (org: string, token?: string): Promise<Repository[]> => {
  return fetchAllPages<Repository>(`/orgs/${org}/repos`, token);
};

export const fetchRepoBranches = async (fullName: string, token?: string): Promise<Branch[]> => {
  return fetchAllPages<Branch>(`/repos/${fullName}/branches`, token);
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

  return fetchAllPages<Commit>(`/repos/${fullName}/commits`, token, params);
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