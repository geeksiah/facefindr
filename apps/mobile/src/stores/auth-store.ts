/**
 * Auth Store
 * 
 * Manages authentication state using Zustand.
 */

import { create } from 'zustand';
import { supabase, Session, User } from '@/lib/supabase';

interface Profile {
  id: string;
  displayName: string;
  email: string;
  username: string | null;
  faceTag: string | null;
  profilePhotoUrl: string | null;
  userType: 'photographer' | 'attendee';
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  userType: 'photographer' | 'attendee' | null;
  isLoading: boolean;
  isInitialized: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, userType: 'photographer' | 'attendee', displayName: string, username?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,
  
  // Computed getters
  get isAuthenticated() {
    return !!get().session?.user;
  },
  get userType() {
    return get().profile?.userType || null;
  },

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        const userType = session.user.user_metadata?.user_type || 'attendee';
        const table = userType === 'photographer' ? 'photographers' : 'attendees';
        
        const { data: profile } = await supabase
          .from(table)
          .select('*')
          .eq('id', session.user.id)
          .single();

        set({
          session,
          user: session.user,
          profile: profile ? {
            id: profile.id,
            displayName: profile.display_name || 'User',
            email: session.user.email || '',
            username: profile.username,
            faceTag: profile.face_tag,
            profilePhotoUrl: profile.profile_photo_url,
            userType,
          } : null,
        });
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
          set({ session: null, user: null, profile: null });
          // Navigation is handled by Root Layout based on state changes
        } else if (session?.user) {
          const userType = session.user.user_metadata?.user_type || 'attendee';
          const table = userType === 'photographer' ? 'photographers' : 'attendees';
          
          const { data: profile } = await supabase
            .from(table)
            .select('*')
            .eq('id', session.user.id)
            .single();

          set({
            session,
            user: session.user,
            profile: profile ? {
              id: profile.id,
              displayName: profile.display_name || 'User',
              email: session.user.email || '',
              username: profile.username,
              faceTag: profile.face_tag,
              profilePhotoUrl: profile.profile_photo_url,
              userType,
            } : null,
          });
        }
      });
    } catch (error) {
      console.error('Auth initialization error:', error);
    } finally {
      set({ isLoading: false, isInitialized: true });
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true });
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { error: error.message };
      }
      await get().refreshProfile();
      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Sign in failed' };
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async (email, password, userType, displayName, username) => {
    set({ isLoading: true });
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            user_type: userType,
            display_name: displayName,
            username: username, // Stored in user_metadata, used by trigger to generate FaceTag
          },
        },
      });
      if (error) {
        return { error: error.message };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Sign up failed' };
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    try {
      set({ isLoading: true });
      await supabase.auth.signOut();
      // Clear local state - navigation is handled by Root Layout
      set({ session: null, user: null, profile: null, isLoading: false });
    } catch (error) {
      console.error('Sign out error:', error);
      // Still clear local state even if signout fails
      set({ session: null, user: null, profile: null, isLoading: false });
    }
  },

  refreshProfile: async () => {
    const { session } = get();
    if (!session?.user) return;

    try {
      const userType = session.user.user_metadata?.user_type || 'attendee';
      const table = userType === 'photographer' ? 'photographers' : 'attendees';
      
      const { data: profile } = await supabase
        .from(table)
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profile) {
        set({
          profile: {
            id: profile.id,
            displayName: profile.display_name || 'User',
            email: session.user.email || '',
            username: profile.username,
            faceTag: profile.face_tag,
            profilePhotoUrl: profile.profile_photo_url,
            userType,
          },
        });
      }
    } catch (error) {
      console.error('Refresh profile error:', error);
    }
  },
}));
