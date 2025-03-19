import React, { useState } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import { Dashboard } from './Dashboard';
import { PodHierarchy } from './PodHierarchy';
import { AdminLogin } from '../components/AdminLogin';
import { useAuth } from '../contexts/AuthContext';
import { Database, Loader2, AlertCircle, BarChart2, LayoutList } from 'lucide-react';
import { UserStats, CacheStatus, Employee } from '../types';
import { subMonths } from 'date-fns';
import 'rsuite/dist/rsuite.min.css';

export function CachedAnalyzer() {
  const { isAdmin } = useAuth();
  const [view, setView] = useState<'dashboard' | 'hierarchy'>('dashboard');
  const [error, setError] = useState<string | null>(null);
  const [employeeNames, setEmployeeNames] = useState<Record<string, Employee>>({});

  const endDate = new Date();
  const startDate = subMonths(endDate, 4);
  const dateRange: [Date, Date] = [startDate, endDate];

  const {
    data: repoData,
    isLoading,
    error: queryError
  } = useQuery(
    'cached-data',
    async () => {
      try {
        // Get cache stats to find all repositories
        const statsResponse = await axios.get('http://localhost:3001/api/cache/stats');
        const cacheData = statsResponse.data;
        
        if (!cacheData.repositories || Object.keys(cacheData.repositories).length === 0) {
          throw new Error('No cached data found');
        }

        // Get all repositories from cache
        const allRepos = Object.keys(cacheData.repositories).map(key => {
          const [org, repo] = key.split('/');
          return { org, repo };
        });

        const allCommits = [];
        const userStats: Record<string, UserStats> = {};
        
        // Fetch commits for each repository
        for (const { org, repo } of allRepos) {
          try {
            const response = await axios.get(
              `http://localhost:3001/api/cache/commits/${org}/${repo}/${startDate.toISOString()}/${endDate.toISOString()}`
            );
            
            const commits = response.data;
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
              
              if (!userStats[author].repositories[repo]) {
                userStats[author].repositories[repo] = {
                  commits: 0,
                  branches: [],
                  commitDates: []
                };
              }
              
              userStats[author].repositories[repo].commits++;
              
              if (commit.date) {
                const dateStats = userStats[author].repositories[repo].commitDates;
                const existingDate = dateStats.find(d => d.date === commit.date);
                if (existingDate) {
                  existingDate.count++;
                } else {
                  dateStats.push({ date: commit.date, count: 1 });
                }
              }
            });
          } catch (error) {
            console.error(`Error fetching cached commits for ${repo}:`, error);
          }
        }
        
        // Fetch employee names
        const employeeIds = Object.keys(userStats);
        const employeeResponses = await Promise.all(
          employeeIds.map(id => 
            axios.get(`http://localhost:3001/api/employees/${id}`)
              .then(response => ({ id, data: response.data }))
              .catch(() => ({ id, data: null }))
          )
        );
        
        const names: Record<string, Employee> = {};
        employeeResponses.forEach(({ id, data }) => {
          names[id] = {
            login: id,
            name: data?.name || id,
            email: data?.email || null,
            data: data
          };
        });
        
        setEmployeeNames(names);
        
        return { commits: allCommits, userStats };
      } catch (error) {
        console.error('Error fetching cached data:', error);
        throw error;
      }
    },
    {
      retry: 1,
      onError: () => {
        setError('No cached data available. Please use the Get Data page to cache data first.');
      },
    }
  );

  const errorMessage = error || (queryError ? 'Failed to fetch cached data' : null);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Database className="w-10 h-10 text-indigo-600" />
          <h1 className="text-3xl font-bold text-gray-900">
            GitHub Analysis
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

      {errorMessage && (
        <div className="error">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <p>{errorMessage}</p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="loading">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                <Database className="w-8 h-8 text-indigo-600" />
              </div>
            </div>
            <p className="text-lg font-medium text-gray-700">
              Loading cached data...
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

      {!isLoading && (!repoData?.commits || repoData.commits.length === 0) && (
        <div className="text-center py-8 text-gray-600">
          <p>No cached data found. Please use the Get Data page to cache data first.</p>
        </div>
      )}
    </div>
  );
}