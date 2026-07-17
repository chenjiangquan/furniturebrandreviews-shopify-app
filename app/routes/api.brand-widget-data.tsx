import type { LoaderFunctionArgs } from "@remix-run/node";
import { corsJson, getBrandWidgetPayload, requiredString } from "~/models/reviews.server";
import { getShopEntitlements } from "~/models/entitlements.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = requiredString(url.searchParams.get("shop"), "shop");
  const entitlements = await getShopEntitlements(shop);
  if (!entitlements.isPro) return corsJson({ locked: true }, { status: 402 });
  const payload = await getBrandWidgetPayload(shop);
  return corsJson(payload);
};
