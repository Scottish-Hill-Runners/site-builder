'use client';

import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import UnitsToggle from '@/components/UnitsToggle';

export default function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" aria-label="Scottish Hill Runners home">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 500 58"
            height="38"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="shr-logo-g" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#FFE490" />
                <stop offset="100%" stopColor="#FFCB43" />
              </linearGradient>
            </defs>
            <text
              x="16"
              y="46"
              fontFamily="'Arial Narrow', sans-serif"
              fontWeight="700"
              fontStyle="italic"
              fontSize="42"
              textLength="468"
              lengthAdjust="spacingAndGlyphs"
              style={{ fill: 'var(--logo-text)' }}
            >
              Scottish Hill Runners
            </text>
            <rect
              x="36"
              y="50"
              width="426"
              height="6"
              rx="1"
              fill="url(#shr-logo-g)"
            />
          </svg>
        </Link>
        <div className="flex items-center gap-2">
          <UnitsToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
