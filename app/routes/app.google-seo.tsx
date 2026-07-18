import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Link as RemixLink, useFetcher, useLoaderData, useNavigate, type ShouldRevalidateFunctionArgs } from "@remix-run/react";
import * as React from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Page,
  Text
} from "@shopify/polaris";
import prisma from "~/db.server";
import { invalidateAdminLoaderCache } from "~/models/admin-loader-cache.server";
import { buildShopifyPlanSelectionUrl, getShopEntitlements } from "~/models/entitlements.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [entitlements, settings] = await Promise.all([
    getShopEntitlements(session.shop),
    prisma.googleSeoSettings.findUnique({ where: { shopDomain: session.shop } })
  ]);

  return {
    settings: settings || {
      reviewsSiteEnabled: false,
      seoRichSnippetsEnabled: false,
      googleShoppingEnabled: false
    },
    entitlements,
    upgradeUrl: buildShopifyPlanSelectionUrl(session.shop)
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  invalidateAdminLoaderCache(session.shop);
  const entitlements = await getShopEntitlements(session.shop);
  if (!entitlements.isPro) {
    return { ok: false, error: "Google and SEO settings require the Pro plan." };
  }
  const form = await request.formData();
  await prisma.googleSeoSettings.upsert({
    where: { shopDomain: session.shop },
    update: {
      seoRichSnippetsEnabled: form.get("seoRichSnippetsEnabled") === "on",
      googleShoppingEnabled: form.get("googleShoppingEnabled") === "on",
      reviewsSiteEnabled: form.get("reviewsSiteEnabled") === "on"
    },
    create: {
      shopDomain: session.shop,
      seoRichSnippetsEnabled: form.get("seoRichSnippetsEnabled") === "on",
      googleShoppingEnabled: form.get("googleShoppingEnabled") === "on",
      reviewsSiteEnabled: form.get("reviewsSiteEnabled") === "on"
    }
  });

  return { ok: true };
};

export default function GoogleSeoSettings() {
  const { settings, entitlements, upgradeUrl } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const [draft, setDraft] = React.useState({
    seoRichSnippetsEnabled: settings.seoRichSnippetsEnabled,
    googleShoppingEnabled: settings.googleShoppingEnabled,
    reviewsSiteEnabled: settings.reviewsSiteEnabled
  });
  const saving = fetcher.state !== "idle";

  const setValue = (key: keyof typeof draft, value: boolean) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <Page
      fullWidth
      title="Google and SEO"
      subtitle="Manage review visibility settings for search, rich snippets, and review feeds."
      backAction={{ content: "Widgets Settings", onAction: () => navigate("/app/widgets-settings") }}
    >
      <RemixLink to="/app/widgets-settings" prefetch="render" aria-hidden tabIndex={-1} style={{ display: "none" }} />
      <fetcher.Form method="post">
        <input type="hidden" name="seoRichSnippetsEnabled" value={draft.seoRichSnippetsEnabled ? "on" : ""} />
        <input type="hidden" name="googleShoppingEnabled" value={draft.googleShoppingEnabled ? "on" : ""} />
        <input type="hidden" name="reviewsSiteEnabled" value={draft.reviewsSiteEnabled ? "on" : ""} />
        <BlockStack gap="500">
          {!entitlements.isPro ? (
            <Banner title="Google and SEO requires Pro" tone="info" action={{ content: "Upgrade to Pro", onAction: () => window.open(upgradeUrl, "_top") }}>
              <Text as="p">Upgrade to enable SEO Rich Snippets, Google Shopping, and Furniture Brand Reviews discovery features.</Text>
            </Banner>
          ) : null}
          {fetcher.data?.ok ? (
            <InlineStack align="end">
              <Badge tone="success">Saved</Badge>
            </InlineStack>
          ) : null}

          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">Sell more with Furniture Brand Reviews</Text>
            <SettingRow
              title="Furniture Brand Reviews Site"
              description="Get featured on the Furniture Brand Reviews platform to showcase your products and reviews to more shoppers, improve SEO and increase conversions."
              checked={draft.reviewsSiteEnabled}
              disabled={!entitlements.isPro}
              onChange={(value) => setValue("reviewsSiteEnabled", value)}
            />
          </BlockStack>

          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">Google and SEO</Text>
            <SettingRow
              title="SEO Rich Snippets"
              description="Add published review ratings to Product structured data when the Product Reviews Widget or Product Star Rating is installed."
              checked={draft.seoRichSnippetsEnabled}
              disabled={!entitlements.isPro}
              onChange={(value) => setValue("seoRichSnippetsEnabled", value)}
            />
            {entitlements.isPro && draft.seoRichSnippetsEnabled ? (
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">Verify SEO Rich Snippets</Text>
                  <Text as="p" tone="subdued">
                    Open Google Rich Results Test, enter a live product URL that has the Review Widget or Star Rating Badge installed and at least one published review, then confirm that Product contains aggregateRating.
                  </Text>
                  <div>
                    <Button url="https://search.google.com/test/rich-results" target="_blank">Open Google Rich Results Test</Button>
                  </div>
                </BlockStack>
              </Card>
            ) : null}
            <SettingRow
              title="Google Shopping"
              description="Boost your Google product listings with aggregated star ratings and review counts."
              checked={draft.googleShoppingEnabled}
              disabled={!entitlements.isPro}
              onChange={(value) => setValue("googleShoppingEnabled", value)}
            />
          </BlockStack>

          <Card>
            <InlineStack gap="300" blockAlign="center">
              <Button submit variant="primary" loading={saving} disabled={!entitlements.isPro}>Save settings</Button>
            </InlineStack>
          </Card>
        </BlockStack>
      </fetcher.Form>
    </Page>
  );
}

export const shouldRevalidate = ({ formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) =>
  formMethod ? false : defaultShouldRevalidate;

function SettingRow({
  title,
  description,
  checked,
  onChange,
  disabled = false
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Card>
      <InlineStack align="space-between" blockAlign="center" gap="500" wrap={false}>
        <BlockStack gap="150">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h3" variant="headingMd">{title}</Text>
            <Badge tone={checked ? "success" : "attention"}>{checked ? "On" : "Off"}</Badge>
          </InlineStack>
          <Text as="p" tone="subdued">{description}</Text>
        </BlockStack>
        <SlideSwitch checked={checked} onChange={onChange} label={title} disabled={disabled} />
      </InlineStack>
    </Card>
  );
}

function SlideSwitch({
  checked,
  onChange,
  label,
  disabled = false
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label}: ${checked ? "On" : "Off"}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      style={{
        position: "relative",
        width: 48,
        height: 28,
        flex: "0 0 auto",
        border: "none",
        borderRadius: 999,
        padding: 3,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        background: checked ? "#008060" : "#c9cccf",
        transition: "background 160ms ease"
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "block",
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.24)",
          transform: checked ? "translateX(20px)" : "translateX(0)",
          transition: "transform 160ms ease"
        }}
      />
    </button>
  );
}
