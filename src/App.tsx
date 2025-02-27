import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { fetchOrgRepos, fetchAllRepoCommits } from './api';
import { CommitStats } from './components/CommitStats';
import { Github, Loader2, Search, Calendar, Key, GitFork, AlertCircle, Database, Settings, RefreshCw } from 'lucide-react';
import { Repository, UserStats, CacheStatus } from './types';
import { DateRangePicker } from 'rsuite';
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
  const [showSettings, setShowSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const savedMode = localStorage.getItem('darkMode');
    return savedMode === 'true';
  });

  const predefinedRanges = [
    {
      label: 'Last 7 days',
      value: [subDays(new Date(), 7), new Date()]
    },
    {
      label: 'Last 14 days',
      value: [subDays(new Date(), 14), new Date()]
    },
    {
      label: 'Last 30 days',
      value: [subDays(new Date(), 30), new Date()]
    },
    {
      label: 'Last 90 days',
      value: [subDays(new Date(), 90), new Date()]
    }
  ];

  const selectedRepos = repoInput
    .split(',')
    .map(repo => repo.trim())
    .filter(Boolean);

  const {
    data: repos,
    isLoading: isLoadingRepos,
    error: reposError,
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
      enabled: false, // Don't run automatically, we'll trigger manually
      retry: 1,
      retryDelay: 1000,
      onSuccess: (data) => {
        setError(null);
        // Update cache status
        setCacheStatus({
          type: 'repositories',
          org: selectedOrg,
          timestamp: new Date(),
          count: data.length,
          source: 'Unknown' // Will be updated by the API
        });
      },
      onError: (error: any) => {
        console.error('Error fetching repos:', error);
        setIsAnalyzing(false);
        
        if (error.response?.status === 404) {
          setError(`Organization "${selectedOrg}" not found. Please check the organization name and try again.`);
        } else if (error.response?.status === 401) {
          setError('Invalid or missing GitHub token. Please check your token and try again.');
        } else if (error.response?.status === 403) {
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
      if (!repos?.length) return { commits: [], userStats: {} };
      
      const filteredRepos = repos.filter(repo => 
        selectedRepos.length === 0 || selectedRepos.includes(repo.name)
      );
      
      // Update cache status for commits
      setCacheStatus({
        type: 'commits',
        org: selectedOrg,
        timestamp: new Date(),
        count: 0, // Will be updated after fetching
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
      
      // Create a map to track which branches each commit belongs to
      const commitBranchMap: Record<string, Set<string>> = {};
      
      for (let i = 0; i < repoResults.length; i++) {
        const { commits, branches } = repoResults[i];
        const repo = filteredRepos[i];
        
        allCommits.push(...commits);
        
        // Map commits to branches
        for (const branch of branches) {
          const branchCommits = commits.filter(commit => 
            commit.sha === branch.commit.sha || 
            commits.some(c => c.sha === branch.commit.sha)
          );
          
          for (const commit of branchCommits) {
            if (!commitBranchMap[commit.sha]) {
              commitBranchMap[commit.sha] = new Set();
            }
            commitBranchMap[commit.sha].add(branch.name);
          }
        }
        
        commits.forEach(commit => {
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
          
          // Only add branches that this specific commit belongs to
          const commitBranches = Array.from(commitBranchMap[commit.sha] || []);
          
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
      
      // Update cache status with commit count
      setCacheStatus(prev => prev ? {
        ...prev,
        count: allCommits.length,
        source: 'Complete'
      } : null);
      
      return { commits: allCommits, userStats };
    },
    {
      enabled: false, // Don't run automatically, we'll trigger manually
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

  // Effect to trigger commits fetch when repos are loaded
  useEffect(() => {
    if (repos?.length > 0) {
      refetchCommits();
    }
  }, [repos, refetchCommits]);

  // Effect to handle the shouldFetchRepos state
  useEffect(() => {
    if (shouldFetchRepos && selectedOrg) {
      refetchRepos();
      setShouldFetchRepos(false);
    }
  }, [shouldFetchRepos, selectedOrg, refetchRepos]);

  // Effect to apply dark mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || isLoading) return;

    setIsAnalyzing(true);
    setSelectedOrg(org);
    
    // Directly trigger the repos fetch
    setTimeout(() => {
      refetchRepos();
    }, 0);
  };

  // Function to clear browser cache
  const handleClearCache = () => {
    try {
      localStorage.removeItem('github-cache');
      setCacheStatus(null);
      alert('Cache cleared successfully');
    } catch (error) {
      console.error('Error clearing cache:', error);
      alert('Failed to clear cache');
    }
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const isLoading = isLoadingRepos || isLoadingCommits || isAnalyzing;

  const errorMessage = error || (commitsError ? 'Failed to fetch commit data. Please try again.' : null);

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-100'} py-8 px-4 transition-colors duration-200`}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Github className={`w-10 h-10 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
            <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              GitHub Organization Commit Analyzer
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-full ${darkMode ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} transition-colors`}
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button 
              onClick={toggleDarkMode}
              className={`p-2 rounded-full ${darkMode ? 'bg-gray-800 text-yellow-400 hover:bg-gray-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} transition-colors`}
              aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {darkMode ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              )}
            </button>
          </div>
        </div>

        {showSettings && (
          <div className={`mb-6 p-4 rounded-lg ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'} shadow-lg`}>
            <h2 className="text-xl font-semibold mb-4">Settings</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Dark Mode</span>
                <button 
                  onClick={toggleDarkMode}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full ${darkMode ? 'bg-indigo-600' : 'bg-gray-300'}`}
                >
                  <span 
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} 
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span>Clear Browser Cache</span>
                <button 
                  onClick={handleClearCache}
                  className={`px-3 py-1 rounded ${darkMode ? 'bg-red-600 hover:bg-red-700' : 'bg-red-500 hover:bg-red-600'} text-white transition-colors`}
                >
                  Clear Cache
                </button>
              </div>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className={`error ${darkMode ? 'bg-red-900 border-red-800 text-red-200' : 'bg-red-50 border-red-200 text-red-700'}`}>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        {cacheStatus && (
          <div className={`border p-4 rounded-lg mb-6 ${darkMode ? 'bg-blue-900 border-blue-800 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                <p>
                  <span className="font-semibold">{cacheStatus.type === 'repositories' ? 'Repositories' : 'Commits'} data for {cacheStatus.org}:</span> {' '}
                  {cacheStatus.count} items {cacheStatus.source !== 'Unknown' && `(${cacheStatus.source})`} • 
                  <span className={`ml-1 ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                    Last updated {formatDistanceToNow(cacheStatus.timestamp)} ago
                  </span>
                </p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    setIsAnalyzing(true);
                    handleClearCache();
                    setTimeout(() => {
                      refetchRepos();
                    }, 100);
                  }}
                  className={`flex items-center gap-1 px-3 py-1 rounded ${darkMode ? 'bg-blue-700 hover:bg-blue-600' : 'bg-blue-600 hover:bg-blue-700'} text-white text-sm transition-colors`}
                  disabled={isLoading}
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mb-8 space-y-6">
          <div className={`p-6 rounded-lg shadow-lg ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label
                  htmlFor="org"
                  className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
                >
                  Organization Name
                </label>
                <div className="relative">
                  <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                  <input
                    type="text"
                    id="org"
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    placeholder="Enter organization name"
                    className={`input-field pl-10 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="token"
                  className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
                >
                  GitHub Token (Optional)
                </label>
                <div className="relative">
                  <Key className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                  <input
                    type="password"
                    id="token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Enter GitHub token for private repos"
                    className={`input-field pl-10 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Date Range
              </label>
              <div className="relative">
                <Calendar className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 z-10 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <DateRangePicker
                  value={dateRange}
                  onChange={value => setDateRange(value as [Date, Date])}
                  className={`w-full ${darkMode ? 'rs-picker-dark' : ''}`}
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
                className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
              >
                Repository Names (Optional)
              </label>
              <div className="relative">
                <GitFork className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <input
                  type="text"
                  id="repos"
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  placeholder="Enter repository names separated by commas (e.g., repo1, repo2)"
                  className={`input-field pl-10 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
                  disabled={isLoading}
                />
              </div>
              {selectedRepos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedRepos.map(repo => (
                    <span
                      key={repo}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${darkMode ? 'bg-indigo-900 text-indigo-200' : 'bg-indigo-100 text-indigo-800'}`}
                    >
                      {repo}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6">
              <button
                type="submit"
                disabled={!org || isLoading}
                className={`submit-button w-full ${darkMode ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
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
            </div>
          </div>
        </form>

        {isLoading && (
          <div className={`loading ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            <Loader2 className={`w-8 h-8 animate-spin ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
            <span>Fetching commit data from all branches...</span>
          </div>
        )}

        {repoData?.commits && repoData.commits.length > 0 && (
          <CommitStats
            commits={repoData.commits}
            dateRange={dateRange}
            userStats={repoData.userStats}
            darkMode={darkMode}
          />
        )}

        {selectedOrg && !isLoading && (!repoData?.commits || repoData.commits.length === 0) && (
          <div className={`text-center py-8 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            <p>No commits found for organization: {selectedOrg}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;