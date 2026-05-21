import type { LoaderFunctionArgs } from "@remix-run/node";
import { corsJson, getBrandWidgetPayload, requiredString } from "~/models/reviews.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = requiredString(url.searchParams.get("shop"), "shop");
  const payload = await getBrandWidgetPayload(shop);
  return corsJson(payload);
};
