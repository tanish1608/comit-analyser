import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { fetchOrgRepos, fetchAllRepoCommits, fetchEmployeeNames } from './api';
import { Dashboard } from './pages/Dashboard';
import { PodHierarchy } from './pages/PodHierarchy';
import { Github, Loader2, Search, Calendar, Key, GitFork, AlertCircle, BarChart2, LayoutList, Save, Database, Lock, LogIn, LogOut } from 'lucide-react';
import { Repository, UserStats, CacheStatus, Employee, CacheOperationStatus } from './types';
import { DateRangePicker } from 'rsuite';
import { subDays, startOfDay, endOfDay, format, parseISO } from 'date-fns';
import qs from 'qs';
import axios from 'axios';
import * as Toast from '@radix-ui/react-toast';
import 'rsuite/dist/rsuite.min.css';
import { validateAdmin } from './auth';

function App() {
  const getInitialState = () => {
    const params = qs.parse(window.location.search, { ignoreQueryPrefix: true });
    return {
      org: params.org as string || '',
      selectedOrg: params.org as string || '',
      token: params.token as string || '',
      repoInput: params.repos as string || '',
      dateRange: params.startDate && params.endDate
        ? [new Date(params.startDate as string), new Date(params.endDate as string)]
        : [subDays(new Date(), 30), new Date()],
      view: params.view as string || 'dashboard'
    };
  };

  const initialState = getInitialState();
  const [org, setOrg] = useState(initialState.org);
  const [selectedOrg, setSelectedOrg] = useState(initialState.selectedOrg);
  const [token, setToken] = useState(initialState.token);
  const [dateRange, setDateRange] = useState<[Date, Date]>(initialState.dateRange);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCaching, setIsCaching] = useState(false);
  const [repoInput, setRepoInput] = useState(initialState.repoInput);
  const [shouldFetchRepos, setShouldFetchRepos] = useState(!!initialState.selectedOrg);
  const [error, setError] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [employeeNames, setEmployeeNames] = useState<Record<string, Employee>>({});
  const [view, setView] = useState<'dashboard' | 'hierarchy'>(initialState.view as any || 'dashboard');
  const [toast, setToast] = useState<{ open: boolean; title: string; description: string }>({
    open: false,
    title: '',
    description: ''
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Check for cached data on mount
  useEffect(() => {
    const checkCache = async () => {
      if (selectedOrg) {
        try {
          const response = await axios.get(`http://localhost:3001/api/cache/org/${selectedOrg}`);
          if (response.data) {
            setCacheStatus({
              type: 'commits',
              org: selectedOrg,
              timestamp: new Date(response.data.lastFetched),
              count: Object.values(response.data.commits).reduce((acc: number, repo: any) => acc + repo.data.length, 0),
              source: 'Cache'
            });
          }
        } catch (error) {
          console.log('No cached data found');
        }
      }
    };
    checkCache();
  }, [selectedOrg]);

  // Update URL when state changes
  useEffect(() => {
    const params = {
      org: selectedOrg || undefined,
      token: token || undefined,
      repos: repoInput || undefined,
      startDate: dateRange[0].toISOString(),
      endDate: dateRange[1].toISOString(),
      view: view === 'dashboard' ? undefined : view
    };

    const queryString = qs.stringify(params, { skipNulls: true });
    const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}`;
    window.history.replaceState({}, '', newUrl);
  }, [selectedOrg, token, repoInput, dateRange, view]);

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
      enabled: shouldFetchRepos,
      retry: 1,
      retryDelay: 1000,
      onSuccess: (data) => {
        setError(null);
        setCacheStatus({
          type: 'repositories',
          org: selectedOrg,
          timestamp: new Date(),
          count: data.length,
          source: 'API'
        });
      },
      onError: (error: Error) => {
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
      if (!repos || repos.length === 0) {
        return { commits: [], userStats: {} };
      }
      
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
        
        allCommits.push(...commits);
        
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
          
          const commitBranches = branches
            .filter(branch => branch.commit.sha === commit.sha)
            .map(branch => branch.name);
          
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
      
      const employeeIds = Object.keys(userStats);
      const names = await fetchEmployeeNames(employeeIds);
      setEmployeeNames(names);
      
      setCacheStatus(prev => prev ? {
        ...prev,
        count: allCommits.length,
        source: 'Complete'
      } : null);
      
      return { commits: allCommits, userStats };
    },
    {
      enabled: !!repos && repos.length > 0,
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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateAdmin(adminEmail, adminPassword)) {
      setIsAdmin(true);
      setShowLoginModal(false);
      setToast({
        open: true,
        title: 'Login Successful',
        description: 'You now have admin access to analyze repositories.'
      });
    } else {
      setToast({
        open: true,
        title: 'Login Failed',
        description: 'Invalid email or password.'
      });
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    setAdminEmail('');
    setAdminPassword('');
    setToast({
      open: true,
      title: 'Logged Out',
      description: 'You have been logged out successfully.'
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || isLoading) return;

    if (!isAdmin) {
      setShowLoginModal(true);
      return;
    }

    setIsAnalyzing(true);
    setSelectedOrg(org);
    setShouldFetchRepos(true);
  };

  const handleCache = async () => {
    if (!selectedOrg || !repoData || isCaching) return;

    setIsCaching(true);
    try {
      const response = await axios.post(`http://localhost:3001/api/cache/org/${selectedOrg}`, {
        repositories: repos,
        commits: repoData.commits.reduce((acc, commit) => {
          const repoName = commit.url.split('/')[5];
          if (!acc[repoName]) acc[repoName] = [];
          acc[repoName].push(commit);
          return acc;
        }, {}),
        branches: {}
      });

      const status = response.data as CacheOperationStatus;
      setToast({
        open: true,
        title: 'Cache Updated',
        description: `Successfully cached data for ${selectedOrg} at ${format(parseISO(status.timestamp), 'PPpp')}`
      });
    } catch (error) {
      setToast({
        open: true,
        title: 'Cache Error',
        description: 'Failed to cache organization data. Please try again.'
      });
    } finally {
      setIsCaching(false);
    }
  };

  const isLoading = isLoadingRepos || isLoadingCommits || isAnalyzing;
  const errorMessage = error || (commitsError ? 'Failed to fetch commit data. Please try again.' : null);

  return (
    <Toast.Provider swipeDirection="right">
      <div className="min-h-screen bg-gray-100 py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Github className="w-10 h-10 text-indigo-600 animate-pulse" />
              <h1 className="text-3xl font-bold text-gray-900">
                GitHub Organization Commit Analyzer
              </h1>
            </div>
            <div className="flex items-center gap-4">
              {isAdmin ? (
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors duration-200"
                >
                  <LogOut className="w-5 h-5" />
                  Logout
                </button>
              ) : (
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200"
                >
                  <LogIn className="w-5 h-5" />
                  Admin Login
                </button>
              )}
              {repoData?.commits && repoData.commits.length > 0 && (
                <>
                  <button
                    onClick={handleCache}
                    disabled={isCaching}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 ${
                      isCaching
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700'
                    } text-white`}
                  >
                    {isCaching ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Caching...
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        Cache Data
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setView('dashboard')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 ${
                      view === 'dashboard'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <BarChart2 className="w-5 h-5" />
                    Dashboard
                  </button>
                  <button
                    onClick={() => setView('hierarchy')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 ${
                      view === 'hierarchy'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <LayoutList className="w-5 h-5" />
                    Pod Hierarchy
                  </button>
                </>
              )}
            </div>
          </div>

          {errorMessage && (
            <div className="error">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {showLoginModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-96">
                <div className="flex items-center gap-2 mb-4">
                  <Lock className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-xl font-semibold">Admin Login</h2>
                </div>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      id="adminEmail"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="input-field"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="adminPassword" className="block text-sm font-medium text-gray-700 mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      id="adminPassword"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="input-field"
                      required
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowLoginModal(false)}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      Login
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {cacheStatus && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 p-4 rounded-lg mb-6">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                <p>
                  <span className="font-semibold">
                    {cacheStatus.type === 'repositories' ? 'Repositories' : 'Commits'} data for {cacheStatus.org}:
                  </span>
                  {' '}{cacheStatus.count} items
                  {cacheStatus.source !== 'Unknown' && (
                    <span className="ml-2">
                      ({cacheStatus.source} at {format(cacheStatus.timestamp, 'PPpp')})
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mb-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="org" className="block text-sm font-medium text-gray-700 mb-2">
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
                <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-2">
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
              <label htmlFor="repos" className="block text-sm font-medium text-gray-700 mb-2">
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
              ) : isAdmin ? (
                'Analyze'
              ) : (
                <>
                  <Lock className="w-5 h-5 mr-2" />
                  Login to Analyze
                </>
              )}
            </button>
          </form>

          {isLoading && (
            <div className="loading">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <Github className="w-8 h-8 text-indigo-600" />
                  </div>
                </div>
                <p className="text-lg font-medium text-gray-700">
                  Fetching commit data from all branches...
                </p>
                <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 animate-pulse"></div>
                </div>
              </div>
            </div>
          )}

          {repoData?.commits && repoData.commits.length > 0 && (
            view === 'dashboard' ? (
              <Dashboard
                commits={repoData.commits}
                dateRange={dateRange}
                userStats={repoData.userStats}
                employeeNames={employeeNames}
              />
            ) : (
              <PodHierarchy userStats={repoData.userStats} />
            )
          )}

          {selectedOrg && !isLoading && (!repoData?.commits || repoData.commits.length === 0) && (
            <div className="text-center py-8 text-gray-600">
              <p>No commits found for organization: {selectedOrg}</p>
            </div>
          )}
        </div>
      </div>

      <Toast.Root
        open={toast.open}
        onOpenChange={(open) => setToast(prev => ({ ...prev, open }))}
        className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg p-4 w-96"
      >
        <Toast.Title className="text-lg font-semibold">{toast.title}</Toast.Title>
        <Toast.Description className="mt-1 text-gray-600">
          {toast.description}
        </Toast.Description>
      </Toast.Root>
      <Toast.Viewport />
    </Toast.Provider>
  );
}

export default App;