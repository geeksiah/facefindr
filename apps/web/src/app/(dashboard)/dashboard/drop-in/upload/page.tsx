'use client';

/**
 * Drop-In Photo Upload Page
 * 
 * Allows users to upload photos of people outside their contacts
 */

import {
  Upload,
  X,
  MapPin,
  MessageSquare,
  Loader2,
  Check,
  AlertCircle,
  Gift,
  DollarSign,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const DROP_IN_UPLOAD_FEE = 2.99;
const DROP_IN_GIFT_FEE = 4.99;

export default function DropInUploadPage() {
  const router = useRouter();
  const toast = useToast();
  
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [includeGift, setIncludeGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [locationName, setLocationName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(selectedFile);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.heic'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
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
        setCheckoutUrl(data.checkoutUrl);
        // Redirect to Stripe checkout
        window.location.href = data.checkoutUrl;
      } else {
        toast.success('Upload successful', 'Your drop-in photo has been uploaded');
        router.push('/dashboard/drop-in');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Upload failed', error.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const totalCost = includeGift 
    ? DROP_IN_UPLOAD_FEE + DROP_IN_GIFT_FEE 
    : DROP_IN_UPLOAD_FEE;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Upload Drop-In Photo</h1>
        <p className="mt-2 text-secondary">
          Share a photo of someone you saw. If they're on FaceFindr, we'll notify them!
        </p>
      </div>

      {/* Upload Area */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors',
          isDragActive ? 'border-accent bg-accent/5' : 'border-border bg-muted/30',
          file && 'border-accent bg-accent/5'
        )}
      >
        <input {...getInputProps()} />
        
        {preview ? (
          <div className="space-y-4">
            <img
              src={preview}
              alt="Preview"
              className="max-h-96 mx-auto rounded-xl object-contain"
            />
            <div className="flex items-center justify-center gap-2">
              <Check className="h-5 w-5 text-success" />
              <span className="text-sm text-foreground">Photo selected</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
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
            <Upload className="h-12 w-12 text-accent mx-auto" />
            <div>
              <p className="text-lg font-medium text-foreground">
                {isDragActive ? 'Drop photo here' : 'Drag & drop or click to select'}
              </p>
              <p className="text-sm text-secondary mt-1">
                JPEG, PNG, WebP, or HEIC (max 10MB)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Gift Options */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Gift className="h-5 w-5 text-accent" />
              Gift Access + Message
            </h3>
            <p className="text-sm text-secondary mt-1">
              Pay extra to cover recipient's access fee and send a message
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={includeGift}
              onChange={(e) => setIncludeGift(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </label>
        </div>

        {includeGift && (
          <div className="space-y-2 pt-4 border-t border-border">
            <label className="block text-sm font-medium text-foreground">
              Message (optional, max 200 characters)
            </label>
            <textarea
              value={giftMessage}
              onChange={(e) => setGiftMessage(e.target.value)}
              placeholder="Add a message for the recipient..."
              maxLength={200}
              rows={3}
              className="w-full px-4 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="text-xs text-secondary text-right">
              {giftMessage.length}/200 characters
            </p>
          </div>
        )}
      </div>

      {/* Location (Optional) */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <label className="block text-sm font-medium text-foreground mb-2">
          <MapPin className="h-4 w-4 inline mr-2" />
          Location (optional)
        </label>
        <Input
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          placeholder="e.g., Central Park, New York"
          className="w-full"
        />
      </div>

      {/* Pricing Summary */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-accent" />
          Pricing Summary
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-secondary">Upload Fee</span>
            <span className="text-foreground">${DROP_IN_UPLOAD_FEE.toFixed(2)}</span>
          </div>
          {includeGift && (
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Gift Access + Message</span>
              <span className="text-foreground">${DROP_IN_GIFT_FEE.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t border-border pt-2 mt-2">
            <div className="flex justify-between font-semibold">
              <span className="text-foreground">Total</span>
              <span className="text-accent">${totalCost.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="rounded-2xl border border-border bg-muted/50 p-6">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
          <div className="space-y-2 text-sm text-secondary">
            <p>
              <strong className="text-foreground">How it works:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Upload a photo of someone (they don't need to be in your contacts)</li>
              <li>Pay ${DROP_IN_UPLOAD_FEE} to make it discoverable by premium users</li>
              {includeGift && (
                <li>
                  Pay an additional ${DROP_IN_GIFT_FEE} to cover their access fee and unlock your message
                </li>
              )}
              <li>We'll use face recognition to find them and send a notification</li>
              <li>If no match is found within 7 days, you'll get a full refund</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Upload Button */}
      <div className="flex gap-4">
        <Button
          onClick={() => router.back()}
          variant="outline"
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="flex-1"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              Continue to Payment (${totalCost.toFixed(2)})
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
