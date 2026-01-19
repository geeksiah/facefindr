/**
 * Environment Variable Validation
 * 
 * Validates required environment variables at build/startup time.
 * Import this at the top of layout.tsx to fail fast on missing config.
 */

interface EnvConfig {
  // Required for Supabase
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  
  // Required for server-side Supabase operations
  SUPABASE_SERVICE_ROLE_KEY?: string;
  
  // Payment providers (at least one should be configured)
  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  
  // AWS for face recognition
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  
  // App URL
  NEXT_PUBLIC_APP_URL?: string;
}

function getEnvVar(name: string, required = false): string | undefined {
  const value = process.env[name];
  
  if (required && !value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Please add it to your .env.local file.`
    );
  }
  
  return value;
}

export function validateEnv(): EnvConfig {
  // Only validate in server context
  if (typeof window !== 'undefined') {
    return {} as EnvConfig;
  }

  const env: EnvConfig = {
    // Required
    NEXT_PUBLIC_SUPABASE_URL: getEnvVar('NEXT_PUBLIC_SUPABASE_URL', true)!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY', true)!,
    
    // Optional but recommended
    SUPABASE_SERVICE_ROLE_KEY: getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
    STRIPE_SECRET_KEY: getEnvVar('STRIPE_SECRET_KEY'),
    STRIPE_PUBLISHABLE_KEY: getEnvVar('STRIPE_PUBLISHABLE_KEY'),
    STRIPE_WEBHOOK_SECRET: getEnvVar('STRIPE_WEBHOOK_SECRET'),
    AWS_ACCESS_KEY_ID: getEnvVar('AWS_ACCESS_KEY_ID'),
    AWS_SECRET_ACCESS_KEY: getEnvVar('AWS_SECRET_ACCESS_KEY'),
    AWS_REGION: getEnvVar('AWS_REGION'),
    NEXT_PUBLIC_APP_URL: getEnvVar('NEXT_PUBLIC_APP_URL'),
  };

  // Warn about missing recommended variables in development
  if (process.env.NODE_ENV !== 'production') {
    const warnings: string[] = [];
    
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      warnings.push('SUPABASE_SERVICE_ROLE_KEY not set - admin operations will fail');
    }
    
    if (!env.STRIPE_SECRET_KEY) {
      warnings.push('STRIPE_SECRET_KEY not set - payments will fail');
    }
    
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
      warnings.push('AWS credentials not set - face recognition will fail');
    }
    
    if (warnings.length > 0) {
      console.warn('[ENV] Missing recommended environment variables:');
      warnings.forEach(w => console.warn('  - ' + w));
    }
  }

  return env;
}

// Export validated env for use throughout the app
export const env = validateEnv();

// Type-safe getters for commonly used env vars
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
