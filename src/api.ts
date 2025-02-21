import axios from 'axios';
import { Repository, Commit, Branch } from './types';
import { subDays } from 'date-fns';

const github = axios.create({
  baseURL: 'https://api.github.com',
});

export const fetchOrgRepos = async (org: string): Promise<Repository[]> => {
  const { data } = await github.get(`/orgs/${org}/repos`);
  return data;
};

export const fetchRepoBranches = async (fullName: string): Promise<Branch[]> => {
  const { data } = await github.get(`/repos/${fullName}/branches`);
  return data;
};

export const fetchBranchCommits = async (
  fullName: string,
  branch: string,
  since?: Date
): Promise<Commit[]> => {
  const params: Record<string, string> = {
    sha: branch,
    per_page: '100',
  };
  
  if (since) {
    params.since = since.toISOString();
  }

  const { data } = await github.get(`/repos/${fullName}/commits`, { params });
  return data;
};

export const fetchAllRepoCommits = async (
  repo: Repository,
  since?: Date
): Promise<Commit[]> => {
  const branches = await fetchRepoBranches(repo.full_name);
  const commitsPromises = branches.map(branch => 
    fetchBranchCommits(repo.full_name, branch.name, since)
  );
  const branchCommits = await Promise.all(commitsPromises);
  return branchCommits.flat();
};