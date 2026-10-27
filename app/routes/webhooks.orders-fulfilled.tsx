import type { ActionFunctionArgs } from "@remix-run/node";
import { scheduleReviewInvitationForFulfilledOrder } from "~/models/review-invitations.server";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const result = await scheduleReviewInvitationForFulfilledOrder(shop, payload);
  console.log("[review-invitations] fulfilled order processed", {
    shop,
    state: result.state,
    invitationId: "invitation" in result && result.invitation ? result.invitation.id : null
  });
  return new Response();
};
