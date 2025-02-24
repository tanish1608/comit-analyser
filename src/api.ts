import axios from 'axios';
import { Repository, Commit, Branch } from './types';

const github = axios.create({
  baseURL: 'https://api.github.com',
  params: {
    per_page: '100',
  },
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
  params: Record<string, string> = {}
): Promise<T[]> => {
  let page = 1;
  let allData: T[] = [];
  
  while (true) {
    const response = await silentFetch(
      github.get<T[]>(url, { params: { ...params, page: page.toString() } })
    );
    const data = Array.isArray(response) ? [] : response.data;
    
    if (!data.length) break;
    allData = allData.concat(data);
    page++;
    
    // GitHub's API typically has a max of 1000 items (10 pages)
    if (page > 10) break;
  }
  
  return allData;
};

export const fetchOrgRepos = async (org: string): Promise<Repository[]> => {
  return fetchAllPages<Repository>(`/orgs/${org}/repos`);
};

export const fetchRepoBranches = async (fullName: string): Promise<Branch[]> => {
  return fetchAllPages<Branch>(`/repos/${fullName}/branches`);
};

export const fetchBranchCommits = async (
  fullName: string,
  branch: Branch,
  since?: Date
): Promise<Commit[]> => {
  const params: Record<string, string> = {
    sha: branch.commit.sha,
  };
  
  if (since) {
    params.since = since.toISOString();
  }

  return fetchAllPages<Commit>(`/repos/${fullName}/commits`, params);
};

export const fetchAllRepoCommits = async (
  repo: Repository,
  since?: Date
): Promise<{ commits: Commit[]; branches: Branch[] }> => {
  const branches = await fetchRepoBranches(repo.full_name);
  
  // Fetch commits for each branch in parallel
  const commitsPromises = branches.map(branch => 
    fetchBranchCommits(repo.full_name, branch, since)
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