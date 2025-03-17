import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { PodEmployee, Pod, UserStats } from '../types';
import { fetchPodEmployees, compareEmployeesWithCommits } from '../api';
import { Users, GitCommit, AlertCircle, Search, Filter } from 'lucide-react';

interface PodComparisonProps {
  userStats: Record<string, UserStats>;
}

const DEFAULT_PODS: Pod[] = [
  { name: 'Pod A', apiUrl: 'https://api.pod-a.example.com/employees' },
  { name: 'Pod B', apiUrl: 'https://api.pod-b.example.com/employees' },
  // Add more pods as needed
];

export const PodComparison: React.FC<PodComparisonProps> = ({ userStats }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterNoCommits, setFilterNoCommits] = useState(false);
  
  const { data: podEmployees, isLoading, error } = useQuery(
    'podEmployees',
    () => fetchPodEmployees(DEFAULT_PODS),
    {
      onSuccess: (data) => {
        return compareEmployeesWithCommits(data, userStats);
      }
    }
  );

  const filteredEmployees = podEmployees?.filter(employee => {
    const matchesSearch = 
      employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.empiId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.pod.toLowerCase().includes(searchTerm.toLowerCase());
      
    if (filterNoCommits) {
      return matchesSearch && !employee.hasCommits;
    }
    return matchesSearch;
  });

  const stats = {
    total: podEmployees?.length || 0,
    withCommits: podEmployees?.filter(e => e.hasCommits).length || 0,
    withoutCommits: podEmployees?.filter(e => !e.hasCommits).length || 0
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Pod Employee Analysis</h1>
        <p className="text-gray-600">
          Compare pod employees with GitHub commit activity
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-semibold">Total Employees</h3>
          </div>
          <p className="text-3xl font-bold text-indigo-600">{stats.total}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <GitCommit className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold">With Commits</h3>
          </div>
          <p className="text-3xl font-bold text-green-600">{stats.withCommits}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-5 h-5 text-orange-600" />
            <h3 className="text-lg font-semibold">Without Commits</h3>
          </div>
          <p className="text-3xl font-bold text-orange-600">{stats.withoutCommits}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow mb-8">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, EMPI ID, or pod..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={filterNoCommits}
                  onChange={(e) => setFilterNoCommits(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Show only employees without commits
              </label>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading employee data...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">
            <AlertCircle className="w-12 h-12 mx-auto mb-4" />
            <p>Error loading employee data. Please try again.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    EMPI ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pod
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredEmployees?.map((employee) => (
                  <tr key={`${employee.empiId}-${employee.pod}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {employee.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {employee.empiId}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {employee.pod}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        employee.hasCommits
                          ? 'bg-green-100 text-green-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}>
                        {employee.hasCommits ? 'Has Commits' : 'No Commits'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};