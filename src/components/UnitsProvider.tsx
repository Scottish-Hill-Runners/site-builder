'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'shr-units';

interface UnitsContextValue {
  imperial: boolean;
  setImperial: (value: boolean) => void;
}

const UnitsContext = createContext<UnitsContextValue>({
  imperial: false,
  setImperial: () => {},
});

export function useUnits(): UnitsContextValue {
  return useContext(UnitsContext);
}

export default function UnitsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [imperial, setImperialState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'imperial';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        imperial ? 'imperial' : 'metric'
      );
    } catch {
      // localStorage unavailable — preference won't persist
    }
  }, [imperial]);

  function setImperial(value: boolean) {
    setImperialState(value);
  }

  return (
    <UnitsContext.Provider value={{ imperial, setImperial }}>
      {children}
    </UnitsContext.Provider>
  );
}
