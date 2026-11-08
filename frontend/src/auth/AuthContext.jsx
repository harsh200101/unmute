import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';
import { setAccessToken, onAuthChange } from '../api/client.js';
import { auth as authApi, me as meApi } from '../api/endpoints.js';
import { initPushNotifications } from '../services/pushNotificationService.js';

const AuthContext = createContext(null);

async function getPersistedToken() {
  try {
    const { value } = await Preferences.get({ key: 'unmute_refresh_token' });
    if (value) return value;
  } catch (_) {}
  try {
    return localStorage.getItem('unmute_refresh_token') || null;
  } catch (_) {}
  return null;
}

async function setPersistedToken(token) {
  try {
    localStorage.setItem('unmute_session', '1');
    if (token) localStorage.setItem('unmute_refresh_token', token);
  } catch (_) {}
  try {
    if (token) {
      await Preferences.set({ key: 'unmute_refresh_token', value: token });
      await Preferences.set({ key: 'unmute_session', value: '1' });
    }
  } catch (_) {}
}

async function clearPersistedToken() {
  try {
    localStorage.removeItem('unmute_session');
    localStorage.removeItem('unmute_refresh_token');
  } catch (_) {}
  try {
    await Preferences.remove({ key: 'unmute_refresh_token' });
    await Preferences.remove({ key: 'unmute_session' });
  } catch (_) {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback(async ({ access_token, refresh_token, user: u }) => {
    await setPersistedToken(refresh_token);
    setAccessToken(access_token);
    setUser(u || null);
  }, []);

  const clearSession = useCallback(async () => {
    await clearPersistedToken();
    setAccessToken(null);
    setUser(null);
  }, []);

  // Boot: try to mint a fresh access token from the refresh token / cookie.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let hasSession = false;
      try {
        hasSession = !!localStorage.getItem('unmute_session');
        if (!hasSession) {
          const { value } = await Preferences.get({ key: 'unmute_session' });
          hasSession = !!value;
        }
      } catch (_) {}

      if (!hasSession) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const savedRefresh = await getPersistedToken();
        const r = await authApi.refresh({ refresh_token: savedRefresh || undefined });
        setAccessToken(r.access_token);
        if (r.refresh_token) {
          await setPersistedToken(r.refresh_token);
        }
        const m = await meApi.get();
        if (!cancelled) setUser(m.user);
      } catch (_) {
        await clearSession();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    onAuthChange(() => clearSession());
    return () => { cancelled = true; };
  }, [clearSession]);

  // App resume & hardware back button handling on mobile
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let appStateHandle = null;
    let backHandle = null;

    App.addListener('appStateChange', async (state) => {
      if (state.isActive) {
        try {
          const token = await getPersistedToken();
          if (token) {
            const r = await authApi.refresh({ refresh_token: token });
            setAccessToken(r.access_token);
            if (r.refresh_token) await setPersistedToken(r.refresh_token);
          }
        } catch (_) {}
      }
    }).then((h) => { appStateHandle = h; });

    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack && window.location.pathname !== '/' && window.location.pathname !== '/dashboard') {
        window.history.back();
      } else {
        App.exitApp();
      }
    }).then((h) => { backHandle = h; });

    return () => {
      appStateHandle?.remove();
      backHandle?.remove();
    };
  }, []);

  useEffect(() => {
    if (user) {
      initPushNotifications();
    }
  }, [user]);

  const login = useCallback(async (email, password) => {
    const r = await authApi.login({ email, password });
    await applySession(r);
    return r;
  }, [applySession]);

  const register = useCallback(async ({ email, password, full_name }) => {
    return authApi.register({ email, password, full_name });
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch (_) {}
    await clearSession();
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
