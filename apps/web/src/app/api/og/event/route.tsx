import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const eventName = searchParams.get('name') || 'Event';
  const eventDate = searchParams.get('date') || '';
  const photographerName = searchParams.get('photographer') || 'Creator';
  const photoCount = searchParams.get('photos') || '0';
  const coverUrl = searchParams.get('cover') || null;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0f172a',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background Image */}
        {coverUrl && (
          <img
            src={coverUrl}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.3,
            }}
          />
        )}

        {/* Gradient Overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(to bottom, rgba(15, 23, 42, 0.5), rgba(15, 23, 42, 0.95))',
          }}
        />

        {/* Content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '48px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Event Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
            }}
          >
            <div
              style={{
                backgroundColor: '#0ea5e9',
                borderRadius: '12px',
                padding: '8px 16px',
              }}
            >
              <span style={{ color: 'white', fontSize: '16px', fontWeight: '600' }}>
                EVENT PHOTOS
              </span>
            </div>
            {parseInt(photoCount) > 0 && (
              <div
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  padding: '8px 16px',
                }}
              >
                <span style={{ color: 'white', fontSize: '16px' }}>
                  {photoCount} photos
                </span>
              </div>
            )}
          </div>

          {/* Event Name */}
          <div
            style={{
              fontSize: '56px',
              fontWeight: 'bold',
              color: 'white',
              marginBottom: '16px',
              lineHeight: 1.1,
              maxWidth: '900px',
            }}
          >
            {eventName}
          </div>

          {/* Event Details */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
              marginBottom: '24px',
            }}
          >
            {eventDate && (
              <div style={{ color: '#94a3b8', fontSize: '24px' }}>
                📅 {eventDate}
              </div>
            )}
            <div style={{ color: '#94a3b8', fontSize: '24px' }}>
              📷 by {photographerName}
            </div>
          </div>

          {/* CTA */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#0ea5e9',
              fontSize: '20px',
            }}
          >
            <span>Find your photos with AI face recognition →</span>
          </div>
        </div>

        {/* Logo */}
        <div
          style={{
            position: 'absolute',
            top: '32px',
            left: '48px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#0ea5e9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '28px', color: 'white', fontWeight: 'bold' }}>F</span>
          </div>
          <span style={{ fontSize: '28px', color: 'white', fontWeight: 'bold' }}>
            Ferchr
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
