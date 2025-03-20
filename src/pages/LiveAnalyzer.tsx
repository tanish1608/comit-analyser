import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { fetchOrgRepos, fetchAllRepoCommits, fetchEmployeeNames, cacheOrgData } from '../api';
import { Dashboard } from './Dashboard';
import { PodHierarchy } from './PodHierarchy';
import { AdminLogin } from '../components/AdminLogin';
import { useAuth } from '../contexts/AuthContext';
import { Github, Loader2, Search, Calendar, Key, GitFork, AlertCircle, BarChart2, LayoutList, Database } from 'lucide-react';
import { Repository, UserStats, CacheStatus, Employee } from '../types';
import { DateRangePicker } from 'rsuite';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import qs from 'qs';
import 'rsuite/dist/rsuite.min.css';

export function LiveAnalyzer() {
  const { isAdmin } = useAuth();
  const [org, setOrg] = useState('');
  const [token, setToken] = useState('');
  const [dateRange, setDateRange] = useState<[Date, Date]>([subDays(new Date(), 30), new Date()]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCaching, setIsCaching] = useState(false);
  const [repoInput, setRepoInput] = useState('');
  const [shouldFetchRepos, setShouldFetchRepos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [employeeNames, setEmployeeNames] = useState<Record<string, Employee>>({});
  const [view, setView] = useState<'dashboard' | 'hierarchy'>('dashboard');

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
    ['repos', org, token],
    () => {
      if (!org) {
        throw new Error('Organization name is required');
      }
      const trimmedOrg = org.trim();
      if (!trimmedOrg) {
        throw new Error('Organization name cannot be empty');
      }
      return fetchOrgRepos(trimmedOrg, token);
    },
    {
      enabled: shouldFetchRepos,
      retry: 1,
      retryDelay: 1000,
      onSuccess: (data) => {
        setError(null);
        setCacheStatus({
          type: 'repositories',
          org: org.trim(),
          timestamp: new Date(),
          count: data.length,
          source: 'GitHub API'
        });
      },
      onError: (error: Error) => {
        setIsAnalyzing(false);
        setIsCaching(false);
        
        if (error.message.includes('404')) {
          setError(`Organization "${org.trim()}" not found. Please check the organization name and try again.`);
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
    error: commitsError
  } = useQuery(
    ['commits', org, selectedRepos, dateRange, token],
    async () => {
      if (!repos || repos.length === 0) {
        return { commits: [], userStats: {} };
      }
      
      const filteredRepos = repos.filter(repo => 
        selectedRepos.length === 0 || selectedRepos.includes(repo.name)
      );
      
      setCacheStatus({
        type: 'commits',
        org: org.trim(),
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
      
      const employeeIds = Object.keys(userStats);
      const names = await fetchEmployeeNames(employeeIds);
      setEmployeeNames(names);
      
      setCacheStatus(prev => prev ? {
        ...prev,
        count: allCommits.length,
        source: 'GitHub API'
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
        setIsAnalyzing(false);
        setIsCaching(false);
        setError('Failed to fetch commit data. Please try again.');
      },
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || isLoading) return;

    const trimmedOrg = org.trim();
    if (!trimmedOrg) {
      setError('Organization name cannot be empty');
      return;
    }

    setIsAnalyzing(true);
    setShouldFetchRepos(true);
  };

  const handleCacheData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || isLoading) return;

    const trimmedOrg = org.trim();
    if (!trimmedOrg) {
      setError('Organization name cannot be empty');
      return;
    }

    setIsCaching(true);
    setError(null);
    setCacheStatus({
      type: 'commits',
      org: trimmedOrg,
      timestamp: new Date(),
      count: 0,
      source: 'Starting cache process...'
    });

    try {
      await cacheOrgData(trimmedOrg, token);
      setCacheStatus({
        type: 'commits',
        org: trimmedOrg,
        timestamp: new Date(),
        count: 0,
        source: 'Cache Updated'
      });
      setError('Caching complete! Please go to the Home page to view the data.');
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Github className="w-10 h-10 text-indigo-600" />
          <h1 className="text-3xl font-bold text-gray-900">
            Live GitHub Analysis
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
              disabled={!org || isLoading}
              className="submit-button flex-1"
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
              disabled={!org || isLoading}
              className="submit-button flex-1 bg-green-600 hover:bg-green-700 focus:ring-green-500"
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

      {org && !isLoading && (!repoData?.commits || repoData.commits.length === 0) && (
        <div className="text-center py-8 text-gray-600">
          <p>No commits found for organization: {org}</p>
        </div>
      )}
    </div>
  );
}