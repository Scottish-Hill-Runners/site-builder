'use client';

import { useLayoutEffect } from 'react';

export default function PreferenceInitializer() {
  useLayoutEffect(() => {
    try {
      if (window.localStorage.getItem('shr-units') === 'imperial') {
        document.documentElement.dataset.units = 'imperial';
      } else {
        delete document.documentElement.dataset.units;
      }
    } catch {
      delete document.documentElement.dataset.units;
    }

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
  }, []);

  return null;
}
