import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { Form, redirect, useLoaderData } from "@remix-run/react";
import {
  getPublicReviewInvitation,
  unsubscribeReviewInvitation
} from "~/models/review-invitations.server";

export const meta: MetaFunction = () => [
  { title: "Unsubscribe from review invitations" },
  { name: "robots", content: "noindex,nofollow" }
];

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const invitation = await getPublicReviewInvitation(String(params.token || ""));
  return { storeName: invitation.shop.storeName || invitation.shopDomain };
};

export const action = async ({ params }: ActionFunctionArgs) => {
  const token = String(params.token || "");
  await unsubscribeReviewInvitation(token);
  return redirect(`/review-invitation/${encodeURIComponent(token)}?unsubscribed=1`);
};

export default function UnsubscribeReviewInvitationPage() {
  const data = useLoaderData<typeof loader>();
  return (
    <main style={{ background: "#f4f6f5", minHeight: "100vh", padding: "48px 16px" }}>
      <section style={{ background: "#fff", border: "1px solid #dde5e1", borderRadius: 18, boxShadow: "0 12px 34px rgba(16,24,40,.08)", margin: "0 auto", maxWidth: 560, padding: 36 }}>
        <h1 style={{ color: "#17211d", fontSize: 30, margin: "0 0 12px" }}>Stop review invitations?</h1>
        <p style={{ color: "#52605a", fontSize: 16, lineHeight: 1.6 }}>
          You will no longer receive product review invitation emails from {data.storeName}. This won't affect order or customer-service emails from the store.
        </p>
        <Form method="post">
          <button type="submit" style={{ background: "#1f6f64", border: 0, borderRadius: 10, color: "#fff", cursor: "pointer", fontSize: 15, fontWeight: 800, marginTop: 12, padding: "12px 18px" }}>Confirm unsubscribe</button>
        </Form>
      </section>
    </main>
  );
}
