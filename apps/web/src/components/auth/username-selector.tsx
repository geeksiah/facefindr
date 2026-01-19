'use client';

/**
 * Username Selector Component
 * 
 * Allows users to choose a 4-8 letter username and see the
 * system-generated FaceTag number in real-time.
 * Format: @username1234 (e.g., @amara1234)
 */

import { Check, X, Loader2, AtSign } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { useDebounce } from '@/hooks/use-debounce';

interface UsernameSelectorProps {
  value: string;
  onChange: (username: string) => void;
  onFaceTagChange?: (faceTag: string | null) => void;
  disabled?: boolean;
  className?: string;
}

interface PreviewResult {
  valid: boolean;
  cleanedUsername: string;
  sampleNumber?: number;
  previewTag?: string;
  error?: string;
  isFirstUser?: boolean;
  isRandomized?: boolean;
}

export function UsernameSelector({
  value,
  onChange,
  onFaceTagChange,
  disabled = false,
  className = '',
}: UsernameSelectorProps) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  
  const debouncedUsername = useDebounce(value, 300);

  const fetchPreview = useCallback(async (username: string) => {
    if (!username || username.length < 1) {
      setPreview(null);
      onFaceTagChange?.(null);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/facetag/preview?username=${encodeURIComponent(username)}`);
      const data = await response.json();
      setPreview(data);
      
      if (data.valid && data.previewTag) {
        onFaceTagChange?.(data.previewTag);
      } else {
        onFaceTagChange?.(null);
      }
    } catch (error) {
      console.error('Failed to fetch preview:', error);
      setPreview(null);
      onFaceTagChange?.(null);
    } finally {
      setIsLoading(false);
    }
  }, [onFaceTagChange]);

  useEffect(() => {
    fetchPreview(debouncedUsername);
  }, [debouncedUsername, fetchPreview]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow letters and numbers, limit to 8 chars
    const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    onChange(cleaned);
  };

  const charCount = value.length;
  const startsWithNumber = /^[0-9]/.test(value);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Input Field */}
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
          <AtSign className="h-5 w-5 text-secondary" />
        </div>
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          placeholder="Choose a username"
          className={`w-full rounded-xl border bg-background pl-11 pr-12 py-3.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all duration-200 ${
            preview?.valid 
              ? 'border-green-500/50 focus:border-green-500 focus:ring-green-500/20'
              : preview?.error
                ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20'
                : 'border-border focus:border-accent focus:ring-accent/20'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          {isLoading ? (
            <Loader2 className="h-5 w-5 text-secondary animate-spin" />
          ) : preview?.valid ? (
            <Check className="h-5 w-5 text-green-500" />
          ) : preview?.error ? (
            <X className="h-5 w-5 text-red-500" />
          ) : null}
        </div>
      </div>

      {/* Character Counter */}
      <div className="flex items-center justify-between text-xs">
        <span className={`${
          charCount < 4 ? 'text-secondary' : 
          charCount <= 8 ? 'text-green-500' : 'text-red-500'
        }`}>
          {charCount}/8 characters {charCount < 4 && '(min 4)'}
        </span>
        {startsWithNumber && (
          <span className="text-red-500">Cannot start with a number</span>
        )}
      </div>

      {/* Real-time FaceTag Preview */}
      {(isFocused || preview) && value.length > 0 && (
        <div className={`rounded-xl p-4 transition-all duration-300 ${
          preview?.valid 
            ? 'bg-green-500/10 border border-green-500/20'
            : preview?.error
              ? 'bg-red-500/10 border border-red-500/20'
              : 'bg-muted border border-border'
        }`}>
          {preview?.valid ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-secondary">Your FaceTag will look like:</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-2xl font-bold text-foreground font-mono">
                  @{preview.cleanedUsername}
                </span>
                <span className="text-2xl font-bold text-accent font-mono">
                  {preview.sampleNumber}
                </span>
              </div>
              {preview.isFirstUser ? (
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <Check className="h-3 w-3" />
                  <span>You&apos;ll be the first with this username!</span>
                </div>
              ) : (
                <div className="text-xs text-secondary">
                  A unique random number will be assigned to you
                </div>
              )}
            </div>
          ) : preview?.error ? (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <X className="h-4 w-4 flex-shrink-0" />
              <span>{preview.error}</span>
            </div>
          ) : isLoading ? (
            <div className="flex items-center gap-2 text-sm text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Checking availability...</span>
            </div>
          ) : (
            <div className="text-sm text-secondary">
              Enter at least 4 characters to see your FaceTag
            </div>
          )}
        </div>
      )}

      {/* Help Text */}
      <p className="text-xs text-secondary">
        Your FaceTag is your unique identifier. Choose a memorable username (4-8 letters/numbers) 
        and we&apos;ll add a number to make it unique.
      </p>
    </div>
  );
}
