# Shopify Public Unlisted App Submission Checklist

Furniture Brand Reviews is prepared for Shopify Public App - Unlisted review. The app is embedded in Shopify Admin, uses Shopify OAuth/session token authentication, stores data per `shopDomain`, and exposes storefront widgets through a Theme App Extension and Shopify App Proxy.

## Listing URLs

- Privacy policy: https://www.furniturebrandreviews.com/privacy-policy
- Terms of service: https://www.furniturebrandreviews.com/terms-of-service
- Contact: https://www.furniturebrandreviews.com/contact

## Production URLs

- Production app URL: https://app.furniturebrandreviews.com
- App proxy URL: https://app.furniturebrandreviews.com
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

Reviewer test account:

- Username: `reviewtest@furniturebrandreviews.com`
- Password: `88888888`

This app is embedded in Shopify Admin and uses Shopify OAuth rather than a separate app login. Please install the app on a test store, then open Apps -> Furniture Brand Reviews. Demo data is created for the current shop by opening:

```text
/app/reviewer-demo
```

The demo setup is authenticated through Shopify Admin and is isolated by `shopDomain`.

1. Install the app on a Shopify development store.
2. Open Shopify Admin -> Apps -> Furniture Brand Reviews.
3. Open `/app/reviewer-demo` once to create reviewer demo data for the current shop.
4. Confirm the embedded Dashboard loads without redirect loops and shows product review counts.
5. Go to Product Reviews and confirm demo reviews/questions are visible.
6. Approve, reply, edit, or delete a review.
7. Go to Widgets Settings.
8. Confirm the demo brand name is `Furniture Demo Store` and notification email is `reviewtest@furniturebrandreviews.com`.
9. Save brand name or notification email settings.
10. Click Send test email if Resend is configured.
11. Open Online Store -> Customize -> Product template.
12. Add an app block:
   - Product Reviews Widget
   - Product Star Rating
   - Brand Review Carousel
   - Brand Micro Trust Badge
   - Collection Stars on a collection template
13. Open a storefront product page and submit a test product review.
14. Return to the embedded admin app -> Product Reviews.
15. Approve or publish the review, then add a merchant reply.
16. Refresh the storefront product page and confirm the approved review and merchant reply appear.
17. Submit a test question from the Product Reviews Widget.
18. Return to Product Reviews -> Questions, publish the question, and add an answer.
19. Refresh the storefront product page and confirm the published Q&A appears in the Questions tab.
20. Submit another review/question and confirm notification email delivery if Resend is configured.
21. Uninstall the app from Shopify Admin settings.
22. Confirm the app receives the uninstall webhook and marks the shop inactive.

## App Review Notes

- The app does not generate fake reviews.
- Customer-submitted reviews and questions default to pending unless the merchant enables auto-publish.
- Verified purchase is a moderation field in the MVP; the app does not claim automatic order verification.
- AI is used only for review summary text, not for generating reviews.
- Theme integration is done through Theme App Extension blocks and App Proxy. The app does not directly edit merchant theme files.
