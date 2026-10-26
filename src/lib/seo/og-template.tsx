import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

/**
 * Shared social card. Satori (behind ImageResponse) understands a subset of CSS and no Tailwind,
 * so every value here is an inline style.
 */
export function createOgImage(title: string, subtitle: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
          padding: '60px',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', fontSize: 36, opacity: 0.8, marginBottom: 20 }}>
          TubigWatch
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 72,
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 36,
            opacity: 0.9,
            marginTop: 24,
            textAlign: 'center',
          }}
        >
          {subtitle}
        </div>
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 40,
            fontSize: 24,
            opacity: 0.7,
          }}
        >
          tubigwatch.vercel.app
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
