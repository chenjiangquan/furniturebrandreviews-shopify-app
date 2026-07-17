import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  BlockStack,
  Button,
  Card,
  InlineGrid,
  Page,
  Text
} from "@shopify/polaris";
import prisma from "~/db.server";
import { sendTestNotificationEmail, syncShopContactFromShopify } from "~/models/notifications.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  if (session.accessToken) {
    await syncShopContactFromShopify(shopDomain, session.accessToken);
  }
  const [widgetSettings, productSettings, brandData] = await Promise.all([
    prisma.widgetSettings.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } }),
    prisma.productReviewSettings.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } }),
    prisma.brandWidgetData.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } }),
    prisma.shop.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } })
  ]);
  const shop = await prisma.shop.upsert({ where: { shopDomain }, update: {}, create: { shopDomain } });
  return { widgetSettings, productSettings, brandData, shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const shopDomain = session.shop;
  const intent = String(form.get("intent") || "saveSettings");

  await Promise.all([
    prisma.widgetSettings.upsert({
      where: { shopDomain },
      update: {
        brandName: String(form.get("brandName") || ""),
        brandWebsite: String(form.get("brandWebsite") || ""),
        profileUrl: String(form.get("profileUrl") || ""),
        showAiSummary: form.get("showAiSummary") === "on",
        showTotalReviewCount: form.get("showTotalReviewCount") === "on",
        showRatingBreakdown: form.get("showRatingBreakdown") === "on",
        primaryColor: String(form.get("primaryColor") || "#1f6f64"),
        starColor: String(form.get("starColor") || "#f5a623"),
        borderRadius: Number(form.get("borderRadius") || 8),
        widgetLayout: String(form.get("widgetLayout") || "compact"),
        carouselAutoplay: form.get("carouselAutoplay") === "on",
        floatingBadgePosition: String(form.get("floatingBadgePosition") || "bottom-right")
      },
      create: { shopDomain }
    }),
    prisma.productReviewSettings.upsert({
      where: { shopDomain },
      update: {
        productReviewsEnabled: form.get("productReviewsEnabled") === "on",
        requireEmail: form.get("requireEmail") === "on",
        showVerifiedBadge: form.get("showVerifiedBadge") === "on",
        allowPhotoReviews: form.get("allowPhotoReviews") === "on",
        emailNotificationEnabled: form.get("emailNotificationEnabled") === "on"
      },
      create: { shopDomain }
    }),
    prisma.shop.upsert({
      where: { shopDomain },
      update: {
        notificationEmail: String(form.get("notificationEmail") || "").trim(),
        reviewEmailNotificationsEnabled: form.get("reviewEmailNotificationsEnabled") === "on",
        questionEmailNotificationsEnabled: form.get("questionEmailNotificationsEnabled") === "on"
      },
      create: {
        shopDomain,
        notificationEmail: String(form.get("notificationEmail") || "").trim(),
        reviewEmailNotificationsEnabled: form.get("reviewEmailNotificationsEnabled") === "on",
        questionEmailNotificationsEnabled: form.get("questionEmailNotificationsEnabled") === "on"
      }
    }),
    prisma.brandWidgetData.upsert({
      where: { shopDomain },
      update: {
        brandName: String(form.get("brandName") || ""),
        profileUrl: String(form.get("profileUrl") || ""),
        aiSummary: String(form.get("aiSummary") || "")
      },
      create: { shopDomain }
    })
  ]);

  if (intent === "sendTestEmail") {
    try {
      const result = await sendTestNotificationEmail(shopDomain);
      return { ok: true, id: result.id, message: "Test email sent.", error: "" };
    } catch (error) {
      console.error("Failed to send test notification email", error);
      return { ok: false, id: "", message: "", error: error instanceof Error ? error.message : "Test email failed." };
    }
  }

  return { ok: true, id: "", message: "Settings saved.", error: "" };
};

export default function Settings() {
  const { widgetSettings, productSettings, brandData, shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const notificationEmail = shop.notificationEmail || shop.storeEmail || shop.contactEmail || "";

  return (
    <Page title="Settings">
      <Form method="post">
        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <Field label="Brand name" name="brandName" value={widgetSettings.brandName} />
              <Field label="Brand website" name="brandWebsite" value={widgetSettings.brandWebsite || ""} type="url" />
              <Field label="FurnitureBrandReviews profile URL" name="profileUrl" value={widgetSettings.profileUrl} type="url" />
              <label><span>AI summary</span><textarea name="aiSummary" rows={4} defaultValue={brandData.aiSummary} /></label>
              <Check label="Show AI summary" name="showAiSummary" checked={widgetSettings.showAiSummary} />
              <Check label="Show total review count" name="showTotalReviewCount" checked={widgetSettings.showTotalReviewCount} />
              <Check label="Show rating breakdown" name="showRatingBreakdown" checked={widgetSettings.showRatingBreakdown} />
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Check label="Product reviews enabled" name="productReviewsEnabled" checked={productSettings.productReviewsEnabled} />
              <Check label="Require email" name="requireEmail" checked={productSettings.requireEmail} />
              <Check label="Show verified badge" name="showVerifiedBadge" checked={productSettings.showVerifiedBadge} />
              <Check label="Allow photo reviews" name="allowPhotoReviews" checked={productSettings.allowPhotoReviews} />
              <Check label="Email notification enabled" name="emailNotificationEnabled" checked={productSettings.emailNotificationEnabled} />
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Email notifications</Text>
              <Check label="Enable review notification email" name="reviewEmailNotificationsEnabled" checked={shop.reviewEmailNotificationsEnabled} />
              <Check label="Enable question notification email" name="questionEmailNotificationsEnabled" checked={shop.questionEmailNotificationsEnabled} />
              <Field label="Notification email address" name="notificationEmail" value={notificationEmail} type="email" />
              <button type="submit" name="intent" value="sendTestEmail">Send test email</button>
              {actionData?.message ? <Text as="p" tone="success">{actionData.message}</Text> : null}
              {actionData?.error ? <Text as="p" tone="critical">{actionData.error}</Text> : null}
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Field label="Primary color" name="primaryColor" value={widgetSettings.primaryColor} />
              <Field label="Star color" name="starColor" value={widgetSettings.starColor} />
              <Field label="Border radius" name="borderRadius" value={String(widgetSettings.borderRadius)} type="number" />
              <label>
                <span>Widget layout</span>
                <select name="widgetLayout" defaultValue={widgetSettings.widgetLayout}>
                  <option value="compact">Compact</option>
                  <option value="comfortable">Comfortable</option>
                </select>
              </label>
              <Check label="Carousel autoplay" name="carouselAutoplay" checked={widgetSettings.carouselAutoplay} />
              <label>
                <span>Floating badge position</span>
                <select name="floatingBadgePosition" defaultValue={widgetSettings.floatingBadgePosition}>
                  <option value="bottom-right">Bottom right</option>
                  <option value="bottom-left">Bottom left</option>
                </select>
              </label>
              <Button submit variant="primary" loading={navigation.state !== "idle"}>Save settings</Button>
            </BlockStack>
          </Card>
        </InlineGrid>
      </Form>
    </Page>
  );
}

function Field({ label, name, value, type = "text" }: { label: string; name: string; value: string; type?: string }) {
  return (
    <label>
      <span>{label}</span>
      <input name={name} type={type} defaultValue={value} />
    </label>
  );
}

function Check({ label, name, checked }: { label: string; name: string; checked: boolean }) {
  return (
    <label>
      <input type="checkbox" name={name} defaultChecked={checked} /> {label}
    </label>
  );
}
