'use client';

import { useState } from 'react';
import { Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventSharePanel } from './event-share-panel';

interface ShareButtonProps {
  eventId: string;
  size?: 'sm' | 'default' | 'lg';
}

export function ShareButton({ eventId, size = 'sm' }: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button size={size} onClick={() => setIsOpen(true)}>
        <Share2 className="h-4 w-4 mr-2" />
        Share
      </Button>

      {/* Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            margin: 0,
            padding: 0,
            width: '100vw',
            height: '100vh',
          }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Content */}
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4 bg-card rounded-2xl border border-border shadow-xl">
            {/* Close button */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-secondary hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="p-6">
              <EventSharePanel eventId={eventId} onClose={() => setIsOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
