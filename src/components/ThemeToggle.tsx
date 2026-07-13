'use client';

import { useEffect, useState } from 'react';

type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'shr-theme';

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  const isDark =
    preference === 'dark' ||
    (preference === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  const resolvedTheme = isDark ? 'dark' : 'light';

  root.dataset.themePreference = preference;
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
  window.localStorage.setItem(STORAGE_KEY, preference);
}

export default function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    if (typeof window === 'undefined') {
      return 'system';
    }

    return (
      (window.localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ??
      'system'
    );
  });

  useEffect(() => {
    applyTheme(preference);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (preference === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [preference]);

  function handleChange(nextPreference: ThemePreference) {
    setPreference(nextPreference);
    applyTheme(nextPreference);
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-100 p-1 text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
      <span className="sr-only">Colour scheme</span>
      
      <button
        onClick={() => handleChange('light')}
        aria-label="Light theme"
        title="Light theme"
        className={`rounded-md p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          preference === 'light'
            ? 'bg-white text-blue-500 shadow-sm dark:bg-slate-700 dark:text-blue-400'
            : 'hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100'
        }`}
      >
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd"></path>
        </svg>
      </button>

      <button
        onClick={() => handleChange('dark')}
        aria-label="Dark theme"
        title="Dark theme"
        className={`rounded-md p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          preference === 'dark'
            ? 'bg-white text-blue-500 shadow-sm dark:bg-slate-700 dark:text-blue-400'
            : 'hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100'
        }`}
      >
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
        </svg>
      </button>

      <button
        onClick={() => handleChange('system')}
        aria-label="System theme"
        title="System theme"
        className={`rounded-md p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          preference === 'system'
            ? 'bg-white text-blue-500 shadow-sm dark:bg-slate-700 dark:text-blue-400'
            : 'hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100'
        }`}
      >
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 3a2 2 0 00-2 2v8a2 2 0 002 2h4l.433 2.166A1 1 0 009.414 18h1.172a1 1 0 00.98-.834L12 15h4a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 10H4V5h12v8z" />
        </svg>
      </button>
    </div>
  );
}
