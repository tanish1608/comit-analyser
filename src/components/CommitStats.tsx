import React, { useEffect, useState } from 'react';
import { Commit, UserStats, Employee } from '../types';
import { BarChart2, GitCommit, Users, Calendar, GitBranch, GitFork, FileDown } from 'lucide-react';
import { format, parseISO, differenceInDays, startOfDay, endOfDay } from 'date-fns';
import { utils, writeFile } from 'xlsx';
import { fetchEmployeeNames } from '../api';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

interface CommitStatsProps {
  commits: Commit[];
  dateRange: [Date, Date];
  userStats: Record<string, UserStats>;
  token?: string;
}

interface CommitTrend {
  date: string;
  count: number;
}

export const CommitStats: React.FC<CommitStatsProps> = ({ commits, dateRange, userStats, token }) => {
  const [employeeNames, setEmployeeNames] = useState<Record<string, Employee>>({});
  const [commitTrends, setCommitTrends] = useState<CommitTrend[]>([]);
  const [activeTime, setActiveTime] = useState<Record<string, number>>({});
  
  useEffect(() => {
    const fetchNames = async () => {
      const employeeIds = Object.keys(userStats);
      const names = await fetchEmployeeNames(employeeIds, token);
      setEmployeeNames(names);
    };
    
    fetchNames();
  }, [userStats, token]);

  // Filter out pull request commits
  const nonPRCommits = commits.filter(commit => 
    !commit.commit.message.toLowerCase().includes('merge pull request') &&
    !commit.commit.message.toLowerCase().includes('pr #')
  );

  // Calculate commit trends
  useEffect(() => {
    const trends: Record<string, number> = {};
    const times: Record<string, number[]> = {};
    
    nonPRCommits.forEach(commit => {
      const date = format(parseISO(commit.commit.author.date), 'yyyy-MM-dd');
      trends[date] = (trends[date] || 0) + 1;
      
      // Extract hour from commit time
      const hour = parseISO(commit.commit.author.date).getHours();
      if (!times[hour]) times[hour] = [];
      times[hour].push(1);
    });
    
    // Convert to array and sort by date
    const trendArray = Object.entries(trends)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    setCommitTrends(trendArray);
    
    // Calculate average commits per hour
    const avgTimes: Record<string, number> = {};
    Object.entries(times).forEach(([hour, counts]) => {
      avgTimes[hour] = counts.reduce((a, b) => a + b, 0) / counts.length;
    });
    setActiveTime(avgTimes);
  }, [nonPRCommits]);

  const dateRangeText = dateRange
    ? `${format(dateRange[0], 'MMM dd, yyyy')} - ${format(dateRange[1], 'MMM dd, yyyy')}`
    : 'All time';

  const sortedUsers = Object.entries(userStats)
    .sort(([, a], [, b]) => b.totalCommits - a.totalCommits);

  const handleExportToExcel = () => {
    const wb = utils.book_new();
    
    const summaryData = sortedUsers.map(([authorId, stats]) => ({
      'Author ID': authorId,
      'Author Name': employeeNames[authorId]?.name || authorId,
      'Total Commits': stats.totalCommits,
      'Repositories': Object.keys(stats.repositories).length,
      'Active Hours': Object.entries(activeTime)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([hour, count]) => `${hour}:00 (${count.toFixed(1)})`).join(', ')
    }));
    
    const summaryWs = utils.json_to_sheet(summaryData);
    utils.book_append_sheet(wb, summaryWs, 'Summary');
    
    const detailedData: any[] = [];
    
    sortedUsers.forEach(([authorId, stats]) => {
      Object.entries(stats.repositories).forEach(([repo, repoStats]) => {
        detailedData.push({
          'Author ID': authorId,
          'Author Name': employeeNames[authorId]?.name || authorId,
          'Repository': repo,
          'Commits': repoStats.commits,
          'Branches': repoStats.branches.join(', ')
        });
      });
    });
    
    const detailedWs = utils.json_to_sheet(detailedData);
    utils.book_append_sheet(wb, detailedWs, 'Detailed');
    
    const commitsData = nonPRCommits.map(commit => ({
      'SHA': commit.sha.substring(0, 7),
      'Author ID': commit.author?.login || commit.commit.author.name,
      'Author Name': employeeNames[commit.author?.login || '']?.name || commit.commit.author.name,
      'Date': format(new Date(commit.commit.author.date), 'yyyy-MM-dd HH:mm:ss'),
      'Message': commit.commit.message
    }));
    
    const commitsWs = utils.json_to_sheet(commitsData);
    utils.book_append_sheet(wb, commitsWs, 'Commits');
    
    const startDate = format(dateRange[0], 'yyyyMMdd');
    const endDate = format(dateRange[1], 'yyyyMMdd');
    const filename = `github-commits-${startDate}-${endDate}.xlsx`;
    
    writeFile(wb, filename);
  };

  // Chart data for commit trends
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

  // Chart data for active hours
  const activeHoursData = {
    labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
    datasets: [
      {
        label: 'Average Commits',
        data: Array.from({ length: 24 }, (_, i) => activeTime[i] || 0),
        backgroundColor: 'rgba(79, 70, 229, 0.8)'
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  const daysInRange = differenceInDays(
    endOfDay(dateRange[1]),
    startOfDay(dateRange[0])
  ) + 1;

  const avgCommitsPerDay = (nonPRCommits.length / daysInRange).toFixed(1);

  return (
    <div className="stats-container">
      <div className="stats-header">
        <BarChart2 className="w-6 h-6 text-indigo-600" />
        <h2>Commit Statistics</h2>
        <button 
          onClick={handleExportToExcel}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200"
        >
          <FileDown className="w-4 h-4" />
          Export to Excel
        </button>
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
          <p className="stat-number">{nonPRCommits.length}</p>
          <p className="text-sm text-gray-600 mt-1">
            Avg. {avgCommitsPerDay} commits/day
          </p>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <h3>Time Range</h3>
          </div>
          <p className="text-xl font-semibold text-gray-800">{dateRangeText}</p>
          <p className="text-sm text-gray-600 mt-1">{daysInRange} days</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Commit Trends</h3>
          <Line data={trendChartData} options={chartOptions} />
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Active Hours</h3>
          <Bar data={activeHoursData} options={chartOptions} />
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Detailed User Statistics</h3>
        <div className="space-y-6">
          {sortedUsers.map(([authorId, stats]) => {
            const employee = employeeNames[authorId];
            return (
              <div key={authorId} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {employee?.avatar_url && (
                      <img 
                        src={employee.avatar_url} 
                        alt={employee.name} 
                        className="w-8 h-8 rounded-full"
                      />
                    )}
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900">
                        {employee?.name || authorId}
                      </h4>
                      {employee?.name && (
                        <p className="text-sm text-gray-500">{authorId}</p>
                      )}
                    </div>
                  </div>
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
            );
          })}
        </div>
      </div>
    </div>
  );
};