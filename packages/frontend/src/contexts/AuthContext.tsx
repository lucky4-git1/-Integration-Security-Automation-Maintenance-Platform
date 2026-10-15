import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { authApi, clearAuth } from '@/lib/api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface AuthContextValue {
  user: User | null;
  organizationId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setOrganization: (id: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(
    localStorage.getItem('organization_id')
  );

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) { setIsLoading(false); return; }
    authApi.me()
      .then(d => setUser(d.data.user))
      .catch(() => clearAuth())
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login({ email, password });
    const { user: u, accessToken, refreshToken } = result.data;
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch {}
    clearAuth();
    setUser(null);
    setOrganizationId(null);
  }, []);

  const setOrganization = useCallback((id: string) => {
    localStorage.setItem('organization_id', id);
    setOrganizationId(id);
  }, []);

  return (
    <AuthContext.Provider value={{ user, organizationId, isAuthenticated: !!user, isLoading, login, logout, setOrganization }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
