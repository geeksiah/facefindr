import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const faceTag = searchParams.get('faceTag') || '@user';
  const name = searchParams.get('name') || 'FaceFindr User';
  const photoUrl = searchParams.get('photo') || null;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f172a',
          backgroundImage: 'radial-gradient(circle at 25% 25%, #1e293b 0%, #0f172a 50%)',
        }}
      >
        {/* Card Container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#1e293b',
            borderRadius: '32px',
            padding: '48px 64px',
            border: '1px solid #334155',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '60px',
              backgroundColor: '#0ea5e9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '24px',
              overflow: 'hidden',
            }}
          >
            {photoUrl ? (
              <img
                src={photoUrl}
                width={120}
                height={120}
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: '48px', color: 'white', fontWeight: 'bold' }}>
                {name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Name */}
          <div
            style={{
              fontSize: '36px',
              fontWeight: 'bold',
              color: 'white',
              marginBottom: '8px',
            }}
          >
            {name}
          </div>

          {/* FaceTag */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(14, 165, 233, 0.2)',
              borderRadius: '20px',
              padding: '8px 20px',
              marginBottom: '16px',
            }}
          >
            <span
              style={{
                fontSize: '24px',
                color: '#0ea5e9',
                fontFamily: 'monospace',
                fontWeight: '600',
              }}
            >
              {faceTag}
            </span>
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: '18px',
              color: '#94a3b8',
            }}
          >
            Connect with me on FaceFindr
          </div>
        </div>

        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginTop: '32px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: '#0ea5e9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '24px', color: 'white', fontWeight: 'bold' }}>F</span>
          </div>
          <span style={{ fontSize: '24px', color: 'white', fontWeight: 'bold' }}>
            FaceFindr
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
