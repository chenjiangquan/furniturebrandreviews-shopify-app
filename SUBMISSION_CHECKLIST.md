# Shopify Public Unlisted App Submission Checklist

Furniture Brand Reviews is prepared for Shopify Public App - Unlisted review. The app is embedded in Shopify Admin, uses Shopify OAuth/session token authentication, stores data per `shopDomain`, and exposes storefront widgets through a Theme App Extension and Shopify App Proxy.

## Listing URLs

- Privacy policy: https://www.furniturebrandreviews.com/privacy-policy
- Terms of service: https://www.furniturebrandreviews.com/terms-of-service
- Contact: https://www.furniturebrandreviews.com/contact

## Production URLs

- Production app URL: https://furniturebrandreviews-shopify-app-production.up.railway.app
- App proxy URL: https://furniturebrandreviews-shopify-app-production.up.railway.app
- App proxy path: `/apps/fbr`

No production configuration should use `localhost` or a temporary Cloudflare tunnel URL.

## Mandatory Webhooks

Configured in `shopify.app.toml`:

- `app/uninstalled` -> `/webhooks/app/uninstalled`
- `customers/data_request` -> `/webhooks/compliance`
- `customers/redact` -> `/webhooks/compliance`
- `shop/redact` -> `/webhooks/compliance`

All webhook routes call `authenticate.webhook(request)`, which verifies the Shopify webhook signature before any data changes are made.

Expected behavior:

- `APP_UNINSTALLED`: deletes Shopify sessions for that shop, clears the stored access token/scope, and marks the shop inactive. It does not delete another shop's data.
- `CUSTOMERS_DATA_REQUEST`: logs the request and the matching product review/question counts for the requested customer email in that shop.
- `CUSTOMERS_REDACT`: anonymizes matching customer name/email on product reviews and product questions for the requested shop only.
- `SHOP_REDACT`: deletes sessions and app data for the requested shop only.

## Shopify Reviewer Test Steps

1. Install the app on a Shopify development store.
2. Open Shopify Admin -> Apps -> Furniture Brand Reviews.
3. Confirm the embedded Dashboard loads without redirect loops.
4. Go to Widgets Settings.
5. Enter and save a Brand name in the FurnitureBrandReviews business profile card.
6. Open Online Store -> Customize -> Product template.
7. Add an app block:
   - Product Reviews Widget
   - Product Star Rating
   - Brand Review Carousel
   - Brand Micro Trust Badge
8. Open a storefront product page and submit a test product review.
9. Return to the embedded admin app -> Product Reviews.
10. Approve or publish the review, then add a merchant reply.
11. Refresh the storefront product page and confirm the approved review and merchant reply appear.
12. Submit a test question from the Product Reviews Widget.
13. Return to Product Reviews -> Questions, publish the question, and add an answer.
14. Refresh the storefront product page and confirm the published Q&A appears in the Questions tab.
15. In Widgets Settings, set the Notification email and click Send test email.
16. Submit another review/question and confirm notification email delivery if Resend is configured.
17. Uninstall the app from Shopify Admin settings.
18. Confirm the app receives the uninstall webhook and marks the shop inactive.

## App Review Notes

- The app does not generate fake reviews.
- Customer-submitted reviews and questions default to pending unless the merchant enables auto-publish.
- Verified purchase is a moderation field in the MVP; the app does not claim automatic order verification.
- AI is used only for review summary text, not for generating reviews.
- Theme integration is done through Theme App Extension blocks and App Proxy. The app does not directly edit merchant theme files.
