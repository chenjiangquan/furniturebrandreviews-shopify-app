const PUBLIC_WIDGET_CACHE_TTL_MS = 30_000;
const MAX_PUBLIC_WIDGET_CACHE_ENTRIES = 500;

const publicWidgetCache = new Map<string, { expiresAt: number; data: Record<string, unknown> }>();

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
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (cached) publicWidgetCache.delete(key);
  return null;
}

export function writePublicWidgetCache(key: string, data: Record<string, unknown>) {
  if (publicWidgetCache.size >= MAX_PUBLIC_WIDGET_CACHE_ENTRIES) {
    const oldestKey = publicWidgetCache.keys().next().value;
    if (oldestKey) publicWidgetCache.delete(oldestKey);
  }
  publicWidgetCache.set(key, { expiresAt: Date.now() + PUBLIC_WIDGET_CACHE_TTL_MS, data });
}

export function clearPublicWidgetCache(shop: string) {
  const prefix = `["${shop.replaceAll('"', '\\"')}",`;
  for (const key of publicWidgetCache.keys()) {
    if (key.startsWith(prefix)) publicWidgetCache.delete(key);
  }
}
