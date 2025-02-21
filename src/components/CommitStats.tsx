import React from 'react';
import { Commit, TimeRange } from '../types';
import { BarChart2, GitCommit, Users, Calendar } from 'lucide-react';

interface CommitStatsProps {
  commits: Commit[];
  timeRange: TimeRange;
}

export const CommitStats: React.FC<CommitStatsProps> = ({ commits, timeRange }) => {
  const commitsByAuthor = commits.reduce((acc, commit) => {
    const author = commit.author?.login || commit.commit.author.name;
    acc[author] = (acc[author] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedAuthors = Object.entries(commitsByAuthor)
    .sort(([, a], [, b]) => b - a);

  const timeRangeText = {
    '7': 'Last 7 days',
    '10': 'Last 10 days',
    '30': 'Last 30 days',
    'all': 'All time'
  }[timeRange];

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
          <p className="stat-number">{Object.keys(commitsByAuthor).length}</p>
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
          <p className="text-xl font-semibold text-gray-800">{timeRangeText}</p>
        </div>
      </div>

      <div className="author-stats">
        <h3>Commits by Author</h3>
        <div>
          {sortedAuthors.map(([author, count]) => (
            <div key={author} className="author-card">
              <div className="author-info">
                <span className="author-name">{author}</span>
                <span className="commit-count">{count} commits</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${(count / commits.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};