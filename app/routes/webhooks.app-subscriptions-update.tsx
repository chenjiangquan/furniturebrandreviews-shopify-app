import type { ActionFunctionArgs } from "@remix-run/node";
import { invalidateAdminLoaderCache } from "~/models/admin-loader-cache.server";
import { invalidateShopEntitlementsCache, persistWebhookEntitlements } from "~/models/entitlements.server";
import { authenticate, isFreeProShop } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const rawPayload = payload as Record<string, unknown>;
  const subscription = (
    rawPayload.app_subscription ||
    rawPayload.appSubscription ||
    rawPayload
  ) as Record<string, unknown>;
  const status = String(subscription.status || "").toUpperCase();
  const name = String(subscription.name || "").trim().toLowerCase();
  const isActivePro = status === "ACTIVE" && name === "pro";
  const plan = isFreeProShop(shop) || isActivePro ? "PRO" : "FREE";

  await persistWebhookEntitlements(shop, plan);
  invalidateShopEntitlementsCache(shop);
  invalidateAdminLoaderCache(shop);

  console.log("[billing] App subscription webhook synchronized", {
    shop,
    subscriptionName: name,
    subscriptionStatus: status,
    plan
  });

  return new Response();
};
