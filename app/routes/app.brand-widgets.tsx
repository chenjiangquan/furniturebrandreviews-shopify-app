import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Badge, BlockStack, Button, Card, InlineGrid, InlineStack, Page, Text } from "@shopify/polaris";
import { getBrandWidgetPayload } from "~/models/reviews.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return getBrandWidgetPayload(session.shop);
};

export default function BrandWidgets() {
  const data = useLoaderData<typeof loader>();
  const breakdown = data.ratingBreakdown || {};

  return (
    <Page
      title="Brand Widgets"
      primaryAction={{ content: "Customize Product Review Widget", url: "/app/widgets/product-review-widget" }}
    >
      <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Product Review Widget</Text>
            <Text as="p" tone="subdued">
              Configure the product page review widget and preview storefront styling before adding the app block in the Theme Editor.
            </Text>
            <Button url="/app/widgets/product-review-widget" variant="primary">Customize Product Review Widget</Button>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Brand Review Carousel</Text>
            <BlockStack gap="300">
              {data.reviews.slice(0, 3).map((review: any) => (
                <div key={review.id} style={{ border: "1px solid #e3e3e3", borderRadius: 8, padding: 12 }}>
                  <InlineStack align="space-between">
                    <Text as="p" variant="headingSm">{review.reviewerName}</Text>
                    {review.verifiedPurchase ? <Badge tone="success">Verified</Badge> : null}
                  </InlineStack>
                  <Text as="p">{stars(review.rating)}</Text>
                  <Text as="p" variant="headingSm">{review.title}</Text>
                  <Text as="p" tone="subdued">{review.content}</Text>
                </div>
              ))}
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Company Trust Summary</Text>
            <Text as="p" variant="heading2xl">{data.rating}/5</Text>
            <Text as="p" tone="subdued">{data.reviewCount} total reviews · Trust score {data.trustScore}</Text>
            <Text as="p">{data.summary}</Text>
            <BlockStack gap="100">
              {Object.entries(breakdown).reverse().map(([rating, count]) => (
                <Text as="p" key={rating}>{rating} stars: {String(count)}</Text>
              ))}
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Floating Brand Trust Badge</Text>
            <div style={{ border: "1px solid #d6d6d6", borderRadius: 8, padding: 16, width: 220 }}>
              <Text as="p" variant="headingSm">{data.brandName}</Text>
              <Text as="p">{stars(Math.round(data.rating))} {data.rating}</Text>
              <Text as="p" tone="subdued">{data.reviewCount} reviews</Text>
            </div>
            <Badge tone="info">App embed block</Badge>
          </BlockStack>
        </Card>
      </InlineGrid>
    </Page>
  );
}

function stars(count: number) {
  return "★★★★★".slice(0, count) + "☆☆☆☆☆".slice(0, Math.max(0, 5 - count));
}
