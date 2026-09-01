// Local app auth context - WordPress/Access Manager login bridge removed.

import React, { createContext, useContext, useEffect, useState } from 'react';

export type UserRole = 'admin' | 'student' | 'manager' | 'viewer' | string;

interface User {
  id: string;
  userId: string;
  email: string;
  name: string;
  full_name: string;
  avatar?: string;
  role: UserRole;
  plan: 'free' | 'starter' | 'pro' | 'label';
  tier: string;
  credits: number;
  is_premium: boolean;
  pmp_level?: string;
  expiresAt?: string;
}

interface Session {
  user: User;
  token: string;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loading: boolean;
  error: string | null;
  login: () => void;
  logout: () => Promise<void>;
  refreshCredits: () => Promise<void>;
}

const LOCAL_TOKEN = 'hrl-local-app-token';
const LOCAL_USER: User = {
  id: 'local-admin',
  userId: 'local-admin',
  email: 'local@hardbanrecordslab.online',
  name: 'Local Admin',
  full_name: 'Local Admin',
  role: 'admin',
  plan: 'label',
  tier: 'label',
  credits: 999999,
  is_premium: true,
  pmp_level: 'Local App Access',
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function clearLegacySsoState() {
  localStorage.removeItem('hrl_jwt_token');
  document.cookie = 'jwt_token=; Max-Age=0; path=/;';
  document.cookie = 'jwt_token=; Max-Age=0; path=/; domain=.hardbanrecordslab.online;';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(LOCAL_USER);
  const [token, setToken] = useState<string | null>(LOCAL_TOKEN);
  const [isLoading, setIsLoading] = useState(true);

  const enableLocalSession = () => {
    clearLegacySsoState();
    localStorage.setItem('hrl_local_app_auth', LOCAL_TOKEN);
    setUser(LOCAL_USER);
    setToken(LOCAL_TOKEN);
  };

  useEffect(() => {
    enableLocalSession();
    setIsLoading(false);
  }, []);

  const logout = async (): Promise<void> => {
    clearLegacySsoState();
    localStorage.removeItem('hrl_local_app_auth');
    setUser(LOCAL_USER);
    setToken(LOCAL_TOKEN);
  };

  const refreshCredits = async (): Promise<void> => {
    enableLocalSession();
  };

  const session = user && token ? { user, token } : null;
  const isAuthenticated = Boolean(session);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        token,
        isAuthenticated,
        isLoading,
        loading: isLoading,
        error: null,
        login: enableLocalSession,
        logout,
        refreshCredits,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};