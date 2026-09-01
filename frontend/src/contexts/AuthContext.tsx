import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getToken, setToken, clearToken, AUTH_EXPIRED_EVENT } from "@/lib/api";

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      const { user } = await api.get<{ user: User }>("/api/auth/me");
      setUser(user);
    } catch {
      clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    loadMe().finally(() => setIsLoading(false));
  }, [loadMe]);

  // Backend rejected the token mid-session → drop it.
  useEffect(() => {
    const onExpired = () => {
      clearToken();
      setUser(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const { token, user } = await api.post<{ token: string; user: User }>("/api/auth/login", { email, password });
      setToken(token);
      setUser(user);
    } catch (e) {
      const msg = (e as Error).message || "Login failed";
      setError(msg);
      throw e;
    }
  }, []);

  const logout = useCallback(() => {
    api.post("/api/auth/logout").catch(() => {});
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isLoading,
        error,
        login,
        logout,
        refresh: loadMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
