import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { setAccessToken, onAuthChange } from '../api/client.js';
import { auth as authApi, me as meApi } from '../api/endpoints.js';
import { initPushNotifications } from '../services/pushNotificationService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback(({ access_token, refresh_token, user: u }) => {
    try {
      localStorage.setItem('unmute_session', '1');
      if (refresh_token) localStorage.setItem('unmute_refresh_token', refresh_token);
    } catch (_) {}
    setAccessToken(access_token);
    setUser(u || null);
  }, []);

  const clearSession = useCallback(() => {
    try {
      localStorage.removeItem('unmute_session');
      localStorage.removeItem('unmute_refresh_token');
    } catch (_) {}
    setAccessToken(null);
    setUser(null);
  }, []);

  // Boot: try to mint a fresh access token from the refresh cookie.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let hasSession = false;
      try { hasSession = !!localStorage.getItem('unmute_session'); } catch (_) {}
      if (!hasSession) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const savedRefresh = localStorage.getItem('unmute_refresh_token') || undefined;
        const r = await authApi.refresh({ refresh_token: savedRefresh });
        setAccessToken(r.access_token);
        if (r.refresh_token) {
          try { localStorage.setItem('unmute_refresh_token', r.refresh_token); } catch (_) {}
        }
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

  useEffect(() => {
    if (user) {
      initPushNotifications();
    }
  }, [user]);

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
