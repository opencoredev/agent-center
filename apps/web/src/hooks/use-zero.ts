import { useQuery as useZeroQuery } from '@rocicorp/zero/react';

export const ZERO_ENABLED =
  import.meta.env.VITE_ZERO_ENABLED === 'true' && !!import.meta.env.VITE_ZERO_CACHE_URL;

export { useZeroQuery };
