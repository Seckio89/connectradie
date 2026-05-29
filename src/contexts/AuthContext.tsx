import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react';
import { supabase } from '../lib/supabase';
import { trackEvent, GA_EVENTS } from '../lib/analytics';
import type { Profile, TradieDetails } from '../types/database';

interface SignInResult {
  error: Error | null;
  removed?: boolean;
  selfDeleted?: boolean;
  removalReason?: string;
  removalMessage?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  tradieDetails: TradieDetails | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, phone?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<SignInResult>;
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
  // Prevent onAuthStateChange from setting user while signIn is handling the flow
  const signingInRef = useRef(false);

  const fetchProfile = async (userId: string, retries = 3) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileData) {
      setProfile(profileData as Profile);

      if ((profileData as Profile).role === 'tradie') {
        const { data: tradieData } = await supabase
          .from('tradie_details')
          .select('*')
          .eq('profile_id', userId)
          .maybeSingle();
        setTradieDetails(tradieData as TradieDetails | null);
      }
    } else if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return fetchProfile(userId, retries - 1);
    }
  };

  // Check if a user's profile exists; if not, they were removed
  const checkProfileExists = async (userId: string): Promise<boolean> => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    return !!profileData;
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;

      if (session?.user) {
        // Before setting user state, verify the profile still exists
        const profileExists = await checkProfileExists(session.user.id);
        if (!mounted) return;

        if (!profileExists) {
          // Removed user — clear session, don't set user
          await supabase.auth.signOut();
          if (mounted) setLoading(false);
          return;
        }

        setSession(session);
        setUser(session.user);
        Sentry.setUser({ id: session.user.id, email: session.user.email });
        await fetchProfile(session.user.id);
      }

      if (mounted) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'INITIAL_SESSION') return;

      // When signIn function is handling the flow, skip state updates here
      if (signingInRef.current && event === 'SIGNED_IN') return;

      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        Sentry.setUser(null);
        setProfile(null);
        setTradieDetails(null);
        return;
      }

      // Token refresh just rotates the JWT — user identity and profile haven't changed.
      // Updating user/profile here would invalidate every memoised dep across the app
      // and cascade into refetch loops (and ultimately spurious logouts).
      if (event === 'TOKEN_REFRESHED') {
        setSession(session);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        Sentry.setUser({ id: session.user.id, email: session.user.email });
        (async () => {
          if (mounted) await fetchProfile(session.user.id);
        })();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string, phone?: string) => {
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      }
    });

    // Store phone on the profile if signup succeeded and phone was provided
    if (!error && data.user && phone) {
      await supabase
        .from('profiles')
        .update({ phone })
        .eq('id', data.user.id);
    }

    if (!error) trackEvent(GA_EVENTS.SIGN_UP, { method: 'email' });
    return { error };
  };

  const signIn = async (email: string, password: string): Promise<SignInResult> => {
    // Prevent onAuthStateChange from setting user during our check
    signingInRef.current = true;

    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      signingInRef.current = false;
      return { error };
    }

    // Check if user's profile still exists (removed users have profile deleted)
    const userId = data.user?.id;
    if (userId) {
      const profileExists = await checkProfileExists(userId);

      if (!profileExists) {
        // Profile was deleted — check if self-deleted or admin-removed
        const { data: removal } = await supabase
          .from('account_removals')
          .select('reason, additional_message')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const isSelfDeleted = removal?.reason === 'self_deleted';

        // If self-deleted, clean up the orphaned auth user so they can re-register
        if (isSelfDeleted && data.session?.access_token) {
          try {
            await supabase.functions.invoke('delete-user', {
              headers: { Authorization: `Bearer ${data.session.access_token}` },
            });
          } catch {
            // Best-effort cleanup
          }
        }

        // Sign them out immediately
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setProfile(null);
        setTradieDetails(null);
        signingInRef.current = false;

        return {
          error: null,
          removed: !isSelfDeleted,
          selfDeleted: isSelfDeleted,
          removalReason: removal?.reason || 'Your account has been removed by an administrator.',
          removalMessage: removal?.additional_message || '',
        };
      }
    }

    // Profile exists — allow login, update state
    setUser(data.user);
    setSession(data.session);
    Sentry.setUser({ id: data.user.id, email: data.user.email });
    signingInRef.current = false;

    // Fetch full profile data
    if (userId) await fetchProfile(userId);

    trackEvent(GA_EVENTS.LOGIN, { method: 'email' });
    return { error: null };
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
