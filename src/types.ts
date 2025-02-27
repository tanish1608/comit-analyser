export interface Repository {
  id: number;
  name: string;
  full_name: string;
  description?: string;
  html_url?: string;
  language?: string;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  default_branch?: string;
  created_at?: string;
  updated_at?: string;
  pushed_at?: string;
}

export interface Branch {
  name: string;
  commit: {
    sha: string;
  };
  protected?: boolean;
}

export interface Commit {
  sha: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer?: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
  author: {
    login: string;
    avatar_url: string;
    html_url?: string;
  } | null;
  html_url?: string;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
}

export interface UserStats {
  totalCommits: number;
  repositories: {
    [repoName: string]: {
      commits: number;
      branches: string[];
    };
  };
}

export interface CacheStatus {
  type: 'repositories' | 'commits' | 'branches';
  org: string;
  timestamp: Date;
  count: number;
  source: 'Cache' | 'API' | 'Unknown' | 'Fetching...' | 'Complete';
}

export interface CommitActivity {
  author: string;
  date: string;
  count: number;
}

export interface RepoSummary {
  name: string;
  totalCommits: number;
  contributors: number;
  branches: string[];
}