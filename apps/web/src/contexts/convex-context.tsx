import React, { createContext, useContext, useMemo } from 'react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';

const ConvexEnabledContext = createContext(false);

export function useControlPlaneEnabled() {
  return useContext(ConvexEnabledContext);
}

export function ControlPlaneProvider({ children }: { children: React.ReactNode }) {
  const convexUrl = import.meta.env.CONVEX_URL || import.meta.env.VITE_CONVEX_URL;

  const client = useMemo(() => {
    if (!convexUrl) {
      return null;
    }

    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);

  return (
    <ConvexEnabledContext.Provider value={!!client}>
      {client ? <ConvexProvider client={client}>{children}</ConvexProvider> : children}
    </ConvexEnabledContext.Provider>
  );
}
