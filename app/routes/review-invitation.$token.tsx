import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useSearchParams } from "@remix-run/react";
import {
  createReviewFromInvitation,
  getPublicReviewInvitation
} from "~/models/review-invitations.server";

export const meta: MetaFunction = () => [
  { title: "Write a verified product review" },
  { name: "robots", content: "noindex,nofollow" }
];

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const token = String(params.token || "");
  const invitation = await getPublicReviewInvitation(token);
  return {
    storeName: invitation.shop.storeName || invitation.shopDomain,
    customerName: invitation.customerName,
    orderName: invitation.orderName,
    status: invitation.status,
    items: invitation.items.map((item) => ({
      id: item.id,
      productTitle: item.productTitle,
      variantTitle: item.variantTitle,
      reviewed: Boolean(item.review)
    }))
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const token = String(params.token || "");
  const form = await request.formData();
  const itemId = String(form.get("itemId") || "");
  const rating = Number(form.get("rating"));
  const title = String(form.get("title") || "").trim();
  const content = String(form.get("content") || "").trim();
  const customerName = String(form.get("customerName") || "").trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, itemId, error: "Choose a rating from 1 to 5 stars." };
  }
  if (title.length < 2 || title.length > 160) {
    return { ok: false, itemId, error: "Review title must be between 2 and 160 characters." };
  }
  if (content.length < 10 || content.length > 5000) {
    return { ok: false, itemId, error: "Review must be between 10 and 5,000 characters." };
  }
  if (customerName.length > 100) {
    return { ok: false, itemId, error: "Name must be 100 characters or fewer." };
  }

  await createReviewFromInvitation(token, {
    itemId,
    customerName,
    rating,
    title,
    content
  });
  return { ok: true, itemId, error: "" };
};

export default function ReviewInvitationPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const inactive = ["CANCELLED", "UNSUBSCRIBED", "SKIPPED"].includes(data.status);
  const allReviewed = data.items.every((item) => item.reviewed || (actionData?.ok && actionData.itemId === item.id));

  return (
    <main style={{ background: "#f4f6f5", color: "#17211d", minHeight: "100vh", padding: "32px 16px 64px" }}>
      <div style={{ margin: "0 auto", maxWidth: 720 }}>
        <header style={{ marginBottom: 24, textAlign: "center" }}>
          <img src="/branding/fbr-logo.png" alt="Furniture Brand Reviews" style={{ height: 48, maxWidth: "80%", objectFit: "contain" }} />
        </header>
        <section style={{ background: "#fff", border: "1px solid #dde5e1", borderRadius: 20, boxShadow: "0 12px 34px rgba(16,24,40,.08)", padding: "clamp(22px,5vw,42px)" }}>
          <div style={{ color: "#1f6f64", fontSize: 13, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>Verified purchase</div>
          <h1 style={{ fontSize: "clamp(28px,5vw,40px)", lineHeight: 1.12, margin: "10px 0 12px" }}>How was your purchase?</h1>
          <p style={{ color: "#52605a", fontSize: 16, lineHeight: 1.6, margin: 0 }}>
            Share your experience with {data.storeName}{data.orderName ? ` for order ${data.orderName}` : ""}.
          </p>

          {searchParams.get("unsubscribed") === "1" ? (
            <Notice>You've been unsubscribed from future review invitations.</Notice>
          ) : null}
          {inactive ? <Notice>This invitation is no longer active.</Notice> : null}
          {allReviewed ? <Notice>Thank you — your verified review has been published.</Notice> : null}

          <div style={{ display: "grid", gap: 20, marginTop: 28 }}>
            {data.items.map((item) => {
              const justSubmitted = Boolean(actionData?.ok && actionData.itemId === item.id);
              const reviewed = item.reviewed || justSubmitted;
              return (
                <article key={item.id} style={{ border: "1px solid #dde5e1", borderRadius: 16, padding: 20 }}>
                  <h2 style={{ fontSize: 20, lineHeight: 1.3, margin: 0 }}>{item.productTitle}</h2>
                  {item.variantTitle ? <p style={{ color: "#667085", margin: "5px 0 0" }}>{item.variantTitle}</p> : null}
                  {reviewed ? (
                    <p style={{ color: "#1f6f64", fontWeight: 700, margin: "18px 0 0" }}>✓ Review submitted</p>
                  ) : inactive ? null : (
                    <Form method="post" style={{ display: "grid", gap: 15, marginTop: 20 }}>
                      <input type="hidden" name="itemId" value={item.id} />
                      {actionData?.ok === false && actionData.itemId === item.id ? (
                        <div role="alert" style={{ background: "#fff4f4", border: "1px solid #efb5b5", borderRadius: 10, color: "#8e1f1f", padding: 12 }}>{actionData.error}</div>
                      ) : null}
                      <label style={labelStyle}>
                        Rating
                        <select name="rating" defaultValue="5" required style={inputStyle}>
                          <option value="5">★★★★★ — Excellent</option>
                          <option value="4">★★★★☆ — Good</option>
                          <option value="3">★★★☆☆ — Average</option>
                          <option value="2">★★☆☆☆ — Poor</option>
                          <option value="1">★☆☆☆☆ — Very poor</option>
                        </select>
                      </label>
                      <label style={labelStyle}>
                        Your name
                        <input name="customerName" defaultValue={data.customerName} maxLength={100} autoComplete="name" style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        Review title
                        <input name="title" minLength={2} maxLength={160} required style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        Review
                        <textarea name="content" minLength={10} maxLength={5000} rows={5} required style={{ ...inputStyle, resize: "vertical" }} />
                      </label>
                      <button type="submit" style={{ background: "#1f6f64", border: 0, borderRadius: 11, color: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 800, padding: "13px 18px" }}>Submit verified review</button>
                    </Form>
                  )}
                </article>
              );
            })}
          </div>
        </section>
        <p style={{ color: "#667085", fontSize: 12, lineHeight: 1.6, margin: "18px auto 0", textAlign: "center" }}>
          Reviews are published whether positive or negative. Your email address is never displayed publicly.
        </p>
      </div>
    </main>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "#edf8f3", border: "1px solid #a9d9c4", borderRadius: 12, color: "#155d45", fontWeight: 700, marginTop: 22, padding: 14 }}>{children}</div>;
}

const labelStyle: React.CSSProperties = {
  color: "#344054",
  display: "grid",
  fontSize: 14,
  fontWeight: 700,
  gap: 7
};

const inputStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #b9c4be",
  borderRadius: 9,
  boxSizing: "border-box",
  color: "#17211d",
  font: "inherit",
  padding: "11px 12px",
  width: "100%"
};
