export interface Repository {
  id: number;
  name: string;
  full_name: string;
}

export interface Branch {
  name: string;
  commit: {
    sha: string;
  };
}

export interface Commit {
  sha: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
  author: {
    login: string;
    avatar_url: string;
  } | null;
  parents?: Array<{ sha: string }>;
}

export interface Employee {
  login: string;
  name: string | null;
  email: string | null;
  avatar_url?: string;
  data?: {
    name: string;
    email: string;
    [key: string]: any; // For any additional fields in the response
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
  type: 'repositories' | 'commits' | 'branches' | 'employees';
  org: string;
  timestamp: Date;
  count: number;
  source: 'Cache' | 'API' | 'Unknown' | 'Fetching...' | 'Complete';
}