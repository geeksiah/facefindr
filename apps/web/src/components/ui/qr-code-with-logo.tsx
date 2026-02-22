'use client';

import { QRCodeCanvas } from 'qrcode.react';
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
  const quietZoneSize = useMemo(() => Math.max(12, Math.round(size * 0.08)), [size]);
  const qrMatrixSize = useMemo(() => Math.max(128, size - quietZoneSize * 2), [size, quietZoneSize]);
  const logoSize = useMemo(() => Math.round(qrMatrixSize * 0.26), [qrMatrixSize]);
  
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
          padding: 0,
        }}
      >
        {/* QR Code canvas */}
        <QRCodeCanvas
          value={value}
          size={qrMatrixSize}
          level="H" // High error correction for logo overlay
          fgColor="#000000"
          bgColor="#FFFFFF"
          includeMargin={false}
          style={{
            width: qrMatrixSize,
            height: qrMatrixSize,
            position: 'absolute',
            top: quietZoneSize,
            left: quietZoneSize,
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
              padding: logoSize * 0.09,
            }}
          >
            <img
              src="/assets/logos/qr-logo.svg"
              alt="Ferchr Logo"
              width={Math.round(logoSize * 0.8)}
              height={Math.round(logoSize * 0.8)}
              className="object-contain"
              style={{
                width: `${logoSize * 0.8}px`,
                height: `${logoSize * 0.8}px`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

QRCodeWithLogo.displayName = 'QRCodeWithLogo';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

// Export utility function for downloading QR code with logo
export async function downloadQRCodeWithLogo(
  element: HTMLElement,
  filename: string,
  format: 'png' | 'jpg' = 'png'
): Promise<void> {
  try {
    const sourceCanvas = element.querySelector('canvas');
    if (!sourceCanvas) {
      throw new Error('QR canvas not found in export target');
    }

    const rawWidth = sourceCanvas.width || 256;
    const rawHeight = sourceCanvas.height || 256;
    const baseSize = Math.max(rawWidth, rawHeight, 256);
    const qrScaleFactor = 8;
    const qrRenderSize = baseSize * qrScaleFactor;
    const quietZone = Math.round(qrRenderSize * 0.08);
    const exportSize = qrRenderSize + quietZone * 2;

    const canvas = document.createElement('canvas');
    canvas.width = exportSize;
    canvas.height = exportSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create 2D canvas context');
    }

    // Base white background.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, exportSize, exportSize);
    ctx.imageSmoothingEnabled = false;

    // Draw QR matrix from existing canvas with explicit quiet zone to improve scan reliability.
    ctx.drawImage(sourceCanvas, quietZone, quietZone, qrRenderSize, qrRenderSize);

    // Draw center white box + logo.
    const logoImageNode = element.querySelector('img[alt="Ferchr Logo"]') as HTMLImageElement | null;
    const logoSrc = logoImageNode?.currentSrc || logoImageNode?.src || '/assets/logos/qr-logo.svg';
    let logoImage: HTMLImageElement | null = null;

    if (logoImageNode?.complete && logoImageNode.naturalWidth > 0) {
      logoImage = logoImageNode;
    } else {
      try {
        logoImage = await loadImage(logoSrc);
      } catch {
        try {
          logoImage = await loadImage('/assets/logos/icon.svg');
        } catch {
          logoImage = null;
        }
      }
    }

    const overlaySize = qrRenderSize * 0.26;
    const overlayPadding = overlaySize * 0.09;
    const logoDrawSize = overlaySize - overlayPadding * 2;
    const overlayX = (exportSize - overlaySize) / 2;
    const overlayY = (exportSize - overlaySize) / 2;
    const logoX = (exportSize - logoDrawSize) / 2;
    const logoY = (exportSize - logoDrawSize) / 2;

    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(ctx, overlayX, overlayY, overlaySize, overlaySize, overlaySize * 0.08);
    if (logoImage) {
      ctx.drawImage(logoImage, logoX, logoY, logoDrawSize, logoDrawSize);
    }

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
