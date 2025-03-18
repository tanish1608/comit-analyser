import { AdminUser } from './types';

export const getAdminUsers = (): AdminUser[] => {
  const adminUsersStr = import.meta.env.VITE_ADMIN_USERS || '';
  return adminUsersStr.split(',').map(userStr => {
    const [email, password] = userStr.split(':');
    return { email, password };
  });
};

export const validateAdmin = (email: string, password: string): boolean => {
  const adminUsers = getAdminUsers();
  return adminUsers.some(user => user.email === email && user.password === password);
};