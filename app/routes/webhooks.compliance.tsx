import type { ActionFunctionArgs } from "@remix-run/node";
import {
  handleCustomersDataRequest,
  handleCustomersRedact,
  handleShopRedact
} from "~/models/gdpr.server";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const normalizedTopic = String(topic || "").toLowerCase();

  if (normalizedTopic === "customers_data_request" || normalizedTopic === "customers/data_request") {
    await handleCustomersDataRequest(shop, payload);
    return new Response();
  }

  if (normalizedTopic === "customers_redact" || normalizedTopic === "customers/redact") {
    await handleCustomersRedact(shop, payload);
    return new Response();
  }

  if (normalizedTopic === "shop_redact" || normalizedTopic === "shop/redact") {
    await handleShopRedact(shop);
    return new Response();
  }

  console.error("[webhook] Unsupported compliance topic", { shop, topic });
  return new Response("Unsupported compliance topic.", { status: 400 });
};
