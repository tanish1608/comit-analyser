import React from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { format, parseISO, differenceInDays, startOfDay, endOfDay } from 'date-fns';
import { Commit, UserStats } from '../types';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
//OCA

//account-fiscal-rule
// Register Chart.js components

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface AnalyticsProps {
  commits: Commit[];
  dateRange: [Date, Date];
  userStats: Record<string, UserStats>;
}

export const Analytics: React.FC<AnalyticsProps> = ({ commits, dateRange, userStats }) => {
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

  // Calculate commit hours distribution
  const commitHours = React.useMemo(() => {
    const hours = new Array(24).fill(0);
    
    commits.forEach(commit => {
      const hour = parseISO(commit.commit.author.date).getHours();
      hours[hour]++;
    });
    
    return hours;
  }, [commits]);

  // Calculate user contribution distribution
  const userContributions = React.useMemo(() => {
    return Object.entries(userStats)
      .sort((a, b) => b[1].totalCommits - a[1].totalCommits)
      .slice(0, 10);
  }, [userStats]);

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false
      }
    }
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

  const hourlyChartData = {
    labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
    datasets: [
      {
        label: 'Commits by Hour',
        data: commitHours,
        backgroundColor: 'rgba(79, 70, 229, 0.8)',
        borderColor: 'rgb(79, 70, 229)',
        borderWidth: 1
      }
    ]
  };

  const contributionsChartData = {
    labels: userContributions.map(([authorId]) => authorId),
    datasets: [
      {
        label: 'Commits by Author',
        data: userContributions.map(([, stats]) => stats.totalCommits),
        backgroundColor: [
          'rgba(79, 70, 229, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(139, 92, 246, 0.8)',
          'rgba(236, 72, 153, 0.8)',
          'rgba(14, 165, 233, 0.8)',
          'rgba(168, 85, 247, 0.8)',
          'rgba(249, 115, 22, 0.8)'
        ]
      }
    ]
  };

  const daysInRange = differenceInDays(
    endOfDay(dateRange[1]),
    startOfDay(dateRange[0])
  ) + 1;

  const avgCommitsPerDay = (commits.length / daysInRange).toFixed(1);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>
        <div className="text-sm text-gray-600">
          {format(dateRange[0], 'MMM dd, yyyy')} - {format(dateRange[1], 'MMM dd, yyyy')}
          <span className="ml-2">({daysInRange} days)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Commit Activity</h3>
            <div className="text-sm text-gray-600">
              Avg. {avgCommitsPerDay} commits/day
            </div>
          </div>
          <div className="h-[400px]">
            <Line 
              data={trendChartData} 
              options={{
                ...commonOptions,
                scales: {
                  x: {
                    title: { display: true, text: 'Date' }
                  },
                  y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Number of Commits' }
                  }
                }
              }} 
            />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Commits by Hour (UTC)</h3>
          <div className="h-[400px]">
            <Bar 
              data={hourlyChartData} 
              options={{
                ...commonOptions,
                scales: {
                  x: {
                    title: { display: true, text: 'Hour of Day' }
                  },
                  y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Number of Commits' }
                  }
                }
              }} 
            />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Top Contributors</h3>
          <div className="h-[400px]">
            <Bar 
              data={contributionsChartData} 
              options={{
                ...commonOptions,
                indexAxis: 'y' as const,
                scales: {
                  x: {
                    beginAtZero: true,
                    title: { display: true, text: 'Number of Commits' }
                  }
                }
              }} 
            />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Contribution Distribution</h3>
          <div className="h-[400px]">
            <Doughnut 
              data={contributionsChartData}
              options={{
                ...commonOptions,
                cutout: '60%',
                plugins: {
                  ...commonOptions.plugins,
                  legend: {
                    position: 'right' as const
                  }
                }
              }} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};