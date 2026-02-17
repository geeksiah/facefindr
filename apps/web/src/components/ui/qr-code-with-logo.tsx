'use client';

import html2canvas from 'html2canvas';
import { QRCodeSVG } from 'qrcode.react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

interface QRCodeWithLogoProps {
  value: string;
  size?: number;
  className?: string;
}

/**
 * QR Code component that matches the mobile profile QR code style
 * - White background with rounded corners
 * - Logo embedded in center (32% of QR size)
 * - Black modules on white background
 */
export const QRCodeWithLogo = React.forwardRef<HTMLDivElement, QRCodeWithLogoProps>(({ 
  value, 
  size = 256,
  className = ''
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoSize = useMemo(() => size * 0.32, [size]); // Logo takes 32% of QR size (matching mobile)
  const [logoSrc, setLogoSrc] = useState('/assets/logos/qr-logo.svg');

  useEffect(() => {
    let cancelled = false;

    const inlineLogoForExport = async () => {
      try {
        const response = await fetch('/assets/logos/qr-logo.svg', { cache: 'force-cache' });
        if (!response.ok) return;

        const svgMarkup = await response.text();
        const encodedSvg = window.btoa(
          encodeURIComponent(svgMarkup).replace(
            /%([0-9A-F]{2})/g,
            (_, hex: string) => String.fromCharCode(parseInt(hex, 16))
          )
        );
        const dataUri = `data:image/svg+xml;base64,${encodedSvg}`;

        if (!cancelled) {
          setLogoSrc(dataUri);
        }
      } catch {
        // Keep file path fallback for display if inlining fails.
      }
    };

    inlineLogoForExport();

    return () => {
      cancelled = true;
    };
  }, []);
  
  // Combine refs
  React.useImperativeHandle(ref, () => containerRef.current as HTMLDivElement);
  
  return (
    <div 
      ref={containerRef}
      className={`relative inline-block ${className}`}
      style={{ width: size, height: size }}
      data-qr-code
    >
      {/* White background with rounded corners */}
      <div 
        className="relative bg-white rounded-lg overflow-hidden"
        style={{ 
          borderRadius: '8px',
          width: size,
          height: size,
          padding: 0
        }}
      >
        {/* QR Code SVG */}
        <QRCodeSVG
          value={value}
          size={size}
          level="H" // High error correction for logo overlay
          fgColor="#000000"
          bgColor="#FFFFFF"
          includeMargin={false}
          style={{
            width: size,
            height: size,
          }}
        />
        
        {/* Logo overlay in center */}
        <div 
          className="absolute flex items-center justify-center pointer-events-none"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: logoSize,
            height: logoSize,
          }}
        >
          <div 
            className="bg-white rounded flex items-center justify-center"
            style={{
              width: logoSize,
              height: logoSize,
              padding: logoSize * 0.05, // Small padding around logo
            }}
          >
            <img
              src={logoSrc}
              alt="Ferchr Logo"
              width={Math.round(logoSize * 0.9)}
              height={Math.round(logoSize * 0.9)}
              className="object-contain"
              crossOrigin="anonymous"
              loading="eager"
              decoding="sync"
              style={{
                width: `${logoSize * 0.9}px`,
                height: `${logoSize * 0.9}px`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

QRCodeWithLogo.displayName = 'QRCodeWithLogo';

async function waitForImagesInElement(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll('img'));
  if (images.length === 0) return;

  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }

          const done = () => {
            img.removeEventListener('load', done);
            img.removeEventListener('error', done);
            resolve();
          };

          img.addEventListener('load', done);
          img.addEventListener('error', done);
        })
    )
  );
}

// Export utility function for downloading QR code with logo
export async function downloadQRCodeWithLogo(
  element: HTMLElement,
  filename: string,
  format: 'png' | 'jpg' = 'png'
): Promise<void> {
  try {
    await waitForImagesInElement(element);

    // Allow DOM paint to settle so html2canvas captures the inlined logo layer.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    // Capture the element as canvas
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 3, // Higher quality
      logging: false,
      useCORS: true,
      allowTaint: false,
      foreignObjectRendering: true,
    });

    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const finalFilename = /\.(png|jpg|jpeg)$/i.test(filename)
      ? filename
      : `${filename}.${format}`;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error('Failed to create image blob'));
            return;
          }
          resolve(result);
        },
        mimeType,
        1.0
      );
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = finalFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export QR code:', error);
    throw error;
  }
}
