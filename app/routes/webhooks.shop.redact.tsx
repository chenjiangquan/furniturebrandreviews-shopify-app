import type { ActionFunctionArgs } from "@remix-run/node";
import { handleShopRedact } from "~/models/gdpr.server";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  await handleShopRedact(shop);

  return new Response();
};
