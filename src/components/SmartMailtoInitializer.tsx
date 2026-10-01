'use client';

import { useEffect } from 'react';
import { initSmartMailto, destroySmartMailto } from '@smart-mailto/core';

export default function SmartMailtoInitializer() {
  useEffect(() => {
    initSmartMailto({
      theme: 'auto',
      autoDetectGeo: true,
      includeNative: true,
    });

    return () => {
      destroySmartMailto();
    };
  }, []);

  return null;
}
