import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { tokenStorage } from '../storage/tokenStorage';
import * as authApi from '../api/auth';
import { Business } from '../api/types';

interface AuthContextValue {
  business: Business | null;
  isLoading: boolean;
  isOwner: boolean;
  /** True for exactly one app session after a fresh signup, so onboarding can show suggested follows once. */
  justSignedUp: boolean;
  clearJustSignedUp: () => void;
  signup: (input: Parameters<typeof authApi.signup>[0]) => Promise<void>;
  login: (input: Parameters<typeof authApi.login>[0]) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setBusiness: (business: Business) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [business, setBusinessState] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(true);
  const [justSignedUp, setJustSignedUp] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await tokenStorage.get();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const res = await authApi.me();
        setBusinessState(res.business);
        setIsOwner(res.isOwner);
      } catch {
        await tokenStorage.clear();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signup = useCallback(async (input: Parameters<typeof authApi.signup>[0]) => {
    const res = await authApi.signup(input);
    await tokenStorage.set(res.token);
    setBusinessState(res.business);
    setIsOwner(true);
    setJustSignedUp(true);
  }, []);

  const login = useCallback(async (input: Parameters<typeof authApi.login>[0]) => {
    const res = await authApi.login(input);
    await tokenStorage.set(res.token);
    setBusinessState(res.business);
    setIsOwner(!res.memberRole);
  }, []);

  const loginAsGuest = useCallback(async () => {
    const res = await authApi.guest();
    await tokenStorage.set(res.token);
    setBusinessState(res.business);
    setIsOwner(true);
  }, []);

  const logout = useCallback(async () => {
    await tokenStorage.clear();
    setBusinessState(null);
  }, []);

  const refreshMe = useCallback(async () => {
    const res = await authApi.me();
    setBusinessState(res.business);
    setIsOwner(res.isOwner);
  }, []);

  const clearJustSignedUp = useCallback(() => setJustSignedUp(false), []);

  const value = useMemo(
    () => ({ business, isLoading, isOwner, justSignedUp, clearJustSignedUp, signup, login, loginAsGuest, logout, refreshMe, setBusiness: setBusinessState }),
    [business, isLoading, isOwner, justSignedUp, clearJustSignedUp, signup, login, loginAsGuest, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
