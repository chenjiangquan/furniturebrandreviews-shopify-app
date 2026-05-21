# Data Storage Notes

## Review Data

Product reviews are stored in the local Prisma SQLite database during MVP development. The main table is `ProductReview`, which stores product IDs, product handles, customer details, rating, title, content, moderation status, merchant replies, `imageUrl`, and `usefulCount`.

In local development the SQLite file is `prisma/dev.sqlite`.

## Review Images

Review images are currently stored as an `imageUrl` string on `ProductReview`.

For storefront uploads, the MVP can store a browser-generated base64 data URL in `imageUrl`. This is useful for local testing only and should not be treated as production-grade image storage.

CSV imports and manual admin entries can also provide a normal hosted image URL. When `imageUrl` is present, the admin review list and storefront Product Review Widget render a thumbnail and open a larger preview.

## Production Recommendation

Before launch, move review image files to durable object storage and save only the public CDN URL in `imageUrl`.

Recommended options:

- Shopify Files
- Cloudflare R2
- Amazon S3
- Supabase Storage

The database should continue to store moderation data and the final image URL, while the file storage provider handles binary image assets, CDN delivery, retention, and size limits.
