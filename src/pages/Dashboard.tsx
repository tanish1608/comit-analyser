import React, { useState } from 'react';
import { Line } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import { Commit, UserStats, Employee } from '../types';
import { Users, GitCommit, GitBranch, GitFork, FileDown, ChevronDown, ChevronUp } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface DashboardProps {
  commits: Commit[];
  dateRange: [Date, Date];
  userStats: Record<string, UserStats>;
  employeeNames: Record<string, Employee>;
}

export const Dashboard: React.FC<DashboardProps> = ({ commits, dateRange, userStats, employeeNames }) => {
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set(Object.keys(userStats)));

  const toggleUser = (authorId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(authorId)) {
        next.delete(authorId);
      } else {
        next.add(authorId);
      }
      return next;
    });
  };

  // Calculate commit trends
  const commitTrends = React.useMemo(() => {
    const trends: Record<string, number> = {};
    
    commits.forEach(commit => {
      const date = format(parseISO(commit.commit.author.date), 'yyyy-MM-dd');
      trends[date] = (trends[date] || 0) + 1;
    });
    
    return Object.entries(trends)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [commits]);

  const handleExportToExcel = () => {
    const wb = utils.book_new();
    
    const summaryData = Object.entries(userStats).map(([authorId, stats]) => ({
      'Author ID': authorId,
      'Author Name': employeeNames[authorId]?.name || authorId,
      'Email': employeeNames[authorId]?.email || 'N/A',
      'Total Commits': stats.totalCommits,
      'Repositories': Object.keys(stats.repositories).length
    }));
    
    const summaryWs = utils.json_to_sheet(summaryData);
    utils.book_append_sheet(wb, summaryWs, 'Summary');
    
    const detailedData = Object.entries(userStats).flatMap(([authorId, stats]) =>
      Object.entries(stats.repositories).map(([repo, repoStats]) => ({
        'Author ID': authorId,
        'Author Name': employeeNames[authorId]?.name || authorId,
        'Email': employeeNames[authorId]?.email || 'N/A',
        'Repository': repo,
        'Commits': repoStats.commits,
        'Branches': repoStats.branches.join(', ')
      }))
    );
    
    const detailedWs = utils.json_to_sheet(detailedData);
    utils.book_append_sheet(wb, detailedWs, 'Detailed');
    
    const commitsData = commits.map(commit => ({
      'SHA': commit.sha.substring(0, 7),
      'Author ID': commit.author?.login || commit.commit.author.name,
      'Author Name': employeeNames[commit.author?.login || '']?.name || commit.commit.author.name,
      'Email': employeeNames[commit.author?.login || '']?.email || commit.commit.author.email || 'N/A',
      'Date': format(new Date(commit.commit.author.date), 'yyyy-MM-dd HH:mm:ss'),
      'Message': commit.commit.message
    }));
    
    const commitsWs = utils.json_to_sheet(commitsData);
    utils.book_append_sheet(wb, commitsWs, 'Commits');
    
    const startDate = format(dateRange[0], 'yyyyMMdd');
    const endDate = format(dateRange[1], 'yyyyMMdd');
    writeFile(wb, `github-commits-${startDate}-${endDate}.xlsx`);
  };

  const trendChartData = {
    labels: commitTrends.map(trend => format(parseISO(trend.date), 'MMM dd')),
    datasets: [
      {
        label: 'Commits',
        data: commitTrends.map(trend => trend.count),
        borderColor: 'rgb(79, 70, 229)',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const
      },
      tooltip: {
        mode: 'index',
        intersect: false
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Date'
        }
      },
      y: {
        display: true,
        beginAtZero: true,
        title: {
          display: true,
          text: 'Number of Commits'
        }
      }
    }
  };

  const sortedUsers = Object.entries(userStats)
    .sort(([, a], [, b]) => b.totalCommits - a.totalCommits);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard Overview</h2>
        <button 
          onClick={handleExportToExcel}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200"
        >
          <FileDown className="w-4 h-4" />
          Export to Excel
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
            <GitBranch className="w-5 h-5 text-indigo-600" />
            <h3>Active Repositories</h3>
          </div>
          <p className="stat-number">
            {new Set(Object.values(userStats).flatMap(stats => 
              Object.keys(stats.repositories)
            )).size}
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Commit Activity</h3>
        <div className="h-[400px]">
          <Line data={trendChartData} options={chartOptions} />
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-xl font-semibold text-gray-900">Contributor Statistics</h3>
        {sortedUsers.map(([authorId, stats]) => {
          const employee = employeeNames[authorId];
          const isExpanded = expandedUsers.has(authorId);
          
          return (
            <div key={authorId} className="bg-white rounded-lg shadow overflow-hidden">
              <button 
                onClick={() => toggleUser(authorId)}
                className="w-full p-6 text-left hover:bg-gray-50 transition-colors duration-200"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {employee?.avatar_url && (
                      <img 
                        src={employee.avatar_url} 
                        alt={employee.name || authorId} 
                        className="w-8 h-8 rounded-full"
                      />
                    )}
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900">
                        {employee?.name || authorId}
                      </h4>
                      {employee?.email && (
                        <p className="text-sm text-gray-500">{employee.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-indigo-600 font-semibold">
                      {stats.totalCommits} commits
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </button>
              
              {isExpanded && (
                <div className="border-t border-gray-100 p-6 space-y-4 bg-gray-50">
                  {Object.entries(stats.repositories).map(([repo, repoStats]) => (
                    <div key={repo} className="bg-white rounded-lg p-4 shadow-sm">
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
                        <span>Active in {repoStats.branches.length} branches</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};