import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Semi_Condensed } from 'next/font/google';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/query-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';
import './motion.css';

const barlow = Barlow({
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow',
  display: 'swap',
  subsets: ['latin'],
});

const barlowSemiCondensed = Barlow_Semi_Condensed({
  weight: ['500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-barlow-semi-condensed',
  display: 'swap',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Gym Coach',
  description: 'Your daily gym workout, planned for the time you have.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon-180.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#2CD36A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The CSP nonce is per request (src/proxy.ts), so every page renders dynamically and Next.js can
  // attach the nonce to its scripts (security-and-privacy.md §2).
  await connection();
  return (
    <html lang="en" className={`${barlow.variable} ${barlowSemiCondensed.variable}`}>
      <body className="h-dvh overflow-hidden">
        <QueryProvider>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster />
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
