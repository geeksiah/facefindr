/**
 * Admin Authentication System
 * 
 * Uses JWT tokens stored in HTTP-only cookies
 * Completely separate from Supabase Auth
 */

import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

import { getAdminJwtSecretBytes } from './jwt-secret';
import { supabaseAdmin, AdminUser, AdminRole } from './supabase';

const JWT_SECRET = getAdminJwtSecretBytes();
const COOKIE_NAME = 'admin_session';
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

export interface AdminSession {
  adminId: string;
  email: string;
  name: string;
  role: AdminRole;
  exp: number;
}

// Hash password using bcrypt
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Verify password against hash
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Create JWT token
async function createToken(admin: AdminUser): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + (8 * 60 * 60); // 8 hours
  
  return new SignJWT({
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(exp)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

// Verify JWT token
async function verifyToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as AdminSession;
  } catch {
    return null;
  }
}

// Login admin
export async function loginAdmin(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; error?: string; admin?: AdminUser }> {
  try {
    // Get admin user
    const { data: admin, error } = await supabaseAdmin
      .from('admin_users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error) {
      console.error('Database error during login:', error.message);
      
      // Check if it's a table not found error
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        return { success: false, error: 'Admin system not initialized. Run database migrations first.' };
      }
      
      // Log failed attempt (may also fail if table doesn't exist)
      try {
        await supabaseAdmin.from('admin_audit_logs').insert({
          action: 'login',
          details: { success: false, reason: 'user_not_found', email },
          ip_address: ipAddress,
          user_agent: userAgent,
        });
      } catch (logError) {
        console.error('Could not log failed attempt:', logError);
      }
      return { success: false, error: 'Invalid credentials' };
    }
    
    if (!admin) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Check if account is locked
    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
      return { success: false, error: 'Account is temporarily locked. Try again later.' };
    }

    // Check if account is active
    if (!admin.is_active) {
      return { success: false, error: 'Account is deactivated' };
    }

    // Verify password
    const isValid = await verifyPassword(password, admin.password_hash);
    
    if (!isValid) {
      // Increment failed attempts
      const newAttempts = (admin.failed_login_attempts || 0) + 1;
      const lockUntil = newAttempts >= 5 
        ? new Date(Date.now() + 15 * 60 * 1000).toISOString() // Lock for 15 minutes
        : null;

      await supabaseAdmin
        .from('admin_users')
        .update({ 
          failed_login_attempts: newAttempts,
          locked_until: lockUntil,
        })
        .eq('id', admin.id);

      // Log failed attempt
      await supabaseAdmin.from('admin_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        action: 'login',
        details: { success: false, reason: 'invalid_password', attempts: newAttempts },
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      return { success: false, error: 'Invalid credentials' };
    }

    // Create session token
    const token = await createToken(admin);
    const tokenHash = await bcrypt.hash(token, 6); // Quick hash for lookup

    // Store session
    await supabaseAdmin.from('admin_sessions').insert({
      admin_id: admin.id,
      token_hash: tokenHash,
      ip_address: ipAddress,
      user_agent: userAgent,
      expires_at: new Date(Date.now() + SESSION_DURATION).toISOString(),
    });

    // Reset failed attempts and update last login
    await supabaseAdmin
      .from('admin_users')
      .update({ 
        failed_login_attempts: 0,
        locked_until: null,
        last_login: new Date().toISOString(),
      })
      .eq('id', admin.id);

    // Log successful login
    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: admin.id,
      admin_email: admin.email,
      action: 'login',
      details: { success: true },
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_DURATION / 1000,
      path: '/',
    });

    return { 
      success: true, 
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        is_active: admin.is_active,
        last_login: admin.last_login,
        created_at: admin.created_at,
      },
    };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'An error occurred during login' };
  }
}

// Get current admin session
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    
    if (!token) return null;
    
    const session = await verifyToken(token);
    
    if (!session) return null;
    
    // Verify admin still exists and is active
    const { data: admin } = await supabaseAdmin
      .from('admin_users')
      .select('id, is_active')
      .eq('id', session.adminId)
      .single();
    
    if (!admin || !admin.is_active) return null;
    
    return session;
  } catch {
    return null;
  }
}

// Check if admin has specific permission
export async function hasPermission(permission: string): Promise<boolean> {
  const session = await getAdminSession();
  if (!session) return false;
  
  const { data } = await supabaseAdmin
    .from('admin_permissions')
    .select('permission')
    .eq('role', session.role)
    .eq('permission', permission)
    .single();
  
  return !!data;
}

// Logout admin
export async function logoutAdmin(): Promise<void> {
  const session = await getAdminSession();
  
  if (session) {
    // Log logout
    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: session.adminId,
      admin_email: session.email,
      action: 'logout',
      details: {},
    });
  }
  
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// Log admin action
export async function logAction(
  action: string,
  resourceType?: string,
  resourceId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  const session = await getAdminSession();
  if (!session) return;
  
  await supabaseAdmin.from('admin_audit_logs').insert({
    admin_id: session.adminId,
    admin_email: session.email,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    details: details || {},
  });
}
