import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { fetchOrgRepos, fetchAllRepoCommits } from './api';
import { CommitStats } from './components/CommitStats';
import { Github, Loader2, Search, Calendar, Key, GitFork, AlertCircle } from 'lucide-react';
import { UserStats } from './types';
import { DateRangePicker } from 'rsuite';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import 'rsuite/dist/rsuite.min.css';

function App() {
  const [org, setOrg] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('');
  const [token, setToken] = useState('');
  const [dateRange, setDateRange] = useState<[Date, Date]>([subDays(new Date(), 30), new Date()]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [repoInput, setRepoInput] = useState('');
  const [shouldFetchRepos, setShouldFetchRepos] = useState(false);

  const predefinedRanges = [
    {
      label: 'Last 7 days',
      value: () => [subDays(new Date(), 7), new Date()] as [Date, Date]
    },
    {
      label: 'Last 14 days',
      value: () => [subDays(new Date(), 14), new Date()] as [Date, Date]
    },
    {
      label: 'Last 30 days',
      value: () => [subDays(new Date(), 30), new Date()] as [Date, Date]
    },
    {
      label: 'Last 90 days',
      value: () => [subDays(new Date(), 90), new Date()] as [Date, Date]
    }
  ];

  const selectedRepos = repoInput
    .split(',')
    .map(repo => repo.trim())
    .filter(Boolean);

  const {
    data: repos,
    isLoading: isLoadingRepos,
    error: reposError
  } = useQuery(
    ['repos', selectedOrg, token],
    () => fetchOrgRepos(selectedOrg, token),
    {
      enabled: shouldFetchRepos && !!selectedOrg,
      retry: 1,
      retryDelay: 1000,
      onSuccess: () => {
        setShouldFetchRepos(false);
      },
      onError: (error) => {
        console.error('Error fetching repos:', error);
        setIsAnalyzing(false);
        setShouldFetchRepos(false);
      },
    }
  );

  const {
    data: repoData,
    isLoading: isLoadingCommits,
    error: commitsError
  } = useQuery(
    ['commits', selectedOrg, selectedRepos, dateRange, token],
    async () => {
      if (!repos?.length) return { commits: [], userStats: {} };
      
      const filteredRepos = repos.filter(repo => 
        selectedRepos.length === 0 || selectedRepos.includes(repo.name)
      );
      
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
          
          const repoBranches = branches
            .filter(branch => 
              commits.some(c => c.sha === branch.commit.sha)
            )
            .map(branch => branch.name);
            
          userStats[author].repositories[repo.name].branches = [
            ...new Set([
              ...userStats[author].repositories[repo.name].branches,
              ...repoBranches,
            ]),
          ];
        });
      }
      
      return { commits: allCommits, userStats };
    },
    {
      enabled: !!repos?.length,
      retry: 1,
      retryDelay: 1000,
      onSuccess: () => {
        setIsAnalyzing(false);
      },
      onError: (error) => {
        console.error('Error fetching commits:', error);
        setIsAnalyzing(false);
      },
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || isAnalyzing) return;

    setIsAnalyzing(true);
    setSelectedOrg(org);
    setShouldFetchRepos(true);
  };

  const isLoading = isLoadingRepos || isLoadingCommits || isAnalyzing;

  const getErrorMessage = () => {
    if (reposError) {
      const error = reposError as { response?: { status?: number } };
      if (error.response?.status === 404) {
        return `Organization "${selectedOrg}" not found. Please check the organization name and try again.`;
      }
      if (error.response?.status === 401) {
        return 'Invalid or missing GitHub token. Please check your token and try again.';
      }
      if (error.response?.status === 403) {
        return 'Rate limit exceeded. Please provide a GitHub token or try again later.';
      }
      return 'Failed to fetch repositories. Please try again.';
    }
    if (commitsError) {
      return 'Failed to fetch commit data. Please try again.';
    }
    return null;
  };

  const errorMessage = getErrorMessage();

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
                shouldDisableDate={date => date > new Date()}
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
            <Loader2 className="w-8 h-8" />
            <span>Fetching commit data from all branches...</span>
          </div>
        )}

        {repoData?.commits && repoData.commits.length > 0 && (
          <CommitStats
            commits={repoData.commits}
            dateRange={dateRange}
            userStats={repoData.userStats}
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