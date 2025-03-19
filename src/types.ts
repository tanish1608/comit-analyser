import { ReactNode } from 'react';

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
  timestamp?: number;
  date?: string;
}

export interface Employee {
  login: string;
  name: string | null;
  email: string | null;
  avatar_url?: string;
  data?: {
    name: string;
    email: string;
    [key: string]: any;
  };
}

export interface UserStats {
  totalCommits: number;
  repositories: {
    [repoName: string]: {
      commits: number;
      branches: string[];
      commitDates: {
        date: string;
        count: number;
      }[];
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

export interface PodEmployee {
  empiId: string;
  name: string;
  pod: string;
  hasCommits: boolean;
}

export interface Pod {
  name: string;
  apiUrl: string;
}

export interface CommitFilter {
  startDate?: Date;
  endDate?: Date;
  author?: string;
  repository?: string;
}

export interface AdminCredentials {
  username: string;
  password: string;
}

export interface AuthContextType {
  isAdmin: boolean;
  login: (credentials: AdminCredentials) => Promise<void>;
  logout: () => void;
}

export interface AuthProviderProps {
  children: ReactNode;
}