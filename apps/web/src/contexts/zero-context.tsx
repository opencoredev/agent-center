import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { Zero } from '@rocicorp/zero';
import { ZeroProvider } from '@rocicorp/zero/react';
import { schema } from '@agent-center/db/zero-schema';
import type { Schema } from '@agent-center/db/zero-schema';
import { getToken } from '@/lib/auth';

export type ZeroInstance = Zero<Schema>;

const ZeroInstanceCtx = createContext<ZeroInstance | null>(null);

export function useOptionalZero(): ZeroInstance | null {
  return useContext(ZeroInstanceCtx);
}

function getUserIdFromToken(token: string | null): string {
  if (!token) return 'anon';
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!));
    return payload.sub ?? payload.userId ?? 'anon';
  } catch {
    return 'anon';
  }
}

export function ZeroSyncProvider({ children }: { children: React.ReactNode }) {
  const zeroCacheUrl =
    import.meta.env.VITE_ZERO_ENABLED === 'true' ? import.meta.env.VITE_ZERO_CACHE_URL : undefined;
  const token = getToken();

  const zero = useMemo(() => {
    if (!zeroCacheUrl) return null;

    return new Zero({
      userID: getUserIdFromToken(token),
      auth: token ?? undefined,
      cacheURL: zeroCacheUrl,
      schema,
    });
  }, [zeroCacheUrl, token]);

  useEffect(() => {
    return () => {
      zero?.close();
    };
  }, [zero]);

  return (
    <ZeroInstanceCtx.Provider value={zero}>
      {zero ? (
        <ZeroProvider zero={zero}>{children}</ZeroProvider>
      ) : (
        children
      )}
    </ZeroInstanceCtx.Provider>
  );
}
