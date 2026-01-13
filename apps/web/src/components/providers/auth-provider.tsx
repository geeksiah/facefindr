'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/hooks/use-auth-store';

interface AuthProviderProps {
  children: React.ReactNode;
}

// Suppress AbortError globally for Supabase auth
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    // Suppress AbortError from Supabase
    if (
      args[0]?.name === 'AbortError' ||
      (typeof args[0] === 'string' && args[0].includes('AbortError')) ||
      (args[0] instanceof Error && args[0].name === 'AbortError')
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const { setUser, setLoading, clearAuth } = useAuthStore();
  const initialized = useRef(false);
  const supabaseRef = useRef(createClient());

  const fetchProfile = useCallback(async (userId: string, userType: string | undefined) => {
    const supabase = supabaseRef.current;
    
    if (userType === 'photographer') {
      const { data } = await supabase
        .from('photographers')
        .select('*')
        .eq('id', userId)
        .single();
      return data;
    } else if (userType === 'attendee') {
      const { data } = await supabase
        .from('attendees')
        .select('*')
        .eq('id', userId)
        .single();
      return data;
    }
    return null;
  }, []);

  useEffect(() => {
    // Prevent double initialization in strict mode
    if (initialized.current) return;
    initialized.current = true;

    const supabase = supabaseRef.current;
    let isMounted = true;

    // Get initial session
    const getSession = async () => {
      setLoading(true);
      
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (!isMounted) return;
        
        if (error || !user) {
          clearAuth();
          return;
        }

        const userType = user.user_metadata?.user_type as 'photographer' | 'attendee' | undefined;
        const profile = await fetchProfile(user.id, userType);

        if (isMounted) {
          setUser({
            ...user,
            userType,
            profile,
          });
        }
      } catch (err: unknown) {
        // Silently ignore AbortError - these happen during navigation/unmount
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        // Silently ignore DOMException AbortError
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error('Auth session error:', err);
        if (isMounted) {
          clearAuth();
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        
        try {
          if (event === 'SIGNED_IN' && session?.user) {
            const userType = session.user.user_metadata?.user_type as 'photographer' | 'attendee' | undefined;
            const profile = await fetchProfile(session.user.id, userType);

            if (isMounted) {
              setUser({
                ...session.user,
                userType,
                profile,
              });
            }
          } else if (event === 'SIGNED_OUT') {
            if (isMounted) {
              clearAuth();
              router.push('/');
            }
          }
          // TOKEN_REFRESHED - no action needed
        } catch (err: unknown) {
          // Silently ignore AbortError
          if (err instanceof Error && err.name === 'AbortError') {
            return;
          }
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          console.error('Auth state change error:', err);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [setUser, setLoading, clearAuth, router, fetchProfile]);

  return <>{children}</>;
}
