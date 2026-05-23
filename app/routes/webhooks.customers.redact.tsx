import type { ActionFunctionArgs } from "@remix-run/node";
import { handleCustomersRedact } from "~/models/gdpr.server";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  await handleCustomersRedact(shop, payload);

  return new Response();
};
