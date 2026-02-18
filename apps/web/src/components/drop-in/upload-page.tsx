'use client';

import { AlertCircle, Check, DollarSign, Gift, Loader2, MapPin, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface DropInUploadPageProps {
  basePath: string;
}

export function DropInUploadPage({ basePath }: DropInUploadPageProps) {
  const router = useRouter();
  const toast = useToast();
  const returnPath = useMemo(() => (basePath.startsWith('/dashboard') ? 'dashboard' : 'gallery'), [basePath]);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [includeGift, setIncludeGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [locationName, setLocationName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadFee, setUploadFee] = useState<number | null>(null);
  const [giftFee, setGiftFee] = useState<number | null>(null);
  const [currency, setCurrency] = useState('USD');

  useEffect(() => {
    const loadPricing = async () => {
      const response = await fetch('/api/runtime/drop-in/pricing', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Pricing unavailable');
      }

      setUploadFee(Number(data.uploadFee));
      setGiftFee(Number(data.giftFee));
      setCurrency(String(data.currency || 'USD'));
    };

    void loadPricing().catch((error: Error) => {
      toast.error('Pricing unavailable', error.message);
    });
  }, [toast]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(selectedFile);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.heic'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const handleUpload = async () => {
    if (!file) {
      toast.error('No file selected', 'Please select a photo to upload');
      return;
    }

    if (includeGift && giftMessage.length > 200) {
      toast.error('Message too long', 'Gift message must be 200 characters or less');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('photo', file);
      formData.append('returnPath', returnPath);

      if (includeGift) {
        formData.append('includeGift', 'true');
        formData.append('giftMessage', giftMessage);
      }

      if (locationName) {
        formData.append('locationName', locationName);
      }

      const response = await fetch('/api/drop-in/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      toast.success('Upload successful', 'Your drop-in photo has been uploaded');
      router.push(basePath);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Upload failed', error.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const effectiveUploadFee = uploadFee ?? 0;
  const effectiveGiftFee = giftFee ?? 0;
  const totalCost = includeGift ? effectiveUploadFee + effectiveGiftFee : effectiveUploadFee;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Upload Drop-In Photo</h1>
        <p className="mt-2 text-secondary">
          Share a photo of someone you saw. If they are on Ferchr, we will notify them.
        </p>
      </div>

      <div
        {...getRootProps()}
        className={cn(
          'cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-colors',
          isDragActive ? 'border-accent bg-accent/5' : 'border-border bg-muted/30',
          file && 'border-accent bg-accent/5'
        )}
      >
        <input {...getInputProps()} />

        {preview ? (
          <div className="space-y-4">
            <img src={preview} alt="Preview" className="mx-auto max-h-96 rounded-xl object-contain" />
            <div className="flex items-center justify-center gap-2">
              <Check className="h-5 w-5 text-success" />
              <span className="text-sm text-foreground">Photo selected</span>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setFile(null);
                  setPreview(null);
                }}
                className="ml-4 text-destructive hover:text-destructive/80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Upload className="mx-auto h-12 w-12 text-accent" />
            <div>
              <p className="text-lg font-medium text-foreground">
                {isDragActive ? 'Drop photo here' : 'Drag and drop or click to select'}
              </p>
              <p className="mt-1 text-sm text-secondary">JPEG, PNG, WebP, or HEIC (max 10MB)</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <Gift className="h-5 w-5 text-accent" />
              Gift Access + Message
            </h3>
            <p className="mt-1 text-sm text-secondary">
              Pay extra to cover recipient access fee and send a message
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={includeGift}
              onChange={(event) => setIncludeGift(event.target.checked)}
              className="peer sr-only"
            />
            <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-accent peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent peer-checked:after:translate-x-full after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-['']" />
          </label>
        </div>

        {includeGift && (
          <div className="space-y-2 border-t border-border pt-4">
            <label className="block text-sm font-medium text-foreground">
              Message (optional, max 200 characters)
            </label>
            <textarea
              value={giftMessage}
              onChange={(event) => setGiftMessage(event.target.value)}
              placeholder="Add a message for the recipient..."
              maxLength={200}
              rows={3}
              className="w-full rounded-xl border border-border bg-background px-4 py-2 text-foreground placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="text-right text-xs text-secondary">{giftMessage.length}/200 characters</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <label className="mb-2 block text-sm font-medium text-foreground">
          <MapPin className="mr-2 inline h-4 w-4" />
          Location (optional)
        </label>
        <Input
          value={locationName}
          onChange={(event) => setLocationName(event.target.value)}
          placeholder="e.g., Central Park, New York"
          className="w-full"
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
          <DollarSign className="h-5 w-5 text-accent" />
          Pricing Summary
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-secondary">Upload Fee</span>
            <span className="text-foreground">
              {currency} {effectiveUploadFee.toFixed(2)}
            </span>
          </div>
          {includeGift && (
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Gift Access + Message</span>
              <span className="text-foreground">
                {currency} {effectiveGiftFee.toFixed(2)}
              </span>
            </div>
          )}
          <div className="mt-2 border-t border-border pt-2">
            <div className="flex justify-between font-semibold">
              <span className="text-foreground">Total</span>
              <span className="text-accent">
                {currency} {totalCost.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-muted/50 p-6">
        <div className="flex gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
          <div className="space-y-2 text-sm text-secondary">
            <p>
              <strong className="text-foreground">How it works:</strong>
            </p>
            <ul className="ml-2 list-inside list-disc space-y-1">
              <li>Upload a photo of someone (they do not need to be in your contacts)</li>
              <li>
                Pay {currency} {effectiveUploadFee.toFixed(2)} to make it discoverable by premium users
              </li>
              {includeGift && (
                <li>
                  Pay an additional {currency} {effectiveGiftFee.toFixed(2)} to cover their access fee and unlock your message
                </li>
              )}
              <li>We use face recognition to find them and send a notification</li>
              <li>If no match is found within 7 days, you get a full refund</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <Button onClick={() => router.push(basePath)} variant="outline" className="flex-1">
          Cancel
        </Button>
        <Button
          onClick={handleUpload}
          disabled={!file || uploading || uploadFee === null || giftFee === null}
          className="flex-1"
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>Continue to Payment ({currency} {totalCost.toFixed(2)})</>
          )}
        </Button>
      </div>
    </div>
  );
}
