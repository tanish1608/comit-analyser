import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { fetchOrgRepos, fetchAllRepoCommits } from './api';
import { CommitStats } from './components/CommitStats';
import { Github, Loader2, Search, Calendar, Key, GitFork } from 'lucide-react';
import { Repository, UserStats } from './types';
import DateRangePicker from '@wojtekmaj/react-daterange-picker';
import type { Value } from '@wojtekmaj/react-daterange-picker';
import { subDays } from 'date-fns';
import 'react-calendar/dist/Calendar.css';

function App() {
  const [org, setOrg] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('');
  const [token, setToken] = useState('');
  const [dateRange, setDateRange] = useState<Value>([subDays(new Date(), 30), new Date()]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [repoInput, setRepoInput] = useState('');

  const dateRangePresets = {
    'Last 7 days': [subDays(new Date(), 7), new Date()],
    'Last 14 days': [subDays(new Date(), 14), new Date()],
    'Last 30 days': [subDays(new Date(), 30), new Date()],
    'Last 90 days': [subDays(new Date(), 90), new Date()],
  } as const;

  const selectedRepos = repoInput
    .split(',')
    .map(repo => repo.trim())
    .filter(Boolean);

  const {
    data: repos,
    isLoading: isLoadingRepos,
    refetch: refetchRepos,
  } = useQuery(
    ['repos', selectedOrg, token],
    () => fetchOrgRepos(selectedOrg, token),
    {
      enabled: false,
      retry: 1,
      retryDelay: 1000,
      onError: (error) => {
        console.error('Error fetching repos:', error);
        setIsAnalyzing(false);
      },
    }
  );

  const {
    data: repoData,
    isLoading: isLoadingCommits,
    refetch: refetchCommits,
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
            dateRange?.[0] as Date,
            dateRange?.[1] as Date
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
      enabled: false,
      retry: 1,
      retryDelay: 1000,
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

    try {
      const reposResult = await refetchRepos();
      if (reposResult.data?.length) {
        await refetchCommits();
      }
    } catch (error) {
      console.error('Analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const isLoading = isLoadingRepos || isLoadingCommits || isAnalyzing;

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Github className="w-10 h-10 text-indigo-600" />
          <h1 className="text-3xl font-bold text-gray-900">
            GitHub Organization Commit Analyzer
          </h1>
        </div>

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
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {Object.entries(dateRangePresets).map(([label, range]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setDateRange(range)}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      dateRange?.[0] === range[0] && dateRange?.[1] === range[1]
                        ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <DateRangePicker
                  value={dateRange}
                  onChange={setDateRange}
                  className="date-picker-wrapper"
                  format="y-MM-dd"
                  clearIcon={null}
                  disabled={isLoading}
                  minDate={subDays(new Date(), 365)}
                  maxDate={new Date()}
                />
              </div>
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