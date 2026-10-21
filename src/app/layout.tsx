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
