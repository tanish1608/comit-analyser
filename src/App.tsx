import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { fetchOrgRepos, fetchAllRepoCommits, fetchEmployeeNames, cacheOrgData } from './api';
import { Dashboard } from './pages/Dashboard';
import { PodHierarchy } from './pages/PodHierarchy';
import { AdminLogin } from './components/AdminLogin';
import { useAuth } from './contexts/AuthContext';
import { Github, Loader2, Search, Calendar, Key, GitFork, AlertCircle, BarChart2, LayoutList, Clock, Database } from 'lucide-react';
import { Repository, UserStats, CacheStatus, Employee } from './types';
import { DateRangePicker } from 'rsuite';
import { subDays, startOfDay, endOfDay, subMonths } from 'date-fns';
import qs from 'qs';
import 'rsuite/dist/rsuite.min.css';

function App() {
  const { isAdmin } = useAuth();
  const [showControls, setShowControls] = useState(false);

  // Parse URL parameters
  const getInitialState = () => {
    const params = qs.parse(window.location.search, { ignoreQueryPrefix: true });
    return {
      org: (params.org as string || '').trim(),
      selectedOrg: (params.org as string || '').trim(),
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

  // Check if current time is within allowed hours (8 AM to 12 AM GMT)
  const isWithinAllowedHours = () => {
    const now = new Date();
    const hours = now.getUTCHours();
    return hours >= 8 && hours < 24;
  };

  // Time restriction message state
  const [timeRestrictionMessage, setTimeRestrictionMessage] = useState<string>('');

  // Update time restriction message every minute
  useEffect(() => {
    const updateTimeMessage = () => {
      if (isWithinAllowedHours()) {
        setTimeRestrictionMessage('');
      } else {
        const nextAllowedTime = new Date();
        nextAllowedTime.setUTCHours(8, 0, 0, 0);
        if (nextAllowedTime < new Date()) {
          nextAllowedTime.setDate(nextAllowedTime.getDate() + 1);
        }
        const waitHours = Math.ceil((nextAllowedTime.getTime() - Date.now()) / (1000 * 60 * 60));
        setTimeRestrictionMessage(`Fetching is restricted until 8 AM GMT (${waitHours} hours remaining)`);
      }
    };

    updateTimeMessage();
    const interval = setInterval(updateTimeMessage, 60000);
    return () => clearInterval(interval);
  }, []);

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
      const trimmedOrg = selectedOrg.trim();
      if (!trimmedOrg) {
        throw new Error('Organization name cannot be empty');
      }
      console.log('Fetching repos for org:', trimmedOrg);
      return fetchOrgRepos(trimmedOrg, token);
    },
    {
      enabled: shouldFetchRepos,
      retry: 1,
      retryDelay: 1000,
      onSuccess: (data) => {
        console.log('Successfully fetched repos:', data?.length);
        setError(null);
        setCacheStatus({
          type: 'repositories',
          org: selectedOrg.trim(),
          timestamp: new Date(),
          count: data.length,
          source: 'Unknown'
        });
      },
      onError: (error: Error) => {
        console.error('Error fetching repos:', error);
        setIsAnalyzing(false);
        setIsCaching(false);
        
        if (error.message.includes('404')) {
          setError(`Organization "${selectedOrg.trim()}" not found. Please check the organization name and try again.`);
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
        console.log('No repos available for fetching commits');
        return { commits: [], userStats: {} };
      }
      
      console.log('Filtering repos:', selectedRepos);
      const filteredRepos = repos.filter(repo => 
        selectedRepos.length === 0 || selectedRepos.includes(repo.name)
      );
      
      console.log('Fetching commits for repos:', filteredRepos.map(r => r.name));
      
      setCacheStatus({
        type: 'commits',
        org: selectedOrg.trim(),
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
              commitDates: []
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

          if (commit.date) {
            const dateStats = userStats[author].repositories[repo.name].commitDates;
            const existingDate = dateStats.find(d => d.date === commit.date);
            if (existingDate) {
              existingDate.count++;
            } else {
              dateStats.push({ date: commit.date, count: 1 });
            }
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
    if (!org || isLoading || !isWithinAllowedHours()) return;

    const trimmedOrg = org.trim();
    if (!trimmedOrg) {
      setError('Organization name cannot be empty');
      return;
    }

    console.log('Starting analysis for org:', trimmedOrg);
    setIsAnalyzing(true);
    setSelectedOrg(trimmedOrg);
    setShouldFetchRepos(true);
  };

  const handleCacheData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || isLoading || !isWithinAllowedHours()) return;

    const trimmedOrg = org.trim();
    if (!trimmedOrg) {
      setError('Organization name cannot be empty');
      return;
    }

    console.log('Starting cache process for org:', trimmedOrg);
    setIsCaching(true);

    try {
      await cacheOrgData(trimmedOrg, token);
      setError(null);
      setCacheStatus({
        type: 'commits',
        org: trimmedOrg,
        timestamp: new Date(),
        count: 0,
        source: 'Cache Updated'
      });
    } catch (error) {
      console.error('Error caching data:', error);
      setError('Failed to cache organization data. Please try again.');
    } finally {
      setIsCaching(false);
    }
  };

  const isLoading = isLoadingRepos || isLoadingCommits || isAnalyzing || isCaching;
  const errorMessage = error || (commitsError ? 'Failed to fetch commit data. Please try again.' : null);

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto relative">
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

        <AdminLogin />

        {timeRestrictionMessage && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-lg mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            <p>{timeRestrictionMessage}</p>
          </div>
        )}

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
            </p>
          </div>
        )}

        {isAdmin && (
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

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={!org || isLoading || !isWithinAllowedHours()}
                className="submit-button flex-1"
                title={timeRestrictionMessage || ''}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Analyze'
                )}
              </button>

              <button
                type="button"
                onClick={handleCacheData}
                disabled={!org || isLoading || !isWithinAllowedHours()}
                className="submit-button flex-1 bg-green-600 hover:bg-green-700 focus:ring-green-500"
                title={timeRestrictionMessage || ''}
              >
                {isCaching ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Caching Data...
                  </>
                ) : (
                  <>
                    <Database className="w-5 h-5 mr-2" />
                    Cache 4 Months Data
                  </>
                )}
              </button>
            </div>
          </form>
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
                {isCaching ? 'Caching last 4 months of commit data...' : 'Fetching commit data from all branches...'}
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
  );
}

export default App;