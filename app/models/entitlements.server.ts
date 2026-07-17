import prisma from "~/db.server";
import { PRO_PLAN } from "~/models/billing-plans";
import { isBillingTestMode, isFreeProShop } from "~/shopify.server";

export const FREE_MONTHLY_IMPORT_LIMIT = 30;
export const FREE_MONTHLY_DELETE_LIMIT = 5;

export type AppPlan = "FREE" | "PRO";
export type PlanSource = "FREE" | "BILLING" | "FREE_PARTNER";

export type ShopEntitlements = {
  plan: AppPlan;
  planSource: PlanSource;
  isPro: boolean;
};

export class PlanLimitError extends Error {
  status = 429;

  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export async function syncAdminEntitlements(shopDomain: string, billing: any): Promise<ShopEntitlements> {
  if (isFreeProShop(shopDomain)) {
    await persistPlan(shopDomain, "PRO");
    return { plan: "PRO", planSource: "FREE_PARTNER", isPro: true };
  }

  const persistedEntitlements = await getShopEntitlements(shopDomain);

  try {
    const check = await billing.check({ plans: [PRO_PLAN], isTest: isBillingTestMode() });
    const plan: AppPlan = check.hasActivePayment ? "PRO" : "FREE";
    await persistPlan(shopDomain, plan);

    return {
      plan,
      planSource: plan === "PRO" ? "BILLING" : "FREE",
      isPro: plan === "PRO"
    };
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

export async function getShopEntitlements(shopDomain: string): Promise<ShopEntitlements> {
  if (isFreeProShop(shopDomain)) {
    return { plan: "PRO", planSource: "FREE_PARTNER", isPro: true };
  }

  const subscription = await prisma.subscriptionSettings.findUnique({
    where: { shopDomain },
    select: { plan: true }
  });
  const plan: AppPlan = subscription?.plan === "PRO" ? "PRO" : "FREE";

  return {
    plan,
    planSource: plan === "PRO" ? "BILLING" : "FREE",
    isPro: plan === "PRO"
  };
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
  await prisma.shop.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } });
  await prisma.subscriptionSettings.upsert({
    where: { shopDomain },
    update: { plan },
    create: { shopDomain, plan }
  });
}
