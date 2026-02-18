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

  // External crawler providers (Drop-In Find Me external search)
  SERPAPI_KEY?: string;
  TAVILY_API_KEY?: string;
  EXA_API_KEY?: string;
  BING_SEARCH_API_KEY?: string;
  
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
    SERPAPI_KEY: getEnvVar('SERPAPI_KEY'),
    TAVILY_API_KEY: getEnvVar('TAVILY_API_KEY'),
    EXA_API_KEY: getEnvVar('EXA_API_KEY'),
    BING_SEARCH_API_KEY: getEnvVar('BING_SEARCH_API_KEY'),
    NEXT_PUBLIC_APP_URL: getEnvVar('NEXT_PUBLIC_APP_URL'),
  };

  // Warn about missing recommended variables in development
  if (process.env.NODE_ENV !== 'production') {
    const warnings: string[] = [];
    
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      warnings.push('SUPABASE_SERVICE_ROLE_KEY not set - admin operations will fail');
    }
    
    if (!env.STRIPE_SECRET_KEY && !process.env.FLUTTERWAVE_SECRET_KEY && !process.env.PAYPAL_CLIENT_ID && !process.env.PAYSTACK_SECRET_KEY) {
      warnings.push('No payment provider secret key found (Stripe/Flutterwave/PayPal/Paystack) - payments will fail');
    }
    
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
      warnings.push('AWS credentials not set - face recognition will fail');
    }

    if (!env.SERPAPI_KEY && !env.TAVILY_API_KEY && !env.EXA_API_KEY && !env.BING_SEARCH_API_KEY) {
      warnings.push('No external crawler provider key found (SERPAPI/TAVILY/EXA/BING) - Drop-In external search will fail');
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
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  if (typeof window === 'undefined' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return 'http://localhost:3000';
}

export function getAdminAppUrl(): string {
  if (process.env.NEXT_PUBLIC_ADMIN_APP_URL) {
    return process.env.NEXT_PUBLIC_ADMIN_APP_URL;
  }

  if (process.env.ADMIN_APP_URL) {
    return process.env.ADMIN_APP_URL;
  }

  return 'http://localhost:3001';
}

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
