import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { setAccessToken, onAuthChange } from '../api/client.js';
import { auth as authApi, me as meApi } from '../api/endpoints.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback(({ access_token, user: u }) => {
    setAccessToken(access_token);
    setUser(u || null);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  // Boot: try to mint a fresh access token from the refresh cookie.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await authApi.refresh();
        setAccessToken(r.access_token);
        const m = await meApi.get();
        if (!cancelled) setUser(m.user);
      } catch (_) {
        clearSession();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    onAuthChange(() => clearSession());
    return () => { cancelled = true; };
  }, [clearSession]);

  const login = useCallback(async (email, password) => {
    const r = await authApi.login({ email, password });
    applySession(r);
    return r;
  }, [applySession]);

  const register = useCallback(async ({ email, password, full_name }) => {
    return authApi.register({ email, password, full_name });
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch (_) {}
    clearSession();
  }, [clearSession]);

  const reloadMe = useCallback(async () => {
    const m = await meApi.get();
    setUser(m.user);
    return m.user;
  }, []);

  const value = { user, loading, login, register, logout, reloadMe, applySession };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
