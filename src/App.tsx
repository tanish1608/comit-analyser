import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { fetchOrgRepos, fetchAllRepoCommits } from './api';
import { CommitStats } from './components/CommitStats';
import { Github, Loader2, Search, Calendar } from 'lucide-react';
import { TimeRange } from './types';
import { subDays } from 'date-fns';

function App() {
  const [org, setOrg] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('30');

  const getSinceDate = (range: TimeRange): Date | undefined => {
    if (range === 'all') return undefined;
    return subDays(new Date(), parseInt(range));
  };

  const {
    data: repos,
    isLoading: isLoadingRepos,
    error: reposError,
  } = useQuery(
    ['repos', selectedOrg],
    () => fetchOrgRepos(selectedOrg),
    {
      enabled: !!selectedOrg,
    }
  );

  const {
    data: allCommits,
    isLoading: isLoadingCommits,
    error: commitsError,
  } = useQuery(
    ['commits', selectedOrg, repos, timeRange],
    async () => {
      if (!repos) return [];
      const sinceDate = getSinceDate(timeRange);
      const commitsPromises = repos.map(repo => fetchAllRepoCommits(repo, sinceDate));
      const repoCommits = await Promise.all(commitsPromises);
      return repoCommits.flat();
    },
    {
      enabled: !!repos,
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedOrg(org);
  };

  const isLoading = isLoadingRepos || isLoadingCommits;
  const error = reposError || commitsError;

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
              className="submit-button self-end"
            >
              Analyze
            </button>
          </div>
        </form>

        {isLoading && (
          <div className="loading">
            <Loader2 className="w-8 h-8" />
            <span>Fetching commit data from all branches...</span>
          </div>
        )}

        {error && (
          <div className="error">
            <p>Error: {(error as Error).message || 'Failed to fetch data'}</p>
          </div>
        )}

        {allCommits && allCommits.length > 0 && (
          <CommitStats commits={allCommits} timeRange={timeRange} />
        )}

        {selectedOrg && !isLoading && allCommits?.length === 0 && (
          <div className="text-center py-8 text-gray-600">
            <p>No commits found for organization: {selectedOrg}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;