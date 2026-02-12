'use client';

import { Share2, X } from 'lucide-react';
import { useState } from 'react';

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
          className="fixed z-50 flex items-center justify-center"
          style={{
            position: 'fixed',
            inset: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100dvw',
            height: '100dvh',
            margin: 0,
            padding: 0,
          }}
        >
          {/* Backdrop */}
          <div
            className="absolute bg-black/50 backdrop-blur-sm"
            style={{
              position: 'absolute',
              inset: 0,
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100%',
              margin: 0,
              padding: 0,
            }}
            onClick={() => setIsOpen(false)}
          />

          {/* Content */}
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 my-4 bg-card rounded-2xl border border-border shadow-xl">
            <div className="p-6">
              <EventSharePanel eventId={eventId} onClose={() => setIsOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

