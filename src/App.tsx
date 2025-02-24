import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { fetchOrgRepos, fetchAllRepoCommits } from './api';
import { CommitStats } from './components/CommitStats';
import { Github, Loader2, Search, Calendar } from 'lucide-react';
import { TimeRange, UserStats } from './types';
import { subDays } from 'date-fns';

function App() {
  const [org, setOrg] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('30');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const getSinceDate = (range: TimeRange): Date | undefined => {
    if (range === 'all') return undefined;
    return subDays(new Date(), parseInt(range));
  };

  const {
    data: repos,
    isLoading: isLoadingRepos,
    refetch: refetchRepos,
  } = useQuery(
    ['repos', selectedOrg],
    () => fetchOrgRepos(selectedOrg),
    {
      enabled: false,
      retry: false,
      onError: () => {}, // Suppress error handling
    }
  );

  const {
    data: repoData,
    isLoading: isLoadingCommits,
    refetch: refetchCommits,
  } = useQuery(
    ['commits', selectedOrg, repos, timeRange],
    async () => {
      if (!repos?.length) return { commits: [], userStats: {} };
      const sinceDate = getSinceDate(timeRange);
      
      // Fetch commits for all repos in parallel
      const repoResults = await Promise.all(
        repos.map(repo => fetchAllRepoCommits(repo, sinceDate))
      );
      
      const allCommits = [];
      const userStats: Record<string, UserStats> = {};
      
      for (let i = 0; i < repoResults.length; i++) {
        const { commits, branches } = repoResults[i];
        const repo = repos[i];
        
        allCommits.push(...commits);
        
        // Aggregate user statistics
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
          
          // Add unique branches
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
      retry: false,
      onError: () => {}, // Suppress error handling
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || isAnalyzing) return;

    setIsAnalyzing(true);
    setSelectedOrg(org);

    try {
      await refetchRepos();
      await refetchCommits();
    } catch {
      // Suppress any errors
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

        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-4">
            <div className="flex-1">
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
                htmlFor="timeRange"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Time Range
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  id="timeRange"
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                  className="select-field pl-10"
                  disabled={isLoading}
                >
                  <option value="7">Last 7 days</option>
                  <option value="10">Last 10 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="all">All time</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={!org || isLoading}
              className="submit-button self-end flex items-center"
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
            timeRange={timeRange}
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