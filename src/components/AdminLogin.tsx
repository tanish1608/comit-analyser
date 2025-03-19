import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Lock, LogOut, UserCircle } from 'lucide-react';

export const AdminLogin: React.FC = () => {
  const { isAdmin, login, logout } = useAuth();
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login({ username, password });
      setUsername('');
      setPassword('');
      setShowLoginForm(false);
    } catch (error) {
      setError('Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  if (isAdmin) {
    return (
      <div className="absolute top-4 right-4">
        <button
          onClick={logout}
          className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors duration-200"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-4 right-4">
      {!showLoginForm ? (
        <button
          onClick={() => setShowLoginForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200"
        >
          <UserCircle className="w-4 h-4" />
          Admin Login
        </button>
      ) : (
        <div className="bg-white rounded-lg shadow-lg p-6 w-80">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Lock className="w-5 h-5 text-indigo-600" />
              Admin Login
            </h2>
            <button
              onClick={() => setShowLoginForm(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-red-600 text-sm">{error}</div>
            )}
            
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};