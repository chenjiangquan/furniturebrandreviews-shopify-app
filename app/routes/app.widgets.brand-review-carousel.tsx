import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Text,
  TextField
} from "@shopify/polaris";
import * as React from "react";
import { getBrandWidgetPayload } from "~/models/reviews.server";
import { authenticate } from "~/shopify.server";
import { syncAdminEntitlements } from "~/models/entitlements.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const entitlements = await syncAdminEntitlements(session.shop, billing);
  if (!entitlements.isPro) throw redirect("/app/widgets-settings");
  return getBrandWidgetPayload(session.shop);
};

export default function BrandReviewCarouselCustomize() {
  const [primaryColor, setPrimaryColor] = React.useState("#1f6f64");
  const [starColor, setStarColor] = React.useState("#f5a623");
  const [layout, setLayout] = React.useState("carousel");

  return (
    <Page fullWidth title="Brand Review Carousel" backAction={{ content: "Widgets Settings", url: "/app/widgets-settings" }}>
      <InlineGrid columns={{ xs: 1, md: "360px 1fr" }} gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Settings</Text>
            <TextField label="Primary color" value={primaryColor} onChange={setPrimaryColor} autoComplete="off" />
            <TextField label="Star color" value={starColor} onChange={setStarColor} autoComplete="off" />
            <Select label="Layout" value={layout} onChange={setLayout} options={[
              { label: "Carousel", value: "carousel" },
              { label: "Compact", value: "compact" },
              { label: "Grid", value: "grid" }
            ]} />
            <Button url="/app/widgets-settings" variant="primary">Done</Button>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="p" tone="subdued">Live preview</Text>
              <Badge tone="success">Installed</Badge>
            </InlineStack>
            <div style={{ display: "grid", gridTemplateColumns: layout === "grid" ? "1fr 1fr" : "repeat(3, minmax(220px, 1fr))", gap: 12, overflow: "hidden" }}>
              {["Beautiful furniture and careful delivery", "Solid quality", "Helpful customer service"].map((title, index) => (
                <div key={title} style={{ border: "1px solid #dfe3e8", borderRadius: 8, padding: 14 }}>
                  <span style={{ color: starColor }}>★★★★★</span>
                  <Text as="h3" variant="headingSm">{title}</Text>
                  <Text as="p" tone="subdued">{index === 1 ? "Delivery tracking could be clearer, but the table feels sturdy." : "The team kept us updated and the product matched expectations."}</Text>
                  <span style={{ color: primaryColor, fontWeight: 600 }}>Verified</span>
                </div>
              ))}
            </div>
          </BlockStack>
        </Card>
      </InlineGrid>
    </Page>
  );
}
