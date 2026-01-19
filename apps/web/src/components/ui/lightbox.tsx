'use client';

import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { cn } from '@/lib/utils';

interface LightboxProps {
  images: Array<{ id: string; url: string; alt?: string }>;
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  showReactions?: boolean;
}

export function Lightbox({ images, initialIndex = 0, isOpen, onClose, showReactions = false }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, goToPrevious, goToNext]);

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex];

  // Prevent body scroll when lightbox is open and ensure edge-to-edge
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Ensure no margins on body/html that could create gaps
      const originalBodyMargin = document.body.style.margin;
      const originalHtmlMargin = document.documentElement.style.margin;
      document.body.style.margin = '0';
      document.documentElement.style.margin = '0';
      return () => {
        document.body.style.overflow = '';
        document.body.style.margin = originalBodyMargin;
        document.documentElement.style.margin = originalHtmlMargin;
      };
    }
  }, [isOpen]);

  return (
    <div
      className="fixed z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      style={{ 
        margin: 0, 
        padding: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        position: 'fixed',
      }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors backdrop-blur-sm"
        aria-label="Close lightbox"
      >
        <X className="h-6 w-6 text-white" />
      </button>

      {/* Navigation buttons */}
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToPrevious();
            }}
            className="absolute left-4 z-10 p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors backdrop-blur-sm"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-6 w-6 text-white" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
            className="absolute right-4 z-10 p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors backdrop-blur-sm"
            aria-label="Next image"
          >
            <ChevronRight className="h-6 w-6 text-white" />
          </button>
        </>
      )}

      {/* Image */}
      <div
        className="relative w-full h-full flex items-center justify-center"
        style={{ padding: '1rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={currentImage.url}
          alt={currentImage.alt || `Image ${currentIndex + 1}`}
          className="object-contain"
          style={{ 
            maxWidth: 'calc(100vw - 2rem)', 
            maxHeight: 'calc(100vh - 2rem)',
            width: 'auto',
            height: 'auto',
          }}
        />
      </div>

      {/* Reactions placeholder - can be extended with PhotoReactions component */}
      {showReactions && currentImage.id && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
          <div className="rounded-full bg-black/50 backdrop-blur-sm px-4 py-2">
            <span className="text-white text-sm">Photo ID: {currentImage.id}</span>
          </div>
        </div>
      )}

      {/* Image counter */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/50 backdrop-blur-sm">
          <span className="text-sm text-white font-medium">
            {currentIndex + 1} / {images.length}
          </span>
        </div>
      )}
    </div>
  );
}
