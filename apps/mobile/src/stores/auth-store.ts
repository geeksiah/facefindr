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
  faceTag: string | null;
  profilePhotoUrl: string | null;
  userType: 'photographer' | 'attendee';
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isInitialized: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, userType: 'photographer' | 'attendee', displayName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,

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
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async (email, password, userType, displayName) => {
    set({ isLoading: true });
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            user_type: userType,
            display_name: displayName,
          },
        },
      });
      if (error) {
        return { error: error.message };
      }
      return { error: null };
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null });
  },

  refreshProfile: async () => {
    const { session } = get();
    if (!session?.user) return;

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
          faceTag: profile.face_tag,
          profilePhotoUrl: profile.profile_photo_url,
          userType,
        },
      });
    }
  },
}));
