/**
 * QR Code Generation Service
 * 
 * Generates QR codes for event sharing using browser-compatible approach.
 */

// QR code generation options
interface QROptions {
  size?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
  transparent?: boolean;
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
  logo?: string;
}

const DEFAULT_OPTIONS: QROptions = {
  size: 256,
  margin: 4,
  darkColor: '#000000',
  lightColor: '#FFFFFF',
  transparent: false,
  errorCorrection: 'H',
};

/**
 * Get the base URL for the application
 */
export function getBaseUrl(): string {
  // Check for explicitly set app URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  
  // For Vercel deployments
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  // Fallback for development
  return 'http://localhost:3000';
}

/**
 * Generate a QR code as a URL
 * Uses a third-party API for generation (can be replaced with local library)
 */
export async function generateQRCode(
  data: string,
  options: QROptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const baseUrl = getBaseUrl();
  const logoUrl = `${baseUrl}/assets/logos/qr-logo.svg`;
  
  // Use QR Server API (free, no authentication required)
  // Always include logo in center
  const params = new URLSearchParams({
    data: data,
    size: `${opts.size}x${opts.size}`,
    margin: String(opts.margin),
    color: opts.darkColor?.replace('#', '') || '000000',
    ecc: opts.errorCorrection || 'H', // High error correction for logo overlay
    format: 'png',
    qzone: '4',
    logo: logoUrl,
    logosize: '20%',
  });
  
  // Only add bgcolor if not transparent
  if (!opts.transparent) {
    params.set('bgcolor', opts.lightColor?.replace('#', '') || 'FFFFFF');
  }
  
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
  
  return qrUrl;
}

/**
 * Generate a transparent QR code (for download) with logo in center
 */
export async function generateTransparentQRCode(
  data: string,
  size: number = 512
): Promise<string> {
  // Get base URL for logo
  const baseUrl = getBaseUrl();
  const logoUrl = `${baseUrl}/assets/logos/qr-logo.svg`;
  
  // Use SVG format which supports transparency better
  const params = new URLSearchParams({
    data: data,
    size: `${size}x${size}`,
    margin: '4',
    color: '000000',
    format: 'svg',
    qzone: '4',
    ecc: 'H', // High error correction for logo overlay
    logo: logoUrl,
    logosize: '20%',
  });
  
  return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
}

/**
 * Generate QR code with custom styling for Ferchr branding
 * Always includes logo in center
 */
export async function generateBrandedQRCode(
  eventUrl: string,
  options: {
    size?: number;
    theme?: 'light' | 'dark';
    includeLogo?: boolean;
  } = {}
): Promise<{ url: string; downloadUrl: string }> {
  const { size = 512, theme = 'light', includeLogo = true } = options;
  
  const darkColor = theme === 'dark' ? '#FFFFFF' : '#1A1A1A';
  const lightColor = theme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  
  const qrUrl = await generateQRCode(eventUrl, {
    size,
    margin: 3,
    darkColor,
    lightColor,
    errorCorrection: 'H', // High error correction for logo overlay
    logo: includeLogo ? undefined : undefined, // Logo is always included in generateQRCode
  });
  
  // Return both display and download URLs
  return {
    url: qrUrl,
    downloadUrl: qrUrl.replace('format=png', 'format=png&download=1'),
  };
}

/**
 * Generate event sharing URLs
 */
export function generateEventUrls(
  eventSlug: string,
  shortLink?: string,
  accessCode?: string
): {
  directUrl: string;
  shortUrl: string;
  embedUrl: string;
  scanUrl: string;
} {
  const baseUrl = getBaseUrl();
  
  const directUrl = `${baseUrl}/e/${eventSlug}`;
  const shortUrl = shortLink
    ? /^https?:\/\//i.test(shortLink)
      ? shortLink
      : `${baseUrl}/s/${shortLink}`
    : directUrl;
  const embedUrl = `${baseUrl}/embed/${eventSlug}`;
  const scanUrl = `${baseUrl}/e/${eventSlug}/scan`;
  
  // Append access code if required
  const withCode = (url: string) => 
    accessCode ? `${url}?code=${accessCode}` : url;
  
  return {
    directUrl: withCode(directUrl),
    shortUrl: withCode(shortUrl),
    embedUrl,
    scanUrl: withCode(scanUrl),
  };
}

/**
 * Shorten a URL using TinyURL API (free, no auth required)
 */
export async function shortenUrl(longUrl: string): Promise<string> {
  try {
    const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
    
    if (!response.ok) {
      throw new Error('Failed to shorten URL');
    }
    
    const shortUrl = await response.text();
    return shortUrl;
  } catch (error) {
    console.error('URL shortening error:', error);
    // Return original URL if shortening fails
    return longUrl;
  }
}

/**
 * Generate embed code for websites
 */
export function generateEmbedCode(
  eventSlug: string,
  options: {
    type?: 'gallery' | 'scanner' | 'button';
    theme?: 'light' | 'dark' | 'auto';
    width?: string;
    height?: string;
    primaryColor?: string;
  } = {}
): string {
  const {
    type = 'gallery',
    theme = 'auto',
    width = '100%',
    height = 'auto',
    primaryColor = '#0A84FF',
  } = options;
  
  const baseUrl = getBaseUrl();
  const embedUrl = `${baseUrl}/embed/${eventSlug}?type=${type}&theme=${theme}&color=${encodeURIComponent(primaryColor)}`;
  
  if (type === 'button') {
    return `<a href="${baseUrl}/e/${eventSlug}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:${primaryColor};color:white;border-radius:12px;text-decoration:none;font-family:system-ui,-apple-system,sans-serif;font-weight:500;">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="8" r="4"/><path d="M5.5 21a7.5 7.5 0 0115 0"/>
  </svg>
  Find Your Photos
</a>`;
  }
  
  return `<iframe 
  src="${embedUrl}" 
  width="${width}" 
  height="${height === 'auto' ? '500' : height}" 
  frameborder="0" 
  allow="camera" 
  style="border-radius:12px;overflow:hidden;max-width:100%;"
  loading="lazy"
  title="Ferchr Event Gallery"
></iframe>`;
}

/**
 * Generate social share URLs
 */
export function generateSocialShareUrls(
  eventUrl: string,
  eventName: string,
  photographerName?: string
): {
  twitter: string;
  facebook: string;
  linkedin: string;
  whatsapp: string;
  email: string;
  copy: string;
} {
  const text = photographerName
    ? `Find your photos from "${eventName}" by ${photographerName} on Ferchr`
    : `Find your photos from "${eventName}" on Ferchr`;
  
  const encodedUrl = encodeURIComponent(eventUrl);
  const encodedText = encodeURIComponent(text);
  
  return {
    twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    email: `mailto:?subject=${encodeURIComponent(`Photos from ${eventName}`)}&body=${encodedText}%20${encodedUrl}`,
    copy: eventUrl,
  };
}
