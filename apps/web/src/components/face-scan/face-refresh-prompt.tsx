'use client';

import { AlertTriangle, Camera, CheckCircle, RefreshCw, X, ChevronDown } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';

interface RefreshStatus {
  needsRefresh: boolean;
  reason: string | null;
  promptStrength: 'required' | 'strong' | 'soft' | 'none';
  confidenceAverage: number;
  daysSinceRefresh: number;
  nextDueDate: string | null;
  pendingPrompt: {
    id: string;
    prompt_type: string;
    trigger_reason: string;
  } | null;
  embeddingCount: number;
}

interface FaceRefreshPromptProps {
  onRefresh?: () => void;
  onDismiss?: () => void;
  showInline?: boolean;
}

const APPEARANCE_CHANGES = [
  { value: 'new_hairstyle', label: 'New hairstyle' },
  { value: 'facial_hair', label: 'Facial hair change' },
  { value: 'new_glasses', label: 'New glasses' },
  { value: 'weight_change', label: 'Weight change' },
  { value: 'aging', label: 'General aging' },
  { value: 'other', label: 'Other change' },
];

export function FaceRefreshPrompt({ onRefresh, onDismiss, showInline = false }: FaceRefreshPromptProps) {
  const [status, setStatus] = useState<RefreshStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [isResponding, setIsResponding] = useState(false);

  useEffect(() => {
    checkRefreshStatus();
  }, []);

  const checkRefreshStatus = async () => {
    try {
      const response = await fetch('/api/faces/refresh-status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        
        // Auto-show dialog for required or strong prompts
        if (data.needsRefresh && ['required', 'strong'].includes(data.promptStrength)) {
          setShowDialog(true);
        }
      }
    } catch (error) {
      console.error('Failed to check refresh status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResponse = async (response: 'these_are_me' | 'not_me' | 'dismissed') => {
    if (!status?.pendingPrompt) return;
    
    setIsResponding(true);
    try {
      await fetch('/api/faces/refresh', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptId: status.pendingPrompt.id,
          response,
        }),
      });
      
      setShowDialog(false);
      onDismiss?.();
      
      // Refresh status
      await checkRefreshStatus();
    } catch (error) {
      console.error('Failed to respond:', error);
    } finally {
      setIsResponding(false);
    }
  };

  const handleAppearanceChange = async (changeType: string) => {
    try {
      await fetch('/api/faces/appearance-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changeType,
          changeMode: 'add_to_profile',
        }),
      });
      
      // Navigate to face scan
      onRefresh?.();
    } catch (error) {
      console.error('Failed to log appearance change:', error);
    }
  };

  if (isLoading || !status?.needsRefresh) {
    return null;
  }

  const getPromptContent = () => {
    switch (status.reason) {
      case 'confidence_low':
        return {
          icon: <AlertTriangle className="h-6 w-6 text-amber-500" />,
          title: 'Update Your Photo',
          description: `Your photo matching accuracy has dropped to ${status.confidenceAverage.toFixed(0)}%. Update your profile photo for better results.`,
        };
      case 'time_based':
        return {
          icon: <RefreshCw className="h-6 w-6 text-blue-500" />,
          title: 'Time for a Photo Update',
          description: `It's been ${status.daysSinceRefresh} days since your last update. A new photo will help maintain accurate matching.`,
        };
      default:
        return {
          icon: <Camera className="h-6 w-6 text-primary" />,
          title: 'Update Your Photo',
          description: 'Keep your profile photo up to date for the best photo matching experience.',
        };
    }
  };

  const content = getPromptContent();

  // Inline banner version
  if (showInline) {
    return (
      <div className={`
        rounded-lg border p-4 mb-4
        ${status.promptStrength === 'required' ? 'border-red-300 bg-red-50' : ''}
        ${status.promptStrength === 'strong' ? 'border-amber-300 bg-amber-50' : ''}
        ${status.promptStrength === 'soft' ? 'border-blue-200 bg-blue-50' : ''}
      `}>
        <div className="flex items-start gap-3">
          {content.icon}
          <div className="flex-1">
            <h4 className="font-medium text-gray-900">{content.title}</h4>
            <p className="text-sm text-gray-600 mt-1">{content.description}</p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={onRefresh}>
                <Camera className="h-4 w-4 mr-2" />
                Update Photo
              </Button>
              {status.promptStrength !== 'required' && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleResponse('dismissed')}
                >
                  Later
                </Button>
              )}
            </div>
          </div>
          {status.promptStrength !== 'required' && (
            <button
              onClick={() => handleResponse('dismissed')}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Dialog version
  return showDialog ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close dialog"
        onClick={() => setShowDialog(false)}
      />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4">
          <div className="flex items-center gap-3">
            {content.icon}
            <h3 className="text-lg font-semibold text-foreground">{content.title}</h3>
          </div>
          <p className="pt-2 text-sm text-secondary">{content.description}</p>
        </div>

        <div className="space-y-4 py-4">
          {/* Confidence indicator */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Match Confidence</span>
              <span className={`font-medium ${
                status.confidenceAverage >= 75 ? 'text-green-600' : 'text-amber-600'
              }`}>
                {status.confidenceAverage.toFixed(0)}%
              </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${
                  status.confidenceAverage >= 75 ? 'bg-green-500' : 'bg-amber-500'
                }`}
                style={{ width: `${status.confidenceAverage}%` }}
              />
            </div>
          </div>

          {/* Appearance change selector */}
          <div className="text-sm text-gray-600">
            <p className="mb-2">Has your appearance changed?</p>
            <div className="relative">
              <select
                defaultValue=""
                className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-8 text-sm text-foreground"
                onChange={(e) => {
                  if (e.target.value) {
                    handleAppearanceChange(e.target.value);
                    e.currentTarget.value = '';
                  }
                }}
              >
                <option value="" disabled>
                  Select a change
                </option>
                {APPEARANCE_CHANGES.map((change) => (
                  <option key={change.value} value={change.value}>
                    {change.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={onRefresh} className="flex-1">
            <Camera className="h-4 w-4 mr-2" />
            Update Photo
          </Button>
          
          {status.pendingPrompt && (
            <Button
              variant="outline"
              onClick={() => handleResponse('these_are_me')}
              disabled={isResponding}
              className="flex-1"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Photos Look Correct
            </Button>
          )}

          {status.promptStrength !== 'required' && (
            <Button
              variant="ghost"
              onClick={() => handleResponse('dismissed')}
              disabled={isResponding}
            >
              Remind Me Later
            </Button>
          )}
        </div>
      </div>
    </div>
  ) : null;
}
