import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import * as React from "react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Page,
  Text
} from "@shopify/polaris";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.googleSeoSettings.upsert({
    where: { shopDomain: session.shop },
    update: {},
    create: { shopDomain: session.shop }
  });

  return { settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
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
  const { settings } = useLoaderData<typeof loader>();
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
      <fetcher.Form method="post">
        <input type="hidden" name="seoRichSnippetsEnabled" value={draft.seoRichSnippetsEnabled ? "on" : ""} />
        <input type="hidden" name="googleShoppingEnabled" value={draft.googleShoppingEnabled ? "on" : ""} />
        <input type="hidden" name="reviewsSiteEnabled" value={draft.reviewsSiteEnabled ? "on" : ""} />
        <BlockStack gap="500">
          <InlineStack align="space-between" blockAlign="center" gap="300">
            <Button onClick={() => navigate("/app/widgets-settings")}>Back to Widgets Settings</Button>
            {fetcher.data?.ok ? <Badge tone="success">Saved</Badge> : null}
          </InlineStack>

          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">Sell more with Furniture Brand Reviews</Text>
            <SettingRow
              title="Furniture Brand Reviews Site"
              description="Get featured on the Furniture Brand Reviews platform to showcase your products and reviews to more shoppers, improve SEO and increase conversions."
              checked={draft.reviewsSiteEnabled}
              onChange={(value) => setValue("reviewsSiteEnabled", value)}
            />
          </BlockStack>

          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">Google and SEO</Text>
            <SettingRow
              title="SEO Rich Snippets"
              description="Add published review ratings to Product structured data when the Product Reviews Widget or Product Star Rating is installed."
              checked={draft.seoRichSnippetsEnabled}
              onChange={(value) => setValue("seoRichSnippetsEnabled", value)}
            />
            <SettingRow
              title="Google Shopping"
              description="Boost your Google product listings with aggregated star ratings and review counts."
              checked={draft.googleShoppingEnabled}
              onChange={(value) => setValue("googleShoppingEnabled", value)}
            />
          </BlockStack>

          <Card>
            <InlineStack gap="300" blockAlign="center">
              <Button submit variant="primary" loading={saving}>Save settings</Button>
            </InlineStack>
          </Card>
        </BlockStack>
      </fetcher.Form>
    </Page>
  );
}

function SettingRow({
  title,
  description,
  checked,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
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
        <SlideSwitch checked={checked} onChange={onChange} label={title} />
      </InlineStack>
    </Card>
  );
}

function SlideSwitch({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label}: ${checked ? "On" : "Off"}`}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 48,
        height: 28,
        flex: "0 0 auto",
        border: "none",
        borderRadius: 999,
        padding: 3,
        cursor: "pointer",
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
