'use client';

import html2canvas from 'html2canvas';
import { QRCodeSVG } from 'qrcode.react';
import React, { useMemo, useRef } from 'react';

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
  
  // Combine refs
  React.useImperativeHandle(ref, () => containerRef.current!);
  
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
              src="/assets/logos/qr-logo.svg"
              alt="FaceFindr Logo"
              width={Math.round(logoSize * 0.9)}
              height={Math.round(logoSize * 0.9)}
              className="object-contain"
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

// Export utility function for downloading QR code with logo
export async function downloadQRCodeWithLogo(
  element: HTMLElement,
  filename: string,
  format: 'png' | 'jpg' = 'png'
): Promise<void> {
  try {
    // Capture the element as canvas
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2, // Higher quality
      logging: false,
      useCORS: true,
      allowTaint: true,
    });
    
    // Convert to blob
    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('Failed to create blob');
        return;
      }
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, `image/${format}`, 1.0);
  } catch (error) {
    console.error('Failed to export QR code:', error);
    throw error;
  }
}
