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
    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
      <span className="sr-only">Colour scheme</span>
      <select
        aria-label="Colour scheme"
        value={preference}
        onChange={(event) =>
          handleChange(event.target.value as ThemePreference)
        }
        className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 sm:w-auto sm:px-2.5 sm:py-1.5 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
