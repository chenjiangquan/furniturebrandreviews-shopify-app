import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import * as React from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  InlineGrid,
  InlineStack,
  Page,
  Text,
  TextField
} from "@shopify/polaris";
import prisma from "~/db.server";
import { getShopEntitlements } from "~/models/entitlements.server";
import {
  cancelReviewInvitation,
  FREE_MONTHLY_INVITATION_LIMIT,
  getReviewInvitationSettings,
  PRO_MONTHLY_INVITATION_LIMIT,
  saveReviewInvitationSettings,
  sendReviewInvitationNow
} from "~/models/review-invitations.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const [settings, entitlements, invitations, groupedStatuses, elapsedScheduled] = await Promise.all([
    getReviewInvitationSettings(shopDomain),
    getShopEntitlements(shopDomain),
    prisma.reviewInvitation.findMany({
      where: { shopDomain },
      include: { items: { include: { review: true } } },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.reviewInvitation.groupBy({
      by: ["status"],
      where: { shopDomain },
      _count: { _all: true }
    }),
    prisma.reviewInvitation.count({
      where: { shopDomain, status: "SCHEDULED", scheduledAt: { lte: new Date() } }
    })
  ]);
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const monthlyUsage = await prisma.reviewInvitation.count({
    where: {
      shopDomain,
      createdAt: { gte: monthStart },
      status: { notIn: ["SKIPPED", "CANCELLED", "UNSUBSCRIBED"] }
    }
  });
  const statusCounts = Object.fromEntries(groupedStatuses.map((row) => [row.status, row._count._all]));
  const reviewed = statusCounts.REVIEWED || 0;
  const sent = elapsedScheduled + ["SENT", "DELIVERED", "OPENED", "CLICKED", "IN_PROGRESS", "REVIEWED"]
    .reduce((total, status) => total + (statusCounts[status] || 0), 0);

  return {
    settings,
    isPro: entitlements.isPro,
    hasOrderScope: String(session.scope || "").split(",").includes("read_orders"),
    monthlyUsage,
    monthlyLimit: entitlements.isPro ? PRO_MONTHLY_INVITATION_LIMIT : FREE_MONTHLY_INVITATION_LIMIT,
    stats: {
      scheduled: Math.max(0, (statusCounts.SCHEDULED || 0) - elapsedScheduled),
      sent,
      delivered: statusCounts.DELIVERED || 0,
      clicked: statusCounts.CLICKED || 0,
      reviewed,
      conversionRate: sent ? Math.round((reviewed / sent) * 1000) / 10 : 0
    },
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      orderName: invitation.orderName,
      customerEmail: invitation.customerEmail,
      status: invitation.status,
      skipReason: invitation.skipReason,
      scheduledAt: invitation.scheduledAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      productNames: invitation.items.map((item) => item.productTitle),
      reviewedCount: invitation.items.filter((item) => item.review).length,
      productCount: invitation.items.length
    }))
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  try {
    if (intent === "sendNow") {
      await sendReviewInvitationNow(session.shop, String(form.get("invitationId") || ""));
      return { ok: true, intent, message: "Review invitation sent.", error: "" };
    }
    if (intent === "cancel") {
      await cancelReviewInvitation(session.shop, String(form.get("invitationId") || ""));
      return { ok: true, intent, message: "Review invitation cancelled.", error: "" };
    }
    if (intent !== "save") {
      return { ok: false, intent, message: "", error: "Unsupported action." };
    }

    const hasOrderScope = String(session.scope || "").split(",").includes("read_orders");
    const entitlements = await getShopEntitlements(session.shop);
    const enabled = form.get("enabled") === "true";
    if (enabled && !hasOrderScope) {
      return {
        ok: false,
        intent,
        message: "",
        error: "Approve Shopify order access before enabling automatic invitations."
      };
    }
    const delayDays = clampNumber(form.get("delayDays"), 1, 21, 14);
    const reminderDays = clampNumber(form.get("reminderDays"), 1, 7, 7);
    const emailSubject = requiredText(form.get("emailSubject"), 160, "Email subject");
    const emailHeading = requiredText(form.get("emailHeading"), 160, "Email heading");
    const emailBody = requiredText(form.get("emailBody"), 1000, "Email message");
    await saveReviewInvitationSettings(session.shop, {
      enabled,
      delayDays,
      reminderEnabled: entitlements.isPro && form.get("reminderEnabled") === "true",
      reminderDays,
      emailSubject,
      emailHeading,
      emailBody
    });
    return { ok: true, intent, message: "Review invitation settings saved.", error: "" };
  } catch (error) {
    if (error instanceof Response) {
      return { ok: false, intent, message: "", error: await error.text() };
    }
    console.error("Review invitation action failed", error);
    return {
      ok: false,
      intent,
      message: "",
      error: error instanceof Error ? error.message : "Review invitation action failed."
    };
  }
};

export default function ReviewInvitationsPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [enabled, setEnabled] = React.useState(data.settings.enabled);
  const [reminderEnabled, setReminderEnabled] = React.useState(data.settings.reminderEnabled && data.isPro);
  const [delayDays, setDelayDays] = React.useState(String(data.settings.delayDays));
  const [reminderDays, setReminderDays] = React.useState(String(data.settings.reminderDays));
  const [emailSubject, setEmailSubject] = React.useState(data.settings.emailSubject);
  const [emailHeading, setEmailHeading] = React.useState(data.settings.emailHeading);
  const [emailBody, setEmailBody] = React.useState(data.settings.emailBody);
  const busy = navigation.state !== "idle";

  return (
    <Page fullWidth title="Review Invitations" subtitle="Automatically ask verified customers to review products after fulfillment.">
      <BlockStack gap="500">
        {!data.hasOrderScope ? (
          <Banner title="Shopify order access is required" tone="warning">
            <Text as="p">The new read_orders permission must be approved before automatic invitations can be enabled. Reopen or reinstall the app after the updated app version is released to approve it.</Text>
          </Banner>
        ) : null}
        {actionData?.error ? (
          <Banner title="Review invitations were not updated" tone="critical"><Text as="p">{actionData.error}</Text></Banner>
        ) : null}
        {actionData?.message ? (
          <Banner title={actionData.message} tone="success" />
        ) : null}

        <InlineGrid columns={{ xs: 2, sm: 3, md: 6 }} gap="300">
          <Metric label="Scheduled" value={data.stats.scheduled} />
          <Metric label="Sent" value={data.stats.sent} />
          <Metric label="Delivered" value={data.stats.delivered} />
          <Metric label="Clicked" value={data.stats.clicked} />
          <Metric label="Reviews" value={data.stats.reviewed} />
          <Metric label="Conversion" value={`${data.stats.conversionRate}%`} />
        </InlineGrid>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center" gap="300">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Monthly invitation allowance</Text>
                <Text as="p" tone="subdued">{data.monthlyUsage} of {data.monthlyLimit} invitations used this UTC month.</Text>
              </BlockStack>
              <Badge tone={data.isPro ? "success" : "info"}>{data.isPro ? "Pro · 500/month" : "Free · 30/month"}</Badge>
            </InlineStack>
          </BlockStack>
        </Card>

        <Form method="post">
          <input type="hidden" name="intent" value="save" />
          <input type="hidden" name="enabled" value={String(enabled)} />
          <input type="hidden" name="reminderEnabled" value={String(reminderEnabled)} />
          <Card>
            <BlockStack gap="500">
              <BlockStack gap="200">
                <Text as="h2" variant="headingLg">Automatic requests</Text>
                <Checkbox
                  label="Send a review invitation after an order is fulfilled"
                  checked={enabled}
                  disabled={!data.hasOrderScope}
                  onChange={setEnabled}
                />
              </BlockStack>
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                <TextField
                  label="Send after fulfillment"
                  name="delayDays"
                  type="number"
                  min={1}
                  max={21}
                  suffix="days"
                  value={delayDays}
                  onChange={setDelayDays}
                  autoComplete="off"
                  helpText="Between 1 and 21 days. The recommended starting point is 14 days."
                />
                <BlockStack gap="200">
                  <Checkbox
                    label="Send one reminder"
                    checked={reminderEnabled}
                    disabled={!data.isPro}
                    onChange={setReminderEnabled}
                    helpText={data.isPro ? "The reminder is cancelled automatically after a review is submitted." : "Reminder emails are available on Pro."}
                  />
                  <TextField
                    label="Reminder delay"
                    name="reminderDays"
                    type="number"
                    min={1}
                    max={7}
                    suffix="days"
                    value={reminderDays}
                    onChange={setReminderDays}
                    disabled={!reminderEnabled}
                    autoComplete="off"
                  />
                </BlockStack>
              </InlineGrid>
              <TextField label="Email subject" name="emailSubject" value={emailSubject} onChange={setEmailSubject} maxLength={160} autoComplete="off" />
              <TextField label="Email heading" name="emailHeading" value={emailHeading} onChange={setEmailHeading} maxLength={160} autoComplete="off" />
              <TextField label="Email message" name="emailBody" value={emailBody} onChange={setEmailBody} maxLength={1000} multiline={4} autoComplete="off" />
              <InlineStack align="end">
                <Button submit variant="primary" loading={busy}>Save settings</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Form>

        <Card padding="0">
          <div style={{ padding: 20 }}><Text as="h2" variant="headingLg">Invitation history</Text></div>
          {data.invitations.length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", minWidth: 900, width: "100%" }}>
                <thead><tr>{["Customer", "Order", "Products", "Scheduled", "Status", "Actions"].map((heading) => <th key={heading} style={headerCell}>{heading}</th>)}</tr></thead>
                <tbody>
                  {data.invitations.map((invitation) => (
                    <tr key={invitation.id}>
                      <td style={cell}><Text as="span" variant="bodyMd">{invitation.customerEmail}</Text></td>
                      <td style={cell}>{invitation.orderName || "—"}</td>
                      <td style={cell} title={invitation.productNames.join(", ")}>{invitation.productNames.join(", ").slice(0, 70) || "—"}</td>
                      <td style={cell}>{formatDate(invitation.scheduledAt)}</td>
                      <td style={cell}>
                        <BlockStack gap="100">
                          <Badge tone={statusTone(invitation.status)}>{displayStatus(invitation.status, invitation.scheduledAt)}</Badge>
                          {invitation.skipReason ? <Text as="span" tone="subdued" variant="bodySm">{invitation.skipReason}</Text> : null}
                          {invitation.reviewedCount ? <Text as="span" tone="subdued" variant="bodySm">{invitation.reviewedCount}/{invitation.productCount} products reviewed</Text> : null}
                        </BlockStack>
                      </td>
                      <td style={cell}>
                        <InlineStack gap="200" wrap={false}>
                          {canSend(invitation.status, invitation.scheduledAt) ? <InvitationAction intent="sendNow" invitationId={invitation.id} label="Send now" /> : null}
                          {canCancel(invitation.status, invitation.scheduledAt) ? <InvitationAction intent="cancel" invitationId={invitation.id} label="Cancel" tone="critical" /> : null}
                        </InlineStack>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ borderTop: "1px solid #e1e3e5", padding: 28 }}>
              <Text as="p" tone="subdued">No invitations yet. After automatic requests are enabled, newly fulfilled Shopify orders will appear here.</Text>
            </div>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <Card><BlockStack gap="100"><Text as="p" tone="subdued" variant="bodySm">{label}</Text><Text as="p" variant="headingLg">{value}</Text></BlockStack></Card>;
}

function InvitationAction({ intent, invitationId, label, tone }: { intent: string; invitationId: string; label: string; tone?: "critical" }) {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <Button submit size="slim" tone={tone}>{label}</Button>
    </Form>
  );
}

function clampNumber(value: FormDataEntryValue | null, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function requiredText(value: FormDataEntryValue | null, max: number, label: string) {
  const text = String(value || "").trim();
  if (!text) throw new Response(`${label} is required.`, { status: 400 });
  if (text.length > max) throw new Response(`${label} must be ${max} characters or fewer.`, { status: 400 });
  return text;
}

function canSend(status: string, scheduledAt: string) {
  return status === "FAILED" || status === "SCHEDULING" || (status === "SCHEDULED" && new Date(scheduledAt).getTime() > Date.now());
}

function canCancel(status: string, scheduledAt: string) {
  return status === "FAILED" || status === "SCHEDULING" || (status === "SCHEDULED" && new Date(scheduledAt).getTime() > Date.now());
}

function displayStatus(status: string, scheduledAt: string) {
  if (status === "SCHEDULED" && new Date(scheduledAt).getTime() <= Date.now()) return "Sent";
  return status.toLowerCase().replaceAll("_", " ").replace(/^./u, (letter) => letter.toUpperCase());
}

function statusTone(status: string): "success" | "info" | "attention" | "critical" | undefined {
  if (["REVIEWED", "DELIVERED"].includes(status)) return "success";
  if (["SCHEDULED", "SENT", "OPENED", "CLICKED", "IN_PROGRESS"].includes(status)) return "info";
  if (["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"].includes(status)) return "critical";
  if (["SKIPPED", "CANCELLED", "UNSUBSCRIBED"].includes(status)) return "attention";
  return undefined;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const headerCell: React.CSSProperties = { background: "#f7f8f8", borderTop: "1px solid #e1e3e5", borderBottom: "1px solid #e1e3e5", color: "#616a65", fontSize: 12, fontWeight: 700, padding: "12px 16px", textAlign: "left", textTransform: "uppercase" };
const cell: React.CSSProperties = { borderBottom: "1px solid #e1e3e5", color: "#303a35", fontSize: 14, padding: "14px 16px", verticalAlign: "top" };
