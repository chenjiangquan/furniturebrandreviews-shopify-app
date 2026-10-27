import type { ActionFunctionArgs } from "@remix-run/node";
import { handleAppUninstalled } from "~/models/gdpr.server";
import { cancelAllScheduledReviewInvitations } from "~/models/review-invitations.server";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  await cancelAllScheduledReviewInvitations(shop);
  await handleAppUninstalled(shop);

  return new Response();
};
