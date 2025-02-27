import React, { useState } from 'react';
import { Commit, UserStats } from '../types';
import { BarChart2, GitCommit, Users, Calendar, GitBranch, GitFork, FileDown, Search, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';

interface CommitStatsProps {
  commits: Commit[];
  dateRange: [Date, Date];
  userStats: Record<string, UserStats>;
  darkMode?: boolean;
}

export const CommitStats: React.FC<CommitStatsProps> = ({ commits, dateRange, userStats, darkMode = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'commits'>('commits');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

  const dateRangeText = dateRange
    ? `${format(dateRange[0], 'MMM dd, yyyy')} - ${format(dateRange[1], 'MMM dd, yyyy')}`
    : 'All time';

  const toggleSort = (field: 'name' | 'commits') => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('desc');
    }
  };

  const toggleUserExpanded = (author: string) => {
    setExpandedUsers(prev => ({
      ...prev,
      [author]: !prev[author]
    }));
  };

  const filteredUsers = Object.entries(userStats)
    .filter(([author]) => 
      author.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort(([authorA, statsA], [authorB, statsB]) => {
      if (sortBy === 'name') {
        return sortDirection === 'asc' 
          ? authorA.localeCompare(authorB)
          : authorB.localeCompare(authorA);
      } else {
        return sortDirection === 'asc'
          ? statsA.totalCommits - statsB.totalCommits
          : statsB.totalCommits - statsA.totalCommits;
      }
    });

  const handleExportToExcel = () => {
    // Create workbook and worksheet
    const wb = utils.book_new();
    
    // Create summary sheet
    const summaryData = Object.entries(userStats).map(([author, stats]) => ({
      'Author': author,
      'Total Commits': stats.totalCommits,
      'Repositories': Object.keys(stats.repositories).length
    }));
    
    const summaryWs = utils.json_to_sheet(summaryData);
    utils.book_append_sheet(wb, summaryWs, 'Summary');
    
    // Create detailed sheet
    interface DetailedRecord {
      Author: string;
      Repository: string;
      Commits: number;
      Branches: string;
    }
    const detailedData: DetailedRecord[] = [];
    
    Object.entries(userStats).forEach(([author, stats]) => {
      Object.entries(stats.repositories).forEach(([repo, repoStats]) => {
        detailedData.push({
          'Author': author,
          'Repository': repo,
          'Commits': repoStats.commits,
          'Branches': repoStats.branches.join(', ')
        });
      });
    });
    
    const detailedWs = utils.json_to_sheet(detailedData);
    utils.book_append_sheet(wb, detailedWs, 'Detailed');
    
    // Create commits sheet
    const commitsData = commits.map(commit => ({
      'SHA': commit.sha.substring(0, 7),
      'Author': commit.author?.login || commit.commit.author.name,
      'Date': format(new Date(commit.commit.author.date), 'yyyy-MM-dd HH:mm:ss'),
      'Message': commit.commit.message
    }));
    
    const commitsWs = utils.json_to_sheet(commitsData);
    utils.book_append_sheet(wb, commitsWs, 'Commits');
    
    // Generate filename with date range
    const startDate = format(dateRange[0], 'yyyyMMdd');
    const endDate = format(dateRange[1], 'yyyyMMdd');
    const filename = `github-commits-${startDate}-${endDate}.xlsx`;
    
    // Write and download
    writeFile(wb, filename);
  };

  return (
    <div className={`stats-container ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}>
      <div className="stats-header">
        <BarChart2 className={`w-6 h-6 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
        <h2>Commit Statistics</h2>
        <button 
          onClick={handleExportToExcel}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200"
        >
          <FileDown className="w-4 h-4" />
          Export to Excel
        </button>
      </div>

      <div className={`stats-grid ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
        <div className={`stat-card ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
          <div className="stat-card-header">
            <Users className={`w-5 h-5 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
            <h3>Contributors</h3>
          </div>
          <p className={`stat-number ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>{Object.keys(userStats).length}</p>
        </div>

        <div className={`stat-card ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
          <div className="stat-card-header">
            <GitCommit className={`w-5 h-5 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
            <h3>Total Commits</h3>
          </div>
          <p className={`stat-number ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>{commits.length}</p>
        </div>

        <div className={`stat-card ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
          <div className="stat-card-header">
            <Calendar className={`w-5 h-5 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
            <h3>Time Range</h3>
          </div>
          <p className={`text-xl font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{dateRangeText}</p>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
          <h3 className={`text-xl font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>Detailed User Statistics</h3>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
              <input
                type="text"
                placeholder="Search contributors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`pl-9 pr-4 py-2 rounded-lg w-full sm:w-64 ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border border-gray-300 text-gray-900'
                }`}
              />
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => toggleSort('name')}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg ${
                  darkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                } transition-colors`}
              >
                <Filter className="w-4 h-4" />
                Name
                {sortBy === 'name' && (
                  sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                )}
              </button>
              
              <button 
                onClick={() => toggleSort('commits')}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg ${
                  darkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                } transition-colors`}
              >
                <GitCommit className="w-4 h-4" />
                Commits
                {sortBy === 'commits' && (
                  sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
        
        <div className="space-y-6">
          {filteredUsers.length === 0 ? (
            <div className={`p-6 text-center ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              No contributors found matching your search.
            </div>
          ) : (
            filteredUsers.map(([author, stats]) => (
              <div 
                key={author} 
                className={`rounded-lg shadow p-6 ${darkMode ? 'bg-gray-700' : 'bg-white'}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h4 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{author}</h4>
                  <div className="flex items-center gap-3">
                    <span className={`${darkMode ? 'text-indigo-400' : 'text-indigo-600'} font-semibold`}>
                      {stats.totalCommits} total commits
                    </span>
                    <button 
                      onClick={() => toggleUserExpanded(author)}
                      className={`p-1 rounded ${darkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                    >
                      {expandedUsers[author] ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
                
                {(expandedUsers[author] || Object.keys(stats.repositories).length <= 3) && (
                  <div className="space-y-4">
                    {Object.entries(stats.repositories).map(([repo, repoStats]) => (
                      <div 
                        key={repo} 
                        className={`rounded-lg p-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <GitFork className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                            <span className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{repo}</span>
                          </div>
                          <span className={`${darkMode ? 'text-indigo-400' : 'text-indigo-600'} font-medium`}>
                            {repoStats.commits} commits
                          </span>
                        </div>
                        
                        <div className={`flex items-center gap-2 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <GitBranch className="w-4 h-4" />
                          <span>Active in {repoStats.branches.length} branches: </span>
                          <span className="font-medium">
                            {repoStats.branches.join(', ')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {!expandedUsers[author] && Object.keys(stats.repositories).length > 3 && (
                  <button
                    onClick={() => toggleUserExpanded(author)}
                    className={`mt-2 text-sm ${darkMode ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-700'}`}
                  >
                    Show {Object.keys(stats.repositories).length - 3} more repositories...
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};