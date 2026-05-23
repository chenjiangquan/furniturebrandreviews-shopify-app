import type { ActionFunctionArgs } from "@remix-run/node";
import { handleCustomersDataRequest } from "~/models/gdpr.server";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  await handleCustomersDataRequest(shop, payload);

  return new Response();
};
