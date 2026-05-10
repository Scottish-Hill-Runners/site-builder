import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import sharedStyles from './shared.module.css';
import SiteHeader from '@/components/SiteHeader';
import UnitsProvider from '@/components/UnitsProvider';

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

const unitsScript = `
(() => {
  try {
    if (window.localStorage.getItem('shr-units') === 'imperial') {
      document.documentElement.dataset.units = 'imperial';
    }
  } catch {}
})();`;

const themeScript = `
(() => {
  try {
    const storageKey = 'shr-theme';
    const storedPreference = window.localStorage.getItem(storageKey) || 'system';
    const isDark = storedPreference === 'dark'
      || (storedPreference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const resolvedTheme = isDark ? 'dark' : 'light';
    document.documentElement.dataset.themePreference = storedPreference;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  } catch {
    document.documentElement.dataset.themePreference = 'system';
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: unitsScript }} suppressHydrationWarning />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} suppressHydrationWarning />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <a href="#main-content" className={`${sharedStyles.srOnly}`}>
          Skip to content
        </a>
        <UnitsProvider>
          <SiteHeader />
          <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {children}
          </div>
        </UnitsProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
