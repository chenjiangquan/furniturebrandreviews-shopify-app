import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate, type ShouldRevalidateFunctionArgs } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  Checkbox,
  ColorPicker,
  InlineGrid,
  InlineStack,
  Page,
  Popover,
  RangeSlider,
  Text,
  TextField
} from "@shopify/polaris";
import * as React from "react";
import prisma from "~/db.server";
import { getProductReviewWidgetSettings } from "~/models/reviews.server";
import { authenticate } from "~/shopify.server";

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getProductReviewWidgetSettings(session.shop);
  return { settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const color = (name: string, fallback: string) => {
    const value = String(formData.get(name) || "").trim();
    return COLOR_PATTERN.test(value) ? value : fallback;
  };
  const number = (name: string, min: number, max: number, fallback: number) => {
    const value = Number(formData.get(name));
    return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
  };
  const data = {
    starRatingBadgeStarColor: color("starColor", "#f5a623"),
    starRatingBadgeTextColor: color("textColor", "#202223"),
    starRatingBadgeBackgroundColor: color("backgroundColor", "#ffffff"),
    starRatingBadgeBorderColor: color("borderColor", "#dfe3e8"),
    starRatingBadgeBorderWidth: number("borderWidth", 0, 4, 1),
    starRatingBadgeBorderRadius: number("borderRadius", 0, 24, 8),
    starRatingBadgeHideNoReviewProduct: formData.get("hideNoReviewProduct") === "true"
  };

  await prisma.productReviewSettings.upsert({
    where: { shopDomain: session.shop },
    update: data,
    create: { shopDomain: session.shop, ...data }
  });
  return { ok: true };
};

export default function StarRatingBadgeCustomize() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const [starColor, setStarColor] = React.useState(settings.starRatingBadgeStarColor);
  const [textColor, setTextColor] = React.useState(settings.starRatingBadgeTextColor);
  const [backgroundColor, setBackgroundColor] = React.useState(settings.starRatingBadgeBackgroundColor);
  const [borderColor, setBorderColor] = React.useState(settings.starRatingBadgeBorderColor);
  const [borderWidth, setBorderWidth] = React.useState(settings.starRatingBadgeBorderWidth);
  const [radius, setRadius] = React.useState(settings.starRatingBadgeBorderRadius);
  const [hideNoReviewProduct, setHideNoReviewProduct] = React.useState(settings.starRatingBadgeHideNoReviewProduct);
  const saving = fetcher.state !== "idle";

  return (
    <Page fullWidth title="Star Rating Badge" backAction={{ content: "Widgets Settings", onAction: () => navigate("/app/widgets-settings") }}>
      <InlineGrid columns={{ xs: 1, md: "360px 1fr" }} gap="500">
        <fetcher.Form method="post">
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Settings</Text>
                {fetcher.data?.ok ? <Badge tone="success">Saved</Badge> : null}
              </InlineStack>
              <ColorField label="Star color" name="starColor" value={starColor} onChange={setStarColor} />
              <ColorField label="Text color" name="textColor" value={textColor} onChange={setTextColor} />
              <ColorField label="Background color" name="backgroundColor" value={backgroundColor} onChange={setBackgroundColor} />
              <ColorField label="Border color" name="borderColor" value={borderColor} onChange={setBorderColor} />
              <input type="hidden" name="borderWidth" value={borderWidth} />
              <RangeSlider label="Border size" min={0} max={4} value={borderWidth} onChange={(value) => setBorderWidth(Number(value))} output />
              <input type="hidden" name="borderRadius" value={radius} />
              <RangeSlider label="Border radius" min={0} max={24} value={radius} onChange={(value) => setRadius(Number(value))} output />
              <input type="hidden" name="hideNoReviewProduct" value={String(hideNoReviewProduct)} />
              <Checkbox label="Hide no review product" checked={hideNoReviewProduct} onChange={setHideNoReviewProduct} />
              <Button submit variant="primary" loading={saving}>Save</Button>
            </BlockStack>
          </Card>
        </fetcher.Form>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="p" tone="subdued">Live preview</Text>
              <Badge tone="success">Installed</Badge>
            </InlineStack>
            <div style={{ display: "inline-flex", gap: 8, alignItems: "center", width: "fit-content", background: backgroundColor, border: `${borderWidth}px solid ${borderColor}`, borderRadius: radius, padding: "10px 14px", color: textColor }}>
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

export const shouldRevalidate = ({ formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) =>
  formMethod ? false : defaultShouldRevalidate;

function ColorField({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (value: string) => void }) {
  const [active, setActive] = React.useState(false);
  return (
    <InlineStack gap="200" blockAlign="end" wrap={false}>
      <Popover
        active={active}
        onClose={() => setActive(false)}
        activator={<button type="button" onClick={() => setActive((open) => !open)} aria-label={`Choose ${label}`} style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #dfe3e8", background: normalizeHex(value), cursor: "pointer" }} />}
      >
        <Popover.Section>
          <ColorPicker color={hexToHsb(value)} onChange={(next) => onChange(hsbToHex(next))} />
        </Popover.Section>
      </Popover>
      <div style={{ flex: 1 }}>
        <TextField label={label} name={name} value={value} onFocus={() => setActive(true)} onChange={onChange} autoComplete="off" />
      </div>
    </InlineStack>
  );
}

function StarRatingPreview({ rating, starColor }: { rating: number; starColor: string }) {
  const normalizedRating = Math.max(0, Math.min(5, Number(rating) || 0));
  const size = 18;
  return (
    <span style={{ display: "inline-flex", lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map((item) => {
        const fill = Math.max(0, Math.min(1, normalizedRating - (item - 1))) * 100;
        return (
          <span key={item} style={{ color: "#d8dde3", display: "inline-flex", height: size, lineHeight: 1, marginLeft: item === 1 ? 0 : 2, overflow: "hidden", position: "relative", width: size }}>
            <RoundedStarIcon size={size} />
            <span aria-hidden="true" style={{ color: starColor, inset: 0, overflow: "hidden", position: "absolute", width: `${fill}%` }}>
              <span style={{ display: "inline-flex", height: size, width: size }}><RoundedStarIcon size={size} /></span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

function RoundedStarIcon({ size }: { size: number }) {
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flex: "0 0 auto" }}><path fill="currentColor" d="M12 3.1c.35 0 .66.2.82.52l1.9 3.83c.14.29.42.49.74.54l4.23.61c.35.05.64.29.75.62.11.34.02.7-.23.95l-3.06 2.98c-.23.22-.33.55-.28.86l.72 4.21c.06.35-.08.7-.37.91-.28.21-.66.23-.97.07l-3.78-1.99a1.02 1.02 0 0 0-.94 0l-3.78 1.99c-.31.16-.69.14-.97-.07a.93.93 0 0 1-.37-.91l.72-4.21c.05-.31-.05-.64-.28-.86l-3.06-2.98a.91.91 0 0 1-.23-.95c.11-.33.4-.57.75-.62l4.23-.61c.32-.05.6-.25.74-.54l1.9-3.83c.16-.32.47-.52.82-.52Z" /></svg>;
}

function hexToHsb(hex: string) {
  const normalized = normalizeHex(hex);
  const [red, green, blue] = [normalized.slice(1, 3), normalized.slice(3, 5), normalized.slice(5, 7)].map((part) => parseInt(part, 16) / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { hue, saturation: max === 0 ? 0 : delta / max, brightness: max, alpha: 1 };
}

function hsbToHex(color: { hue: number; saturation: number; brightness: number }) {
  const chroma = color.brightness * color.saturation;
  const huePrime = color.hue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let [red, green, blue] = [0, 0, 0];
  if (huePrime < 1) [red, green, blue] = [chroma, x, 0];
  else if (huePrime < 2) [red, green, blue] = [x, chroma, 0];
  else if (huePrime < 3) [red, green, blue] = [0, chroma, x];
  else if (huePrime < 4) [red, green, blue] = [0, x, chroma];
  else if (huePrime < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];
  const match = color.brightness - chroma;
  return `#${[red, green, blue].map((value) => Math.round((value + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function normalizeHex(value: string) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${value.slice(1).split("").map((char) => char + char).join("")}`;
  return "#000000";
}
