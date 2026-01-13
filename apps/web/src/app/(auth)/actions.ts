'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type LoginInput,
  type RegisterInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from '@/lib/validations/auth';

// ============================================
// HELPER FUNCTION FOR GENERATING FACE TAG
// ============================================

function generateFaceTag(displayName: string): { faceTag: string; suffix: string } {
  // Generate a 4-digit random suffix
  const suffix = Math.floor(1000 + Math.random() * 9000).toString();
  
  // Clean the display name: lowercase, remove spaces and special chars
  const cleanName = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20);
  
  // Format: @username.1234 (using dot separator for cleaner look)
  const faceTag = `@${cleanName}.${suffix}`;
  
  return { faceTag, suffix };
}

// ============================================
// LOGIN ACTION
// ============================================

export async function login(formData: LoginInput) {
  const validated = loginSchema.safeParse(formData);
  
  if (!validated.success) {
    return {
      error: validated.error.errors[0]?.message || 'Invalid input',
    };
  }

  const supabase = createClient();
  
  const { error } = await supabase.auth.signInWithPassword({
    email: validated.data.email,
    password: validated.data.password,
  });

  if (error) {
    return {
      error: error.message === 'Invalid login credentials' 
        ? 'Invalid email or password' 
        : error.message,
    };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

// ============================================
// REGISTER ACTION
// ============================================

export async function register(formData: RegisterInput) {
  const validated = registerSchema.safeParse(formData);
  
  if (!validated.success) {
    return {
      error: validated.error.errors[0]?.message || 'Invalid input',
    };
  }

  const supabase = createClient();
  const serviceClient = createServiceClient();
  
  // Sign up the user with Supabase Auth
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: validated.data.email,
    password: validated.data.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      data: {
        display_name: validated.data.displayName,
        user_type: validated.data.userType,
      },
    },
  });

  if (signUpError) {
    if (signUpError.message.includes('already registered')) {
      return { error: 'An account with this email already exists' };
    }
    return { error: signUpError.message };
  }

  if (!authData.user) {
    return { error: 'Failed to create account' };
  }

  // Create the profile in the appropriate table
  if (validated.data.userType === 'photographer') {
    const { error: profileError } = await serviceClient
      .from('photographers')
      .insert({
        id: authData.user.id,
        email: validated.data.email,
        display_name: validated.data.displayName,
        status: 'pending_verification',
        email_verified: false,
      });

    if (profileError) {
      console.error('Failed to create photographer profile:', profileError);
      // Don't return error - user is created, profile will be created on verification
    }

    // Create a free subscription for the photographer
    await serviceClient.from('subscriptions').insert({
      photographer_id: authData.user.id,
      plan_code: 'free',
      status: 'active',
    });
  } else {
    // Generate FaceTag for attendee
    const { faceTag, suffix } = generateFaceTag(validated.data.displayName);
    
    const { error: profileError } = await serviceClient
      .from('attendees')
      .insert({
        id: authData.user.id,
        email: validated.data.email,
        display_name: validated.data.displayName,
        face_tag: faceTag,
        face_tag_suffix: suffix,
        status: 'active',
        email_verified: false,
      });

    if (profileError) {
      console.error('Failed to create attendee profile:', profileError);
    }
  }

  return {
    success: true,
    message: 'Please check your email to verify your account',
  };
}

// ============================================
// FORGOT PASSWORD ACTION
// ============================================

export async function forgotPassword(formData: ForgotPasswordInput) {
  const validated = forgotPasswordSchema.safeParse(formData);
  
  if (!validated.success) {
    return {
      error: validated.error.errors[0]?.message || 'Invalid input',
    };
  }

  const supabase = createClient();
  
  const { error } = await supabase.auth.resetPasswordForEmail(validated.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  return {
    success: true,
    message: 'If an account exists with this email, you will receive a password reset link',
  };
}

// ============================================
// RESET PASSWORD ACTION
// ============================================

export async function resetPassword(formData: ResetPasswordInput) {
  const validated = resetPasswordSchema.safeParse(formData);
  
  if (!validated.success) {
    return {
      error: validated.error.errors[0]?.message || 'Invalid input',
    };
  }

  const supabase = createClient();
  
  const { error } = await supabase.auth.updateUser({
    password: validated.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/', 'layout');
  redirect('/login?message=Password updated successfully');
}

// ============================================
// LOGOUT ACTION
// ============================================

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}

// ============================================
// GET CURRENT USER ACTION
// ============================================

export async function getCurrentUser() {
  const supabase = createClient();
  
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return null;
  }

  // Get user metadata to determine type
  const userType = user.user_metadata?.user_type as 'photographer' | 'attendee' | undefined;
  
  // Fetch profile based on user type
  if (userType === 'photographer') {
    const { data: profile } = await supabase
      .from('photographers')
      .select('*')
      .eq('id', user.id)
      .single();
    
    return {
      ...user,
      userType: 'photographer' as const,
      profile,
    };
  } else if (userType === 'attendee') {
    const { data: profile } = await supabase
      .from('attendees')
      .select('*')
      .eq('id', user.id)
      .single();
    
    return {
      ...user,
      userType: 'attendee' as const,
      profile,
    };
  }

  return {
    ...user,
    userType: undefined,
    profile: null,
  };
}
