import React, { createContext, useContext, useState } from 'react';
import { AuthContextType, AuthProviderProps, AdminCredentials } from '../types';
import { useNavigate } from 'react-router-dom';

const ADMIN_USERNAME = import.meta.env.VITE_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAdmin, setIsAdmin] = useState(() => {
    const storedAuth = localStorage.getItem('auth');
    if (storedAuth) {
      return JSON.parse(storedAuth).isAdmin;
    }
    return false;
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const navigate = useNavigate();

  const login = async (credentials: AdminCredentials) => {
    if (credentials.username === ADMIN_USERNAME && credentials.password === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setShowLoginModal(false);
      localStorage.setItem('auth', JSON.stringify({ isAdmin: true }));
      navigate('/get-data');
    } else {
      throw new Error('Invalid credentials');
    }
  };

  const logout = () => {
    setIsAdmin(false);
    localStorage.removeItem('auth');
    navigate('/');
  };

  return (
    <AuthContext.Provider value={{ isAdmin, login, logout, showLoginModal, setShowLoginModal }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};