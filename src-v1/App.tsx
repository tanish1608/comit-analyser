import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { fetchOrgRepos, fetchAllRepoCommits, fetchEmployeeNames } from './api';
import { Dashboard } from './pages/Dashboard';
import { PodHierarchy } from './pages/PodHierarchy';
import { Github, Loader2, Search, Calendar, Key, GitFork, AlertCircle, BarChart2, LayoutList, Database, Lock } from 'lucide-react';
import { Repository, UserStats, CacheStatus, Employee } from './types';
import { DateRangePicker } from 'rsuite';
import { subDays, startOfDay, endOfDay, subMonths, parseISO } from 'date-fns';
import qs from 'qs';
import 'rsuite/dist/rsuite.min.css';

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
  const [filterDateRange, setFilterDateRange] = useState<[Date, Date]>(initialState.dateRange);
  const [useCache, setUseCache] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

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

  const handleAdminLogin = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: adminUsername, password: adminPassword }),
      });

      if (response.ok) {
        setIsAdmin(true);
        setShowAdminLogin(false);
        setAdminUsername('');
        setAdminPassword('');
      } else {
        setError('Invalid admin credentials');
      }
    } catch (error) {
      setError('Failed to authenticate');
    }
  };

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
    ['repos', selectedOrg, token, useCache],
    () => {
      if (!selectedOrg) {
        throw new Error('Organization name is required');
      }
      console.log('Fetching repos for org:', selectedOrg);
      return fetchOrgRepos(selectedOrg, token, useCache);
    },
    {
      enabled: shouldFetchRepos,
      retry: 1,
      retryDelay: 1000,
      onSuccess: (data) => {
        console.log('Successfully fetched repos:', data?.length);
        setError(null);
        if (data.lastUpdate) {
          setCacheStatus({
            type: 'repositories',
            org: selectedOrg,
            timestamp: new Date(),
            count: data.length,
            source: useCache ? 'Cache' : 'API',
            lastUpdate: new Date(data.lastUpdate)
          });
        }
      },
      onError: (error: Error) => {
        console.error('Error fetching repos:', error);
        setIsAnalyzing(false);
        setIsCaching(false);
        
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
    ['commits', selectedOrg, selectedRepos, dateRange, token, useCache],
    async () => {
      if (!repos || repos.length === 0) {
        console.log('No repos available for fetching commits');
        return { commits: [], userStats: {} };
      }
      
      console.log('Filtering repos:', selectedRepos);
      const filteredRepos = repos.filter(repo => 
        selectedRepos.length === 0 || selectedRepos.includes(repo.name)
      );
      
      console.log('Fetching commits for repos:', filteredRepos.map(r => r.name));
      
      let startDate = dateRange[0];
      if (cacheStatus?.lastUpdate && isAdmin) {
        startDate = new Date(cacheStatus.lastUpdate);
      }
      
      setCacheStatus({
        type: 'commits',
        org: selectedOrg,
        timestamp: new Date(),
        count: 0,
        source: useCache ? 'Cache' : 'Fetching...'
      });
      
      const repoResults = await Promise.all(
        filteredRepos.map(repo => 
          fetchAllRepoCommits(
            repo,
            token,
            startDate,
            endOfDay(dateRange[1]),
            useCache
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
        
        const filteredCommits = commits.filter(commit => {
          const commitDate = new Date(commit.commit.author.date);
          return commitDate >= filterDateRange[0] && commitDate <= filterDateRange[1];
        });
        
        allCommits.push(...filteredCommits);
        
        filteredCommits.forEach(commit => {
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
      
      console.log('Finished processing commits:', allCommits.length);
      
      const employeeIds = Object.keys(userStats);
      const names = await fetchEmployeeNames(employeeIds);
      setEmployeeNames(names);
      
      setCacheStatus(prev => prev ? {
        ...prev,
        count: allCommits.length,
        source: useCache ? 'Cache' : 'Complete'
      } : null);
      
      return { commits: allCommits, userStats };
    },
    {
      enabled: !!repos && repos.length > 0,
      retry: 1,
      retryDelay: 1000,
      onSuccess: () => {
        setIsAnalyzing(false);
        setIsCaching(false);
        setError(null);
      },
      onError: (error) => {
        console.error('Error fetching commits:', error);
        setIsAnalyzing(false);
        setIsCaching(false);
        setError('Failed to fetch commit data. Please try again.');
      },
    }
  );

  useEffect(() => {
    if (shouldFetchRepos && selectedOrg) {
      console.log('Triggering repo fetch for org:', selectedOrg);
      refetchRepos();
      setShouldFetchRepos(false);
    }
  }, [shouldFetchRepos, selectedOrg, refetchRepos]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || isLoading) return;
    if (!isAdmin) {
      setShowAdminLogin(true);
      return;
    }

    console.log('Starting analysis for org:', org);
    setIsAnalyzing(true);
    setSelectedOrg(org);
    setShouldFetchRepos(true);
    setUseCache(false);
  };

  const handleCache = async () => {
    if (!org || isLoading) return;
    if (!isAdmin) {
      setShowAdminLogin(true);
      return;
    }

    console.log('Caching data for org:', org);
    setIsCaching(true);
    setSelectedOrg(org);
    setShouldFetchRepos(true);
    setDateRange([subMonths(new Date(), 4), new Date()]);
    setUseCache(false);
  };

  const isLoading = isLoadingRepos || isLoadingCommits || isAnalyzing || isCaching;

  const errorMessage = error || (commitsError ? 'Failed to fetch commit data. Please try again.' : null);

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Github className="w-10 h-10 text-indigo-600 animate-pulse" />
            <h1 className="text-3xl font-bold text-gray-900">
              GitHub Organization Commit Analyzer
            </h1>
          </div>
          {repoData?.commits && repoData.commits.length > 0 && (
            <div className="flex items-center gap-4">
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
            </div>
          )}
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
            <p>
              <span className="font-semibold">
                {cacheStatus.type === 'repositories' ? 'Repositories' : 'Commits'} data for {cacheStatus.org}:
              </span>
              {' '}{cacheStatus.count} items {cacheStatus.source !== 'Unknown' && `(${cacheStatus.source})`}
              {cacheStatus.lastUpdate && (
                <span className="ml-2">
                  Last updated: {new Date(cacheStatus.lastUpdate).toLocaleDateString()}
                </span>
              )}
            </p>
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
                onChange={value => {
                  setDateRange(value as [Date, Date]);
                  setFilterDateRange(value as [Date, Date]);
                }}
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

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={!org || isLoading}
              className="submit-button flex-1"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  {!isAdmin && <Lock className="w-5 h-5 mr-2" />}
                  Analyze
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCache}
              disabled={!org || isLoading}
              className="flex-1 flex items-center justify-center px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCaching ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Caching...
                </>
              ) : (
                <>
                  {!isAdmin && <Lock className="w-5 h-5 mr-2" />}
                  <Database className="w-5 h-5 mr-2" />
                  Cache 4 Months
                </>
              )}
            </button>
          </div>
        </form>

        {showAdminLogin && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96">
              <h2 className="text-xl font-bold mb-4">Admin Login Required</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="adminUsername" className="block text-sm font-medium text-gray-700">
                    Username
                  </label>
                  <input
                    type="text"
                    id="adminUsername"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="adminPassword" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <input
                    type="password"
                    id="adminPassword"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex justify-end gap-4">
                  <button
                    type="button"
                    onClick={() => setShowAdminLogin(false)}
                    className="px-4 py-2 text-gray-700 hover:text-gray-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAdminLogin}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    Login
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {repoData?.commits && repoData.commits.length > 0 && (
          <div className="mb-8">
            <div className="bg-white p-4 rounded-lg shadow mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter Date Range
              </label>
              <DateRangePicker
                value={filterDateRange}
                onChange={value => setFilterDateRange(value as [Date, Date])}
                className="w-full"
                character=" - "
                cleanable={false}
                placement="bottomStart"
                disabledDate={date => date > new Date()}
              />
            </div>
            {view === 'dashboard' ? (
              <Dashboard
                commits={repoData.commits}
                dateRange={filterDateRange}
                userStats={repoData.userStats}
                employeeNames={employeeNames}
              />
            ) : (
              <PodHierarchy userStats={repoData.userStats} />
            )}
          </div>
        )}

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
                {isCaching ? 'Caching data from all branches...' : 'Fetching commit data from all branches...'}
              </p>
              <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 animate-pulse"></div>
              </div>
            </div>
          </div>
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