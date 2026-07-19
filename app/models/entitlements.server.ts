import prisma from "~/db.server";
import { isFreeProShop } from "~/shopify.server";

export const FREE_MONTHLY_IMPORT_LIMIT = 30;
export const FREE_MONTHLY_DELETE_LIMIT = 5;

export type AppPlan = "FREE" | "PRO";
export type PlanSource = "FREE" | "BILLING" | "FREE_PARTNER";

export type ShopEntitlements = {
  plan: AppPlan;
  planSource: PlanSource;
  isPro: boolean;
};

const BILLING_STATUS_CACHE_TTL_MS = 60_000;
const FREE_BILLING_STATUS_CACHE_TTL_MS = 5_000;
const ENTITLEMENTS_CACHE_TTL_MS = 15_000;
const MAX_ENTITLEMENTS_CACHE_ENTRIES = 500;
const billingStatusSyncs = new Map<string, Promise<ShopEntitlements>>();
type PersistedEntitlements = Awaited<ReturnType<typeof readPersistedShopEntitlements>>;
const persistedEntitlementsCache = new Map<string, { expiresAt: number; value: PersistedEntitlements }>();
const persistedEntitlementsReads = new Map<string, Promise<PersistedEntitlements>>();

export function buildShopifyPlanSelectionUrl(shopDomain: string) {
  const storeHandle = shopDomain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(".myshopify.com", "")
    .replace(/\/.*$/, "")
    .trim();
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "furniture-brand-reviews";

  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

export class PlanLimitError extends Error {
  status = 429;

  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export async function syncAdminEntitlements(
  shopDomain: string,
  billing: any,
  session?: { accessToken?: string },
  planHandle?: string | null
): Promise<ShopEntitlements> {
  if (isFreeProShop(shopDomain)) {
    const persisted = await getPersistedShopEntitlements(shopDomain);
    if (persisted.entitlements.plan !== "PRO") await persistPlan(shopDomain, "PRO");
    return { plan: "PRO", planSource: "FREE_PARTNER", isPro: true };
  }

  const redirectedPlan = planFromShopifyPlanHandle(planHandle);
  if (redirectedPlan) {
    await persistPlan(shopDomain, redirectedPlan);
    return entitlementsForPlan(redirectedPlan);
  }

  const persisted = await getPersistedShopEntitlements(shopDomain);
  const billingStatusCacheTtl = persisted.entitlements.isPro
    ? BILLING_STATUS_CACHE_TTL_MS
    : FREE_BILLING_STATUS_CACHE_TTL_MS;
  if (
    persisted.checkedAt &&
    Date.now() - persisted.checkedAt.getTime() < billingStatusCacheTtl
  ) {
    return persisted.entitlements;
  }

  const existingSync = billingStatusSyncs.get(shopDomain);
  if (existingSync) return existingSync;

  const sync = syncBillingStatus(
    shopDomain,
    billing,
    session,
    persisted.entitlements,
    persisted.shopifyShopId
  );
  billingStatusSyncs.set(shopDomain, sync);
  try {
    return await sync;
  } finally {
    if (billingStatusSyncs.get(shopDomain) === sync) billingStatusSyncs.delete(shopDomain);
  }
}

async function syncBillingStatus(
  shopDomain: string,
  billing: any,
  session: { accessToken?: string } | undefined,
  persistedEntitlements: ShopEntitlements,
  persistedShopifyShopId: string | null
): Promise<ShopEntitlements> {
  try {
    const appPricingPlan = await checkShopifyAppPricing(shopDomain, persistedShopifyShopId);
    if (appPricingPlan) {
      await persistPlan(shopDomain, appPricingPlan);
      return entitlementsForPlan(appPricingPlan);
    }

    // Legacy subscriptions created through the Billing API continue to appear
    // here. Native Shopify App Pricing subscriptions are checked above through
    // the Partner API.
    const check = await billing.check();
    const plan: AppPlan = check.appSubscriptions.length > 0 ? "PRO" : "FREE";
    await persistPlan(shopDomain, plan);
    return entitlementsForPlan(plan);
  } catch (error) {
    // Shopify App Pricing can temporarily make the legacy Billing API status
    // unavailable. A billing lookup must never prevent a merchant from opening
    // the app. New shops already resolve to FREE, while a previously verified
    // paid plan remains available until Shopify can be checked again.
    console.warn("Billing status check failed; using persisted app plan", {
      shopDomain,
      persistedPlan: persistedEntitlements.plan,
      error: error instanceof Error ? error.message : String(error)
    });
    await persistPlan(shopDomain, persistedEntitlements.plan);
    return persistedEntitlements;
  }
}

function planFromShopifyPlanHandle(planHandle?: string | null): AppPlan | null {
  const normalized = planHandle?.trim().toLowerCase();
  if (!normalized) return null;
  return normalized.includes("free") ? "FREE" : "PRO";
}

function entitlementsForPlan(plan: AppPlan): ShopEntitlements {
  return {
    plan,
    planSource: plan === "PRO" ? "BILLING" : "FREE",
    isPro: plan === "PRO"
  };
}

async function checkShopifyAppPricing(
  shopDomain: string,
  persistedShopifyShopId: string | null
): Promise<AppPlan | null> {
  const organizationId = process.env.SHOPIFY_PARTNER_ORGANIZATION_ID?.trim();
  const partnerAccessToken = process.env.SHOPIFY_PARTNER_ACCESS_TOKEN?.trim();
  const configuredAppId = process.env.SHOPIFY_PARTNER_APP_ID?.trim();
  if (!organizationId || !partnerAccessToken || !configuredAppId) return null;

  const appId = configuredAppId.startsWith("gid://")
    ? configuredAppId
    : `gid://shopify/App/${configuredAppId}`;
  const shopId = persistedShopifyShopId || await resolvePartnerShopId({
    organizationId,
    partnerAccessToken,
    appId,
    shopDomain
  });
  const response = await fetch(
    `https://partners.shopify.com/${organizationId}/api/2026-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": partnerAccessToken
      },
      body: JSON.stringify({
        query: `
          query ActiveSubscription($appId: ID!, $shopId: ID!) {
            activeSubscription(appId: $appId, shopId: $shopId) {
              items {
                handle
                price {
                  active
                  ... on FlatRatePrice { amount }
                }
              }
            }
          }
        `,
        variables: { appId, shopId }
      })
    }
  );
  if (!response.ok) throw new Error(`Partner API subscription lookup failed (${response.status})`);

  const payload = await response.json() as {
    data?: {
      activeSubscription?: {
        items?: Array<{ handle?: string; price?: { active?: boolean; amount?: string | number } }>;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message || "Partner API error").join("; "));
  }

  const subscription = payload.data?.activeSubscription;
  if (!subscription) return "FREE";

  const isPaid = (subscription.items || []).some((item) => {
    const amount = Number(item.price?.amount || 0);
    return item.price?.active !== false && amount > 0;
  });
  return isPaid ? "PRO" : "FREE";
}

async function resolvePartnerShopId({
  organizationId,
  partnerAccessToken,
  appId,
  shopDomain
}: {
  organizationId: string;
  partnerAccessToken: string;
  appId: string;
  shopDomain: string;
}) {
  const endpoint = `https://partners.shopify.com/${organizationId}/api/2026-07/graphql.json`;
  const normalizedDomain = normalizeShopDomain(shopDomain);
  const occurredAtMax = new Date().toISOString();
  const occurredAtMin = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  let after: string | null = null;

  // Partner events are the authoritative way to map a myshopify domain to its
  // Shop GID without relying on a potentially expired Admin API access token.
  // Keep the scan bounded; newly installed and newly upgraded stores appear on
  // the first page in normal operation.
  for (let page = 0; page < 10; page += 1) {
    const response: Response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": partnerAccessToken
      },
      body: JSON.stringify({
        query: `
          query ResolveShopId(
            $appId: ID!
            $after: String
            $occurredAtMin: DateTime!
            $occurredAtMax: DateTime!
          ) {
            events(
              first: 100
              after: $after
              filter: {
                subjectId: $appId
                subjectType: APP
                occurredAtMin: $occurredAtMin
                occurredAtMax: $occurredAtMax
              }
            ) {
              edges {
                node {
                  shop { id myshopifyDomain }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
        variables: { appId, after, occurredAtMin, occurredAtMax }
      })
    });
    if (!response.ok) {
      throw new Error(`Partner API shop lookup failed (${response.status})`);
    }

    const payload = await response.json() as {
      data?: {
        events?: {
          edges?: Array<{ node?: { shop?: { id?: string; myshopifyDomain?: string } | null } }>;
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        };
      };
      errors?: Array<{ message?: string }>;
    };
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((error) => error.message || "Partner API error").join("; "));
    }

    const events = payload.data?.events;
    const matchingShop = events?.edges?.find(({ node }) =>
      normalizeShopDomain(node?.shop?.myshopifyDomain || "") === normalizedDomain
    )?.node?.shop;
    if (matchingShop?.id) {
      await persistShopifyShopId(shopDomain, matchingShop.id);
      return matchingShop.id;
    }

    if (!events?.pageInfo?.hasNextPage || !events.pageInfo.endCursor) break;
    after = events.pageInfo.endCursor;
  }

  throw new Error(`Unable to resolve Shopify shop ID for ${normalizedDomain}`);
}

function normalizeShopDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

async function persistShopifyShopId(shopDomain: string, shopifyShopId: string) {
  await prisma.shop.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } });
  await prisma.subscriptionSettings.upsert({
    where: { shopDomain },
    update: { shopifyShopId },
    create: { shopDomain, shopifyShopId }
  });
}

export async function getShopEntitlements(shopDomain: string): Promise<ShopEntitlements> {
  if (isFreeProShop(shopDomain)) {
    return { plan: "PRO", planSource: "FREE_PARTNER", isPro: true };
  }

  return (await getPersistedShopEntitlements(shopDomain)).entitlements;
}

async function getPersistedShopEntitlements(shopDomain: string) {
  const cached = persistedEntitlementsCache.get(shopDomain);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) persistedEntitlementsCache.delete(shopDomain);

  const existingRead = persistedEntitlementsReads.get(shopDomain);
  if (existingRead) return existingRead;

  const read = readPersistedShopEntitlements(shopDomain);
  persistedEntitlementsReads.set(shopDomain, read);
  try {
    const value = await read;
    if (persistedEntitlementsCache.size >= MAX_ENTITLEMENTS_CACHE_ENTRIES) {
      const oldestShop = persistedEntitlementsCache.keys().next().value;
      if (oldestShop) persistedEntitlementsCache.delete(oldestShop);
    }
    persistedEntitlementsCache.set(shopDomain, {
      expiresAt: Date.now() + ENTITLEMENTS_CACHE_TTL_MS,
      value
    });
    return value;
  } finally {
    if (persistedEntitlementsReads.get(shopDomain) === read) persistedEntitlementsReads.delete(shopDomain);
  }
}

async function readPersistedShopEntitlements(shopDomain: string) {
  const subscription = await prisma.subscriptionSettings.findUnique({
    where: { shopDomain },
    select: { plan: true, shopifyShopId: true, updatedAt: true }
  });
  const plan: AppPlan = subscription?.plan === "PRO" ? "PRO" : "FREE";

  return {
    entitlements: {
      plan,
      planSource: plan === "PRO" ? "BILLING" as const : "FREE" as const,
      isPro: plan === "PRO"
    },
    shopifyShopId: subscription?.shopifyShopId || null,
    checkedAt: subscription?.updatedAt || null
  };
}

export function invalidateShopEntitlementsCache(shopDomain: string) {
  persistedEntitlementsCache.delete(shopDomain);
  persistedEntitlementsReads.delete(shopDomain);
}

export async function persistWebhookEntitlements(shopDomain: string, plan: AppPlan) {
  await persistPlan(shopDomain, plan);
}

export async function getMonthlyPlanUsage(shopDomain: string, now = new Date()) {
  const { monthKey } = calendarMonth(now);
  const usage = await prisma.monthlyPlanUsage.findUnique({
    where: { shopDomain_monthKey: { shopDomain, monthKey } },
    select: { reviewImports: true, reviewDeletions: true }
  });

  return {
    monthKey,
    reviewImports: usage?.reviewImports || 0,
    reviewDeletions: usage?.reviewDeletions || 0,
    importLimit: FREE_MONTHLY_IMPORT_LIMIT,
    deleteLimit: FREE_MONTHLY_DELETE_LIMIT
  };
}

export function currentPlanMonthKey(now = new Date()) {
  return calendarMonth(now).monthKey;
}

export async function deleteProductReviewWithPlanLimit(shopDomain: string, reviewId: string) {
  const entitlements = await getShopEntitlements(shopDomain);
  if (entitlements.isPro) {
    const deleted = await prisma.productReview.deleteMany({ where: { id: reviewId, shopDomain } });
    if (!deleted.count) throw new Response("Review not found.", { status: 404 });
    return;
  }

  const { monthKey } = calendarMonth(new Date());
  await prisma.$transaction(async (tx) => {
    await tx.monthlyPlanUsage.upsert({
      where: { shopDomain_monthKey: { shopDomain, monthKey } },
      update: {},
      create: { shopDomain, monthKey }
    });
    const consumed = await tx.monthlyPlanUsage.updateMany({
      where: {
        shopDomain,
        monthKey,
        reviewDeletions: { lt: FREE_MONTHLY_DELETE_LIMIT }
      },
      data: { reviewDeletions: { increment: 1 } }
    });
    if (!consumed.count) {
      throw new PlanLimitError(
        `You have reached the Free plan limit of ${FREE_MONTHLY_DELETE_LIMIT} deleted reviews this month. Upgrade to Pro for unlimited deletions.`
      );
    }

    const deleted = await tx.productReview.deleteMany({ where: { id: reviewId, shopDomain } });
    if (!deleted.count) throw new Response("Review not found.", { status: 404 });
  });
}

function calendarMonth(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, monthKey };
}

async function persistPlan(shopDomain: string, plan: AppPlan) {
  invalidateShopEntitlementsCache(shopDomain);
  await prisma.shop.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } });
  await prisma.subscriptionSettings.upsert({
    where: { shopDomain },
    update: { plan },
    create: { shopDomain, plan }
  });
  invalidateShopEntitlementsCache(shopDomain);
}
