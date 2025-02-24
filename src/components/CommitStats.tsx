import React from 'react';
import { Commit, UserStats } from '../types';
import { BarChart2, GitCommit, Users, Calendar, GitBranch, GitFork } from 'lucide-react';
type Value = [Date | null, Date | null] | null;
import { format } from 'date-fns';

interface CommitStatsProps {
  commits: Commit[];
  dateRange: Value;
  userStats: Record<string, UserStats>;
}

export const CommitStats: React.FC<CommitStatsProps> = ({ commits, dateRange, userStats }) => {
  const dateRangeText = dateRange
    ? `${format(dateRange[0] as Date, 'MMM dd, yyyy')} - ${format(dateRange[1] as Date, 'MMM dd, yyyy')}`
    : 'All time';

  const sortedUsers = Object.entries(userStats)
    .sort(([, a], [, b]) => b.totalCommits - a.totalCommits);

  return (
    <div className="stats-container">
      <div className="stats-header">
        <BarChart2 className="w-6 h-6 text-indigo-600" />
        <h2>Commit Statistics</h2>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <Users className="w-5 h-5 text-indigo-600" />
            <h3>Contributors</h3>
          </div>
          <p className="stat-number">{Object.keys(userStats).length}</p>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <GitCommit className="w-5 h-5 text-indigo-600" />
            <h3>Total Commits</h3>
          </div>
          <p className="stat-number">{commits.length}</p>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <h3>Time Range</h3>
          </div>
          <p className="text-xl font-semibold text-gray-800">{dateRangeText}</p>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Detailed User Statistics</h3>
        <div className="space-y-6">
          {sortedUsers.map(([author, stats]) => (
            <div key={author} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-gray-900">{author}</h4>
                <span className="text-indigo-600 font-semibold">
                  {stats.totalCommits} total commits
                </span>
              </div>
              
              <div className="space-y-4">
                {Object.entries(stats.repositories).map(([repo, repoStats]) => (
                  <div key={repo} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <GitFork className="w-4 h-4 text-gray-600" />
                        <span className="font-medium text-gray-900">{repo}</span>
                      </div>
                      <span className="text-indigo-600 font-medium">
                        {repoStats.commits} commits
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <GitBranch className="w-4 h-4" />
                      <span>Active in {repoStats.branches.length} branches: </span>
                      <span className="font-medium">
                        {repoStats.branches.join(', ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};