export interface Repository {
  id: number;
  name: string;
  full_name: string;
}

export interface Branch {
  name: string;
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
}

export type TimeRange = '7' | '10' | '30' | 'all';