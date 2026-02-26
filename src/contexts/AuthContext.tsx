import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react';
import { supabase } from '../lib/supabase';
import { trackEvent, GA_EVENTS } from '../lib/analytics';
import type { Profile, TradieDetails } from '../types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  tradieDetails: TradieDetails | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
  updateTradieDetails: (updates: Partial<TradieDetails>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tradieDetails, setTradieDetails] = useState<TradieDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string, retries = 3) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileData) {
      setProfile(profileData);

      if (profileData.role === 'tradie') {
        const { data: tradieData } = await supabase
          .from('tradie_details')
          .select('*')
          .eq('profile_id', userId)
          .maybeSingle();
        setTradieDetails(tradieData);
      }
    } else if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return fetchProfile(userId, retries - 1);
    }
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        Sentry.setUser({ id: session.user.id, email: session.user.email });
        await fetchProfile(session.user.id);
      }
      if (mounted) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'INITIAL_SESSION') return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        Sentry.setUser({ id: session.user.id, email: session.user.email });
        (async () => {
          if (mounted) await fetchProfile(session.user.id);
        })();
      } else if (event === 'SIGNED_OUT') {
        Sentry.setUser(null);
        setProfile(null);
        setTradieDetails(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });
    if (!error) trackEvent(GA_EVENTS.SIGN_UP, { method: 'email' });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) trackEvent(GA_EVENTS.LOGIN, { method: 'email' });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setTradieDetails(null);
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: new Error('Not authenticated') };

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (!error) {
      await fetchProfile(user.id);
    }

    return { error };
  };

  const updateTradieDetails = async (updates: Partial<TradieDetails>) => {
    if (!user) return { error: new Error('Not authenticated') };

    const { data: existing } = await supabase
      .from('tradie_details')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();

    let error;
    if (existing) {
      const result = await supabase
        .from('tradie_details')
        .update(updates)
        .eq('profile_id', user.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('tradie_details')
        .insert({ ...updates, profile_id: user.id } as TradieDetails);
      error = result.error;
    }

    if (!error) {
      await fetchProfile(user.id);
    }

    return { error };
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      tradieDetails,
      loading,
      signUp,
      signIn,
      signOut,
      updateProfile,
      updateTradieDetails,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
