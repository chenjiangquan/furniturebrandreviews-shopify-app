import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Page,
  RangeSlider,
  Text,
  TextField
} from "@shopify/polaris";
import * as React from "react";
import { getProductReviewWidgetSettings } from "~/models/reviews.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getProductReviewWidgetSettings(session.shop);
  return { settings };
};

export default function StarRatingBadgeCustomize() {
  const [starColor, setStarColor] = React.useState("#f5a623");
  const [textColor, setTextColor] = React.useState("#202223");
  const [radius, setRadius] = React.useState(8);

  return (
    <Page fullWidth title="Star Rating Badge" backAction={{ content: "Widgets Settings", url: "/app/widgets-settings" }}>
      <InlineGrid columns={{ xs: 1, md: "360px 1fr" }} gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Settings</Text>
            <TextField label="Star color" value={starColor} onChange={setStarColor} autoComplete="off" />
            <TextField label="Text color" value={textColor} onChange={setTextColor} autoComplete="off" />
            <RangeSlider label="Border radius" min={0} max={24} value={radius} onChange={(value) => setRadius(Number(value))} output />
            <Button url="/app/widgets/review-widget" variant="primary">Open full widget settings</Button>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="p" tone="subdued">Live preview</Text>
              <Badge tone="success">Installed</Badge>
            </InlineStack>
            <div style={{ display: "inline-flex", gap: 8, alignItems: "center", width: "fit-content", border: "1px solid #dfe3e8", borderRadius: radius, padding: "10px 14px", color: textColor }}>
              <StarRatingPreview rating={4.7} starColor={starColor} />
              <strong>4.7</strong>
              <span>238 reviews</span>
            </div>
          </BlockStack>
        </Card>
      </InlineGrid>
    </Page>
  );
}

function StarRatingPreview({ rating, starColor }: { rating: number; starColor: string }) {
  const normalizedRating = Math.max(0, Math.min(5, Number(rating) || 0));
  const size = 18;
  const emptyColor = "#d8dde3";

  return (
    <span style={{ display: "inline-flex", lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map((item) => {
        const fill = Math.max(0, Math.min(1, normalizedRating - (item - 1))) * 100;
        return (
          <span
            key={item}
            style={{
              alignItems: "center",
              background: "transparent",
              color: emptyColor,
              display: "inline-flex",
              height: size,
              justifyContent: "center",
              lineHeight: 1,
              marginLeft: item === 1 ? 0 : 2,
              overflow: "hidden",
              position: "relative",
              width: size
            }}
          >
            <RoundedStarIcon size={size} />
            <span
              aria-hidden="true"
              style={{
                background: "transparent",
                color: starColor,
                display: "block",
                inset: 0,
                overflow: "hidden",
                position: "absolute",
                width: `${fill}%`
              }}
            >
              <span
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  height: size,
                  justifyContent: "center",
                  width: size
                }}
              >
                <RoundedStarIcon size={size} />
              </span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

function RoundedStarIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flex: "0 0 auto" }}>
      <path
        fill="currentColor"
        d="M12 3.1c.35 0 .66.2.82.52l1.9 3.83c.14.29.42.49.74.54l4.23.61c.35.05.64.29.75.62.11.34.02.7-.23.95l-3.06 2.98c-.23.22-.33.55-.28.86l.72 4.21c.06.35-.08.7-.37.91-.28.21-.66.23-.97.07l-3.78-1.99a1.02 1.02 0 0 0-.94 0l-3.78 1.99c-.31.16-.69.14-.97-.07a.93.93 0 0 1-.37-.91l.72-4.21c.05-.31-.05-.64-.28-.86l-3.06-2.98a.91.91 0 0 1-.23-.95c.11-.33.4-.57.75-.62l4.23-.61c.32-.05.6-.25.74-.54l1.9-3.83c.16-.32.47-.52.82-.52Z"
      />
    </svg>
  );
}
