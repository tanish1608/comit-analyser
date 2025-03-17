import React from 'react';
import { useQuery } from 'react-query';
import { fetchPodEmployees } from '../api';
import { UserStats } from '../types';
import { ChevronDown, ChevronRight, Users, GitCommit } from 'lucide-react';
import * as Collapsible from '@radix-ui/react-collapsible';

interface PodHierarchyProps {
  userStats: Record<string, UserStats>;
}

const DEFAULT_POD_IDS = ['pod-a', 'pod-b', 'pod-c'];

export const PodHierarchy: React.FC<PodHierarchyProps> = ({ userStats }) => {
  const { data: podEmployees, isLoading, error } = useQuery(
    'podEmployees',
    () => fetchPodEmployees(DEFAULT_POD_IDS),
    {
      select: (employees) => {
        // Group employees by pod
        const grouped = employees.reduce((acc, emp) => {
          if (!acc[emp.pod]) {
            acc[emp.pod] = [];
          }
          acc[emp.pod].push({
            ...emp,
            commitCount: userStats[emp.empiId]?.totalCommits || 0
          });
          return acc;
        }, {} as Record<string, Array<typeof employees[0] & { commitCount: number }>>);

        // Sort pods by name and employees by commit count
        return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([pod, members]) => ({
          pod,
          members: members.sort((a, b) => b.commitCount - a.commitCount)
        }));
      }
    }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600 p-8">
        <p>Error loading pod data. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Pod Structure</h1>
        <p className="text-gray-600">View all pods and their members with commit activity</p>
      </div>

      <div className="space-y-6">
        {podEmployees?.map(({ pod, members }) => (
          <Collapsible.Root key={pod} defaultOpen className="bg-white rounded-lg shadow-md overflow-hidden">
            <Collapsible.Trigger className="w-full">
              <div className="flex items-center justify-between p-6 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <Users className="w-6 h-6 text-indigo-600" />
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {pod.charAt(0).toUpperCase() + pod.slice(1).replace('-', ' ')}
                    </h2>
                    <p className="text-sm text-gray-500">{members.length} members</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {members.filter(m => m.commitCount > 0).length} active contributors
                  </span>
                  <ChevronDown className="w-5 h-5 text-gray-400 collapsible-chevron" />
                </div>
              </div>
            </Collapsible.Trigger>

            <Collapsible.Content>
              <div className="border-t border-gray-100">
                <ul className="divide-y divide-gray-100">
                  {members.map((member) => (
                    <li key={member.empiId} className="p-6 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">{member.name}</h3>
                          <p className="text-sm text-gray-500">{member.empiId}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <GitCommit className="w-4 h-4 text-gray-400" />
                          <span className={`font-medium ${
                            member.commitCount > 0 ? 'text-green-600' : 'text-orange-600'
                          }`}>
                            {member.commitCount} commits
                          </span>
                        </div>
                      </div>
                      {member.commitCount > 0 && userStats[member.empiId] && (
                        <div className="mt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Repository Activity</h4>
                          <div className="space-y-2">
                            {Object.entries(userStats[member.empiId].repositories).map(([repo, stats]) => (
                              <div key={repo} className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">{repo}</span>
                                <span className="text-indigo-600 font-medium">{stats.commits} commits</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </Collapsible.Content>
          </Collapsible.Root>
        ))}
      </div>
    </div>
  );
};