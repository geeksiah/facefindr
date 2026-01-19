/**
 * Rate Limiting Utility
 * 
 * Simple in-memory rate limiter for API routes.
 * For production at scale, consider using Redis-based rate limiting.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store (cleared on server restart)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Time window in seconds */
  windowSec: number;
  /** Identifier prefix (e.g., 'auth', 'upload') */
  prefix?: string;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetIn: number;
  limit: number;
}

/**
 * Check if a request should be rate limited
 * 
 * @param identifier - Unique identifier (e.g., IP address, user ID)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const { limit, windowSec, prefix = 'default' } = config;
  const key = `${prefix}:${identifier}`;
  const now = Date.now();
  const windowMs = windowSec * 1000;

  let entry = rateLimitStore.get(key);

  // If no entry or window expired, create new entry
  if (!entry || entry.resetTime < now) {
    entry = {
      count: 1,
      resetTime: now + windowMs,
    };
    rateLimitStore.set(key, entry);
    return {
      success: true,
      remaining: limit - 1,
      resetIn: windowSec,
      limit,
    };
  }

  // Increment count
  entry.count++;
  const remaining = Math.max(0, limit - entry.count);
  const resetIn = Math.ceil((entry.resetTime - now) / 1000);

  if (entry.count > limit) {
    return {
      success: false,
      remaining: 0,
      resetIn,
      limit,
    };
  }

  return {
    success: true,
    remaining,
    resetIn,
    limit,
  };
}

/**
 * Get client IP from request headers
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  // Fallback - not ideal but prevents null
  return 'unknown';
}

/**
 * Create rate limit headers for response
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.resetIn.toString(),
  };
}

// Pre-configured rate limiters for common use cases
export const rateLimits = {
  // Auth endpoints - strict limits
  auth: { limit: 10, windowSec: 60, prefix: 'auth' } as RateLimitConfig,
  
  // Face operations - expensive, strict limits
  faceOps: { limit: 30, windowSec: 60, prefix: 'face' } as RateLimitConfig,
  
  // Upload operations - moderate limits
  upload: { limit: 60, windowSec: 60, prefix: 'upload' } as RateLimitConfig,
  
  // General API - lenient limits
  api: { limit: 100, windowSec: 60, prefix: 'api' } as RateLimitConfig,
  
  // Search - moderate limits
  search: { limit: 30, windowSec: 60, prefix: 'search' } as RateLimitConfig,
  
  // Webhooks - allow more for payment providers
  webhook: { limit: 200, windowSec: 60, prefix: 'webhook' } as RateLimitConfig,
};
