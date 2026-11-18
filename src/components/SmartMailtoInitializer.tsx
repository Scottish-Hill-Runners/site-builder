'use client';

import { useEffect } from 'react';
import { initSmartMailto, destroySmartMailto, PROVIDERS } from '@smart-mailto/core';

export default function SmartMailtoInitializer() {
  useEffect(() => {
    const customProviders = ['outlook-personal', 'outlook-work'].map((id) => {
      const provider = PROVIDERS[id];
      if (!provider) throw new Error(`Unknown mail provider: ${id}`);

      return {
        ...provider,
        buildUrl: (params: Parameters<typeof provider.buildUrl>[0]) =>
          provider.buildUrl(params).replace(/\+/g, '%20'),
      };
    });
  
    initSmartMailto({
      theme: 'auto',
      autoDetectGeo: true,
      includeNative: true,
      customProviders,
    });

    return () => {
      destroySmartMailto();
    };
  }, []);

  return null;
}
