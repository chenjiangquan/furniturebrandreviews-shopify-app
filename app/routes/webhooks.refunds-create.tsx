import type { ActionFunctionArgs } from "@remix-run/node";
import { cancelReviewInvitationsForOrder } from "~/models/review-invitations.server";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const orderId = String((payload as { order_id?: string | number }).order_id || "");
  if (orderId) await cancelReviewInvitationsForOrder(shop, orderId);
  return new Response();
};
