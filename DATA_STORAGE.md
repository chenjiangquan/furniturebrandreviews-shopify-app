# Data Storage Notes

## Review Data

Product reviews are stored in the local Prisma SQLite database during MVP development. The main table is `ProductReview`, which stores product IDs, product handles, customer details, rating, title, content, moderation status, merchant replies, `imageUrl`, and `usefulCount`.

In local development the SQLite file is `prisma/dev.sqlite`.

## Review Images

Review images are currently stored as an `imageUrl` string on `ProductReview`.

Storefront uploads are sent as multipart form data and stored in Vercel Blob. The app validates the image type and signature, limits files to 3 MB, and stores only the resulting public CDN URL in `imageUrl`.

CSV imports and manual admin entries can also provide a normal hosted image URL. When `imageUrl` is present, the admin review list and storefront Product Review Widget render a thumbnail and open a larger preview.

## Production Recommendation

The production Vercel project must have a Blob store connected so that `BLOB_READ_WRITE_TOKEN` is available to the app.

The database should continue to store moderation data and the final image URL, while the file storage provider handles binary image assets, CDN delivery, retention, and size limits.
