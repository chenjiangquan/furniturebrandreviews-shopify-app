const csvTemplateHeaders = [
  "productHandle",
  "productTitle",
  "customerName",
  "customerEmail",
  "rating",
  "title",
  "content",
  "imageUrl",
  "verifiedPurchase",
  "createdAt"
];

export const loader = async () => {
  const sampleRow = [
    "test-product",
    "Test Product",
    "John Doe",
    "john@example.com",
    "5",
    "Excellent",
    "Amazing product!",
    "https://example.com/image.jpg",
    "true",
    "2026-05-15"
  ];

  return new Response(`${csvTemplateHeaders.join(",")}\n${sampleRow.join(",")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="fbr-review-template.csv"'
    }
  });
};
