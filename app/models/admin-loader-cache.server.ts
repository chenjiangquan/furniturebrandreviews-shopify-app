type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const DEFAULT_TTL_MS = 15_000;
const MAX_CACHE_ENTRIES = 250;
const adminLoaderCache = new Map<string, CacheEntry<unknown>>();

export function adminLoaderCacheKey(shopDomain: string, route: string, variant = "default") {
  return `${shopDomain.toLowerCase()}::${route}::${variant}`;
}

export async function cachedAdminLoader<T>(key: string, load: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const now = Date.now();
  const cached = adminLoaderCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) adminLoaderCache.delete(key);

  pruneExpiredEntries(now);
  const value = load();
  adminLoaderCache.set(key, { expiresAt: now + ttlMs, value });

  try {
    return await value;
  } catch (error) {
    const current = adminLoaderCache.get(key);
    if (current?.value === value) adminLoaderCache.delete(key);
    throw error;
  }
}

export function invalidateAdminLoaderCache(shopDomain: string) {
  const prefix = `${shopDomain.toLowerCase()}::`;
  for (const key of adminLoaderCache.keys()) {
    if (key.startsWith(prefix)) adminLoaderCache.delete(key);
  }
}

function pruneExpiredEntries(now: number) {
  if (adminLoaderCache.size < MAX_CACHE_ENTRIES) return;

  for (const [key, entry] of adminLoaderCache) {
    if (entry.expiresAt <= now) adminLoaderCache.delete(key);
  }

  while (adminLoaderCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = adminLoaderCache.keys().next().value;
    if (!oldestKey) break;
    adminLoaderCache.delete(oldestKey);
  }
}
