import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { fetchOrgRepos, fetchAllRepoCommits } from './api';
import { CommitStats } from './components/CommitStats';
import { Github, Loader2, Search, Calendar, Key, GitFork, AlertCircle, Database } from 'lucide-react';
import { Repository, UserStats, CacheStatus } from './types';
import { DateRangePicker, RangeType } from 'rsuite';
import { subDays, startOfDay, endOfDay, formatDistanceToNow } from 'date-fns';
import 'rsuite/dist/rsuite.min.css';

function App() {
  const [org, setOrg] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('');
  const [token, setToken] = useState('');
  const [dateRange, setDateRange] = useState<[Date, Date]>([subDays(new Date(), 30), new Date()]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [repoInput, setRepoInput] = useState('');
  const [shouldFetchRepos, setShouldFetchRepos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);

  const predefinedRanges: RangeType[] = [
    {
      label: 'Last 7 days',
      value: [subDays(new Date(), 7), new Date()] as [Date, Date]
    },
    {
      label: 'Last 14 days',
      value: [subDays(new Date(), 14), new Date()] as [Date, Date]
    },
    {
      label: 'Last 30 days',
      value: [subDays(new Date(), 30), new Date()] as [Date, Date]
    },
    {
      label: 'Last 90 days',
      value: [subDays(new Date(), 90), new Date()] as [Date, Date]
    }
  ];

  const selectedRepos = repoInput
    .split(',')
    .map(repo => repo.trim())
    .filter(Boolean);

  const {
    data: repos,
    isLoading: isLoadingRepos,
    refetch: refetchRepos
  } = useQuery(
    ['repos', selectedOrg, token],
    () => {
      if (!selectedOrg) {
        throw new Error('Organization name is required');
      }
      return fetchOrgRepos(selectedOrg, token);
    },
    {
      enabled: false,
      retry: 1,
      retryDelay: 1000,
      onSuccess: (data) => {
        setError(null);
        setCacheStatus({
          type: 'repositories',
          org: selectedOrg,
          timestamp: new Date(),
          count: data.length,
          source: 'Unknown'
        });
        // Trigger commit fetch after repos are loaded
        if (data.length > 0) {
          refetchCommits();
        }
      },
      onError: (error: Error) => {
        console.error('Error fetching repos:', error);
        setIsAnalyzing(false);
        
        if (error.message.includes('404')) {
          setError(`Organization "${selectedOrg}" not found. Please check the organization name and try again.`);
        } else if (error.message.includes('401')) {
          setError('Invalid or missing GitHub token. Please check your token and try again.');
        } else if (error.message.includes('403')) {
          setError('Rate limit exceeded. Please provide a GitHub token or try again later.');
        } else {
          setError('Failed to fetch repositories. Please try again.');
        }
      },
    }
  );

  const {
    data: repoData,
    isLoading: isLoadingCommits,
    error: commitsError,
    refetch: refetchCommits
  } = useQuery(
    ['commits', selectedOrg, selectedRepos, dateRange, token],
    async () => {
      if (!repos || repos.length === 0) return { commits: [], userStats: {} };
      
      const filteredRepos = repos.filter(repo => 
        selectedRepos.length === 0 || selectedRepos.includes(repo.name)
      );
      
      setCacheStatus({
        type: 'commits',
        org: selectedOrg,
        timestamp: new Date(),
        count: 0,
        source: 'Fetching...'
      });
      
      const repoResults = await Promise.all(
        filteredRepos.map(repo => 
          fetchAllRepoCommits(
            repo,
            token,
            startOfDay(dateRange[0]),
            endOfDay(dateRange[1])
          ).catch(error => {
            console.error(`Error fetching commits for ${repo.name}:`, error);
            return { commits: [], branches: [] };
          })
        )
      );
      
      const allCommits = [];
      const userStats: Record<string, UserStats> = {};
      
      for (let i = 0; i < repoResults.length; i++) {
        const { commits, branches } = repoResults[i];
        const repo = filteredRepos[i];
        
        const nonPRCommits = commits.filter(commit => 
          !commit.commit.message.toLowerCase().includes('merge pull request') &&
          !commit.commit.message.toLowerCase().includes('pr #')
        );
        
        allCommits.push(...nonPRCommits);
        
        // Create a map of branch names to their commits
        const branchCommits = new Map<string, Set<string>>();
        
        // Initialize branch commit sets
        for (const branch of branches) {
          branchCommits.set(branch.name, new Set());
        }
        
        // Map commits to their branches
        for (const branch of branches) {
          const commitQueue = [branch.commit.sha];
          const processedCommits = new Set<string>();
          
          while (commitQueue.length > 0) {
            const currentSha = commitQueue.shift()!;
            if (processedCommits.has(currentSha)) continue;
            processedCommits.add(currentSha);
            
            const commit = nonPRCommits.find(c => c.sha === currentSha);
            if (commit) {
              branchCommits.get(branch.name)?.add(currentSha);
              
              // Add parent commits to the queue
              if (commit.parents) {
                commit.parents.forEach(parent => {
                  if (!processedCommits.has(parent.sha)) {
                    commitQueue.push(parent.sha);
                  }
                });
              }
            }
          }
        }
        
        // Process commits and update user stats
        nonPRCommits.forEach(commit => {
          const author = commit.author?.login || commit.commit.author.name;
          
          if (!userStats[author]) {
            userStats[author] = {
              totalCommits: 0,
              repositories: {},
            };
          }
          
          userStats[author].totalCommits++;
          
          if (!userStats[author].repositories[repo.name]) {
            userStats[author].repositories[repo.name] = {
              commits: 0,
              branches: [],
            };
          }
          
          userStats[author].repositories[repo.name].commits++;
          
          // Find branches that contain this commit
          const commitBranches = Array.from(branchCommits.entries())
            .filter(([, commits]) => commits.has(commit.sha))
            .map(([branchName]) => branchName);
          
          if (commitBranches.length > 0) {
            userStats[author].repositories[repo.name].branches = [
              ...new Set([
                ...userStats[author].repositories[repo.name].branches,
                ...commitBranches,
              ]),
            ];
          }
        });
      }
      
      setCacheStatus(prev => prev ? {
        ...prev,
        count: allCommits.length,
        source: 'Complete'
      } : null);
      
      return { commits: allCommits, userStats };
    },
    {
      enabled: false,
      retry: 1,
      retryDelay: 1000,
      onSuccess: () => {
        setIsAnalyzing(false);
        setError(null);
      },
      onError: (error) => {
        console.error('Error fetching commits:', error);
        setIsAnalyzing(false);
        setError('Failed to fetch commit data. Please try again.');
      },
    }
  );

  useEffect(() => {
    if (shouldFetchRepos && selectedOrg) {
      refetchRepos();
      setShouldFetchRepos(false);
    }
  }, [shouldFetchRepos, selectedOrg, refetchRepos]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || isLoading) return;

    setIsAnalyzing(true);
    setSelectedOrg(org);
    setShouldFetchRepos(true);
  };

  const isLoading = isLoadingRepos || isLoadingCommits || isAnalyzing;

  const errorMessage = error || (commitsError ? 'Failed to fetch commit data. Please try again.' : null);

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Github className="w-10 h-10 text-indigo-600" />
          <h1 className="text-3xl font-bold text-gray-900">
            GitHub Organization Commit Analyzer
          </h1>
        </div>

        {errorMessage && (
          <div className="error">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        {cacheStatus && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 p-4 rounded-lg mb-6">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              <p>
                <span className="font-semibold">{cacheStatus.type === 'repositories' ? 'Repositories' : 'Commits'} data for {cacheStatus.org}:</span> {' '}
                {cacheStatus.count} items {cacheStatus.source !== 'Unknown' && `(${cacheStatus.source})`} • 
                <span className="ml-1 text-blue-600">
                  Last updated {formatDistanceToNow(cacheStatus.timestamp)} ago
                </span>
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mb-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="org"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Organization Name
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  id="org"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  placeholder="Enter organization name"
                  className="input-field pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="token"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                GitHub Token (Optional)
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  id="token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Enter GitHub token for private repos"
                  className="input-field pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date Range
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
              <DateRangePicker
                value={dateRange}
                onChange={value => setDateRange(value as [Date, Date])}
                className="w-full"
                ranges={predefinedRanges}
                placeholder="Select date range"
                character=" - "
                style={{ width: '100%' }}
                cleanable={false}
                disabled={isLoading}
                placement="bottomStart"
                disabledDate={date => date > new Date()}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="repos"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Repository Names (Optional)
            </label>
            <div className="relative">
              <GitFork className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                id="repos"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="Enter repository names separated by commas (e.g., repo1, repo2)"
                className="input-field pl-10"
                disabled={isLoading}
              />
            </div>
            {selectedRepos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedRepos.map(repo => (
                  <span
                    key={repo}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"
                  >
                    {repo}
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!org || isLoading}
            className="submit-button"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              'Analyze'
            )}
          </button>
        </form>

        {isLoading && (
          <div className="loading">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span>Fetching commit data from all branches...</span>
          </div>
        )}

        {repoData?.commits && repoData.commits.length > 0 && (
          <CommitStats
            commits={repoData.commits}
            dateRange={dateRange}
            userStats={repoData.userStats}
            token={token}
          />
        )}

        {selectedOrg && !isLoading && (!repoData?.commits || repoData.commits.length === 0) && (
          <div className="text-center py-8 text-gray-600">
            <p>No commits found for organization: {selectedOrg}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;