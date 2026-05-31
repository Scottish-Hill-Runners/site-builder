import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import sharedStyles from './shared.module.css';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import UnitsProvider from '@/components/UnitsProvider';
import PreferenceInitializer from '@/components/PreferenceInitializer';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Scottish Hill Runners',
  description: 'Information, news and results for Scottish hill runners',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PreferenceInitializer />
        <a href="#main-content" className={`${sharedStyles.srOnly}`}>
          Skip to content
        </a>
        <UnitsProvider>
          <SiteHeader />
          <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {children}
          </div>
          <SiteFooter />
        </UnitsProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
