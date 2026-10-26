import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Inter } from 'next/font/google';

import RegisterSW from '@/components/register-sw';

import { Analytics } from '@vercel/analytics/next';

import InstallPrompt from '@/components/install-prompt';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  // Required so the generated OG image routes resolve to absolute public URLs instead of localhost.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://tubigwatch.vercel.app'),
  title: 'TubigWatch',
  description: 'Metro Manila water outage tracker',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        {children}
        <RegisterSW />
        <Analytics />
        <InstallPrompt />
      </body>
    </html>
  );
}
