import type { ActionFunctionArgs } from "@remix-run/node";
import { Resend } from "resend";
import { recordReviewInvitationEmailEvent } from "~/models/review-invitations.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const webhookSecret = String(process.env.RESEND_WEBHOOK_SECRET || "").trim();
  if (!apiKey || !webhookSecret) {
    return new Response("Resend webhook is not configured.", { status: 503 });
  }

  const payload = await request.text();
  let event;
  try {
    event = new Resend(apiKey).webhooks.verify({
      payload,
      headers: {
        id: String(request.headers.get("svix-id") || ""),
        timestamp: String(request.headers.get("svix-timestamp") || ""),
        signature: String(request.headers.get("svix-signature") || "")
      },
      webhookSecret
    });
  } catch (error) {
    console.error("[review-invitations] invalid Resend webhook", error);
    return new Response("Invalid webhook signature.", { status: 401 });
  }

  if (event.type.startsWith("email.")) {
    const emailId = "email_id" in event.data ? String(event.data.email_id || "") : "";
    if (emailId) {
      await recordReviewInvitationEmailEvent({
        type: event.type,
        createdAt: new Date(event.created_at),
        emailId
      });
    }
  }
  return new Response();
};
