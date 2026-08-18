const PUBLIC_WIDGET_CACHE_TTL_MS = 30_000;
const PUBLIC_WIDGET_STALE_TTL_MS = 5 * 60_000;
const MAX_PUBLIC_WIDGET_CACHE_ENTRIES = 500;

type PublicWidgetCacheEntry = {
  freshUntil: number;
  staleUntil: number;
  data: Record<string, unknown>;
};

const publicWidgetCache = new Map<string, PublicWidgetCacheEntry>();
const publicWidgetLoads = new Map<string, Promise<Record<string, unknown>>>();

export function publicWidgetCacheKey(
  shop: string,
  productId: string,
  productHandle: string,
  productTitle: string,
  summaryOnly: boolean
) {
  return JSON.stringify([shop, productId, productHandle, productTitle, summaryOnly]);
}

export function readPublicWidgetCache(key: string) {
  const cached = publicWidgetCache.get(key);
  if (cached && cached.freshUntil > Date.now()) return cached.data;
  if (cached && cached.staleUntil <= Date.now()) publicWidgetCache.delete(key);
  return null;
}

export function readStalePublicWidgetCache(key: string) {
  const cached = publicWidgetCache.get(key);
  if (cached && cached.staleUntil > Date.now()) return cached.data;
  if (cached) publicWidgetCache.delete(key);
  return null;
}

export function writePublicWidgetCache(key: string, data: Record<string, unknown>) {
  if (publicWidgetCache.size >= MAX_PUBLIC_WIDGET_CACHE_ENTRIES) {
    const oldestKey = publicWidgetCache.keys().next().value;
    if (oldestKey) publicWidgetCache.delete(oldestKey);
  }
  const now = Date.now();
  publicWidgetCache.set(key, {
    freshUntil: now + PUBLIC_WIDGET_CACHE_TTL_MS,
    staleUntil: now + PUBLIC_WIDGET_STALE_TTL_MS,
    data
  });
}

export function coalescePublicWidgetLoad(
  key: string,
  load: () => Promise<Record<string, unknown>>
) {
  const inFlight = publicWidgetLoads.get(key);
  if (inFlight) return inFlight;

  const promise = load().finally(() => {
    if (publicWidgetLoads.get(key) === promise) publicWidgetLoads.delete(key);
  });
  publicWidgetLoads.set(key, promise);
  return promise;
}

export function clearPublicWidgetCache(shop: string) {
  const prefix = `["${shop.replaceAll('"', '\\"')}",`;
  for (const key of publicWidgetCache.keys()) {
    if (key.startsWith(prefix)) publicWidgetCache.delete(key);
  }
  for (const key of publicWidgetLoads.keys()) {
    if (key.startsWith(prefix)) publicWidgetLoads.delete(key);
  }
}
