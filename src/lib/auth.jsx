import { createContext, useContext, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./supabase.js";

const AuthContext = createContext(null);

const NOT_CONFIGURED_ERROR = {
  message: "Auth isn't configured on this deployment (missing VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY).",
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return; // stay in the logged-out, non-loading state
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    accessToken: session?.access_token ?? null,
    signInWithPassword: (email, password) =>
      supabaseConfigured
        ? supabase.auth.signInWithPassword({ email, password })
        : Promise.resolve({ data: null, error: NOT_CONFIGURED_ERROR }),
    signUp: (email, password) =>
      supabaseConfigured
        ? supabase.auth.signUp({ email, password })
        : Promise.resolve({ data: null, error: NOT_CONFIGURED_ERROR }),
    signInWithOAuth: (provider, redirectTo) =>
      supabaseConfigured
        ? supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })
        : Promise.resolve({ data: null, error: NOT_CONFIGURED_ERROR }),
    signOut: () => (supabaseConfigured ? supabase.auth.signOut() : Promise.resolve({ error: null })),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
