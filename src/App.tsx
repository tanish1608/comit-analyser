import React from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { Github, Database } from 'lucide-react';
import { LiveAnalyzer } from './pages/LiveAnalyzer';
import { CachedAnalyzer } from './pages/CachedAnalyzer';
import { useAuth } from './contexts/AuthContext';

function App() {
  const location = useLocation();
  const { isAdmin, showLoginModal, setShowLoginModal } = useAuth();

  // Redirect to login modal when accessing /get-data without auth
  React.useEffect(() => {
    if (location.pathname === '/get-data' && !isAdmin) {
      setShowLoginModal(true);
    }
  }, [location.pathname, isAdmin, setShowLoginModal]);

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Github className="w-8 h-8 text-indigo-600" />
                <span className="ml-2 text-xl font-bold text-gray-900">
                  GitHub Analyzer
                </span>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  to="/"
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    location.pathname === '/'
                      ? 'border-indigo-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  <Database className="w-4 h-4 mr-2" />
                  Home
                </Link>
                <Link
                  to="/get-data"
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    location.pathname === '/get-data'
                      ? 'border-indigo-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  <Github className="w-4 h-4 mr-2" />
                  Get Data
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="py-8">
        <Routes>
          <Route path="/" element={<CachedAnalyzer />} />
          <Route
            path="/get-data"
            element={
              isAdmin ? (
                <LiveAnalyzer />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;