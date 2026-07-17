import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useFetcher, useLoaderData, useNavigation, useSearchParams } from "@remix-run/react";
import * as React from "react";
import {
  BlockStack,
  Box,
  Banner,
  Button,
  Card,
  Checkbox,
  ChoiceList,
  InlineStack,
  Modal,
  Page,
  Popover,
  Select,
  Tabs,
  Text,
  TextField
} from "@shopify/polaris";
import prisma from "~/db.server";
import { clampRating, createProductReview, ensureShop, requiredString } from "~/models/reviews.server";
import { authenticate } from "~/shopify.server";

type QuestionStatus = "PENDING" | "PUBLISHED" | "REJECTED" | "ARCHIVED";

const tabs = [
  { id: "all", content: "All Reviews" }
];

const viewTabs = [
  { id: "reviews", content: "Reviews" },
  { id: "questions", content: "Questions" }
];

const questionStatusOptions = [
  { label: "Published", value: "PUBLISHED" },
  { label: "Pending", value: "PENDING" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Archived", value: "ARCHIVED" }
];

const pageSizeOptions = [20, 30];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const rating = url.searchParams.get("rating") || "";
  const picture = url.searchParams.get("picture") || "";
  const sort = url.searchParams.get("sort") || "";
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const perPage = pageSizeOptions.includes(Number(url.searchParams.get("perPage")))
    ? Number(url.searchParams.get("perPage"))
    : 20;
  const view = url.searchParams.get("view") === "questions" ? "questions" : "reviews";
  const containsSearch = (value: string) => ({ contains: value, mode: "insensitive" }) as const;
  const andFilters = [
    ...(picture === "with" ? [{ imageHidden: false }, { imageUrl: { not: null } }, { imageUrl: { not: "" } }] : []),
    ...(picture === "without" ? [{ OR: [{ imageHidden: true }, { imageUrl: null }, { imageUrl: "" }] }] : []),
    ...(query
      ? [{
          OR: [
            { productTitle: containsSearch(query) },
            { productHandle: containsSearch(query) },
            { customerName: containsSearch(query) },
            { title: containsSearch(query) },
            { content: containsSearch(query) }
          ]
        }]
      : [])
  ];
  const where = {
    shopDomain: session.shop,
    ...(rating ? { rating: Number(rating) } : {}),
    ...(andFilters.length ? { AND: andFilters } : {})
  };
  const questionWhere = {
    shopDomain: session.shop,
    ...(query
      ? {
          OR: [
            { productTitle: containsSearch(query) },
            { productHandle: containsSearch(query) },
            { customerName: containsSearch(query) },
            { question: containsSearch(query) },
            { answer: containsSearch(query) }
          ]
        }
      : {})
  };

  if (url.searchParams.get("export") === "csv") {
    const exportReviews = await prisma.productReview.findMany({
      where,
      orderBy: { createdAt: "desc" }
    });
    return new Response(productReviewsToCsv(exportReviews), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fbr-product-reviews-${new Date().toISOString().slice(0, 10)}.csv"`
      }
    });
  }

  const [reviews, reviewCount, questions] = await Promise.all([
    view === "reviews"
      ? prisma.productReview.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * perPage,
          take: perPage
        })
      : Promise.resolve([]),
    view === "reviews" ? prisma.productReview.count({ where }) : Promise.resolve(0),
    view === "questions"
      ? prisma.productQuestion.findMany({ where: questionWhere, orderBy: { createdAt: "desc" }, take: 100 })
      : Promise.resolve([])
  ]);
  const totalPages = Math.max(1, Math.ceil(reviewCount / perPage));

  return { reviews, questions, view, page, totalPages, reviewCount, sort, perPage };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const id = String(form.get("id") || "");

  if (intent === "verifiedPurchase") {
    await prisma.productReview.update({
      where: { id },
      data: { verifiedPurchase: form.get("verifiedPurchase") === "on" }
    });
  }

  if (intent === "imageHidden") {
    await prisma.productReview.updateMany({
      where: { id, shopDomain: session.shop },
      data: { imageHidden: form.get("imageHidden") === "on" }
    });
  }

  if (intent === "reply") {
    const merchantReply = String(form.get("merchantReply") || "").trim();
    await prisma.productReview.update({
      where: { id },
      data: {
        merchantReply,
        repliedAt: merchantReply ? new Date() : null
      }
    });
  }

  if (intent === "delete") {
    await prisma.productReview.delete({ where: { id } });
  }

  if (intent === "questionStatus") {
    await prisma.productQuestion.update({
      where: { id },
      data: { status: String(form.get("status") || "PENDING") as QuestionStatus }
    });
  }

  if (intent === "questionAnswer") {
    const answer = String(form.get("answer") || "").trim();
    await prisma.productQuestion.update({
      where: { id },
      data: {
        answer,
        answeredAt: answer ? new Date() : null
      }
    });
  }

  if (intent === "questionDelete") {
    await prisma.productQuestion.delete({ where: { id } });
  }

  if (intent === "importCsv") {
    try {
      const file = form.get("csvFile");
      if (!file || typeof file !== "object" || !("text" in file) || typeof file.text !== "function") {
        return { ok: false, error: "CSV file is required." };
      }

      const importResult = await importReviewsFromCsv(session.shop, await file.text());
      return { ok: true, error: "", ...importResult };
    } catch (error) {
      console.error("CSV import failed", error);
      return { ok: false, error: await importErrorMessage(error) };
    }
  }

  if (intent === "create") {
    await createProductReview({
      shopDomain: session.shop,
      productId: requiredString(form.get("productId"), "productId"),
      productHandle: String(form.get("productHandle") || ""),
      productTitle: String(form.get("productTitle") || ""),
      customerName: requiredString(form.get("customerName"), "name"),
      customerEmail: String(form.get("customerEmail") || ""),
      rating: clampRating(form.get("rating")),
      title: requiredString(form.get("title"), "title"),
      content: requiredString(form.get("content"), "content"),
      imageUrl: String(form.get("imageUrl") || ""),
      verifiedPurchase: form.get("verifiedPurchase") === "on",
      source: "STOREFRONT"
    });
  }

  if (["verifiedPurchase", "imageHidden", "reply", "delete", "importCsv", "questionStatus", "questionAnswer", "questionDelete"].includes(intent)) {
    return { ok: true };
  }

  return redirect("/app/product-reviews");
};

export default function ProductReviews() {
  const { reviews, questions, page, totalPages, perPage, reviewCount } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const navigation = useNavigation();
  const selectedView = params.get("view") === "questions" ? "questions" : "reviews";
  const selectedTab = Math.max(0, tabs.findIndex((tab) => tab.id === (params.get("tab") || "all")));
  const selectedViewTab = selectedView === "questions" ? 1 : 0;
  const busy = navigation.state !== "idle";
  const optimisticPerPage = navigation.location
    ? Number(new URLSearchParams(navigation.location.search).get("perPage") || perPage)
    : perPage;
  const [showAddReview, setShowAddReview] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState(params.get("q") || "");
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setSearchValue(params.get("q") || "");
  }, [params]);

  React.useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const applySearch = React.useCallback((value: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const next = new URLSearchParams(params);
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    next.set("page", "1");
    setParams(next);
  }, [params, setParams]);

  const scheduleSearch = React.useCallback((value: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      next.set("page", "1");
      setParams(next);
    }, 300);
  }, [params, setParams]);

  const exportReviews = React.useCallback(() => {
    const next = new URLSearchParams(params);
    next.set("export", "csv");
    window.location.href = `/app/product-reviews?${next.toString()}`;
  }, [params]);

  const setPage = React.useCallback((nextPage: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    setParams(next);
  }, [params, setParams]);

  const setPerPage = React.useCallback((nextPerPage: string) => {
    const next = new URLSearchParams(params);
    next.set("perPage", nextPerPage);
    next.set("page", "1");
    setParams(next);
  }, [params, setParams]);

  return (
    <Page
      fullWidth
      title="Reviews"
      primaryAction={{ content: "Export", onAction: exportReviews }}
      secondaryActions={[
        { content: "Import", onAction: () => setImportOpen(true) },
        { content: "Add review", onAction: () => setShowAddReview((open) => !open) }
      ]}
    >
      <div style={{ paddingBottom: 80 }}>
      <BlockStack gap="400">
        <ImportReviewsModal open={importOpen} onClose={() => setImportOpen(false)} />

        <Card padding="0">
          <Tabs
            tabs={viewTabs}
            selected={selectedViewTab}
            onSelect={(index) => {
              const next = new URLSearchParams(params);
              if (viewTabs[index].id === "questions") {
                next.set("view", "questions");
                next.delete("tab");
                next.delete("status");
                next.delete("rating");
                next.delete("picture");
                next.set("page", "1");
              } else {
                next.delete("view");
                next.set("page", "1");
              }
              setParams(next);
            }}
          />
        </Card>

        <Card padding="0">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "0 16px", minHeight: 56 }}>
            <div style={{ flex: "1 1 540px", minWidth: 0 }}>
              {selectedView === "reviews" ? (
                <Tabs
                  tabs={tabs}
                  selected={selectedTab}
                  onSelect={(index) => {
                    const next = new URLSearchParams(params);
                    next.set("tab", tabs[index].id);
                    next.delete("status");
                    next.set("page", "1");
                    setParams(next);
                  }}
                />
              ) : (
                <Text as="p" variant="headingSm">Customer questions</Text>
              )}
            </div>
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              {selectedView === "reviews" ? (
                <Text as="p" tone="subdued">
                  {reviewCount} {reviewCount === 1 ? "result" : "results"}
                </Text>
              ) : null}
              <div style={{ width: 320, maxWidth: "calc(100vw - 160px)" }}>
                <TextField
                  label="Search reviews"
                  labelHidden
                  placeholder={selectedView === "questions" ? "Search product, customer, or question" : "Search product, customer, title, or content"}
                  value={searchValue}
                  onChange={(value) => {
                    setSearchValue(value);
                    scheduleSearch(value);
                  }}
                  clearButton
                  onClearButtonClick={() => {
                    setSearchValue("");
                    applySearch("");
                  }}
                  autoComplete="off"
                />
              </div>
              {selectedView === "reviews" ? <ReviewFilterPopover /> : null}
            </InlineStack>
          </div>
        </Card>

        {showAddReview ? (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Manual review</Text>
              <ReviewFields busy={busy} />
            </BlockStack>
          </Card>
        ) : null}

        {selectedView === "questions" ? (
          <QuestionsTable questions={questions} busy={busy} />
        ) : (
          <Card padding="0">
            <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 0.85fr) minmax(90px, 0.35fr) minmax(240px, 1.45fr) minmax(190px, 0.8fr)", gap: 16, padding: "12px 16px", borderBottom: "1px solid #ebebeb", color: "#6d7175", fontSize: 13, fontWeight: 600 }}>
              <span>Customer</span>
              <span>Created</span>
              <span>Review</span>
              <span>Moderation</span>
            </div>
            <BlockStack gap="0">
              {reviews.map((review: any) => <ReviewRow key={review.id} review={review} busy={busy} />)}
              {reviews.length === 0 ? (
                <Box padding="500">
                  <Text as="p" tone="subdued">No reviews match this view.</Text>
                </Box>
              ) : null}
            </BlockStack>
            <Box padding="400">
              <ReviewsPagination
                page={page}
                totalPages={totalPages}
                busy={busy}
                onPageChange={setPage}
                perPage={optimisticPerPage}
                onPerPageChange={setPerPage}
              />
            </Box>
          </Card>
        )}
      </BlockStack>
      </div>
    </Page>
  );
}

function ReviewRow({ review, busy }: { review: any; busy: boolean }) {
  const fetcher = useFetcher();
  const [replyOpen, setReplyOpen] = React.useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = React.useState(false);
  const submitIntent = (intent: string) => {
    const formData = new FormData();
    formData.set("intent", intent);
    formData.set("id", review.id);
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 0.85fr) minmax(90px, 0.35fr) minmax(240px, 1.45fr) minmax(190px, 0.8fr)", gap: 16, padding: 16, borderBottom: "1px solid #ebebeb", alignItems: "start" }}>
      <InlineStack gap="300" wrap={false} blockAlign="start">
        <BlockStack gap="150">
          <Text as="p" variant="headingSm">{review.customerName}</Text>
          <Text as="p" tone="subdued">{review.productTitle || review.productHandle || review.productId}</Text>
          <Text as="p" tone="subdued">via {review.source === "IMPORTED" ? "Imported" : "Storefront"}</Text>
          <Button size="micro">Add tags</Button>
        </BlockStack>
      </InlineStack>

      <Text as="p" tone="subdued">{formatCreated(review.createdAt)}</Text>

      <InlineStack gap="300" wrap={false} blockAlign="start">
        <BlockStack gap="150">
          <Text as="p"><span style={{ color: "#f5a623" }}>{stars(review.rating)}</span></Text>
          <Text as="h3" variant="headingSm">{review.title}</Text>
          <Text as="p">{review.content}</Text>
          {review.imageUrl ? (
            <>
              <button
                type="button"
                onClick={() => setImagePreviewOpen(true)}
                style={{
                  alignSelf: "flex-start",
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  padding: 0
                }}
              >
                <img
                  src={review.imageUrl}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.closest("button")?.remove();
                  }}
                  style={{
                    borderRadius: 8,
                    display: "block",
                    height: 84,
                    objectFit: "cover",
                    width: 112
                  }}
                />
              </button>
              {review.imageHidden ? (
                <Text as="p" tone="subdued">Image hidden on storefront</Text>
              ) : null}
              <Modal
                open={imagePreviewOpen}
                onClose={() => setImagePreviewOpen(false)}
                title="Review photo"
                primaryAction={{ content: "Close", onAction: () => setImagePreviewOpen(false) }}
              >
                <Modal.Section>
                  <img src={review.imageUrl} alt="" style={{ borderRadius: 8, display: "block", maxWidth: "100%", width: "100%" }} />
                </Modal.Section>
              </Modal>
            </>
          ) : null}
          {review.merchantReply ? (
            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
              <BlockStack gap="100">
                <Text as="p" variant="headingSm">Merchant reply:</Text>
                <Text as="p">{review.merchantReply}</Text>
              </BlockStack>
            </Box>
          ) : null}
        </BlockStack>
      </InlineStack>

      <BlockStack gap="300">
        <ReplyModal review={review} open={replyOpen} onClose={() => setReplyOpen(false)} />
        <VerifiedPurchaseControl review={review} />
        {review.imageUrl ? <HideReviewImageControl review={review} /> : null}
        <InlineStack gap="200">
          <Button size="micro" onClick={() => setReplyOpen(true)}>{review.merchantReply ? "Edit reply" : "Reply"}</Button>
          <Button size="micro" tone="critical" disabled={busy} onClick={() => submitIntent("delete")}>Delete</Button>
        </InlineStack>
      </BlockStack>
    </div>
  );
}

function QuestionsTable({ questions, busy }: { questions: any[]; busy: boolean }) {
  return (
    <Card padding="0">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 0.9fr) minmax(240px, 1.5fr) minmax(190px, 0.8fr)", gap: 16, padding: "12px 16px", borderBottom: "1px solid #ebebeb", color: "#6d7175", fontSize: 13, fontWeight: 600 }}>
        <span>Customer</span>
        <span>Question</span>
        <span>Moderation</span>
      </div>
      <BlockStack gap="0">
        {questions.map((question) => <QuestionRow key={question.id} question={question} busy={busy} />)}
        {questions.length === 0 ? (
          <Box padding="500">
            <Text as="p" tone="subdued">No questions match this view.</Text>
          </Box>
        ) : null}
      </BlockStack>
    </Card>
  );
}

function ReviewsPagination({
  page,
  totalPages,
  busy,
  onPageChange,
  perPage,
  onPerPageChange
}: {
  page: number;
  totalPages: number;
  busy: boolean;
  onPageChange: (page: number) => void;
  perPage: number;
  onPerPageChange: (perPage: string) => void;
}) {
  const pages = paginationItems(page, totalPages);
  const buttonStyle = (active = false): React.CSSProperties => ({
    alignItems: "center",
    background: active ? "#000" : "#fff",
    border: "1px solid #dfe3e8",
    borderRadius: 6,
    color: active ? "#fff" : "#202223",
    cursor: active || busy ? "default" : "pointer",
    display: "inline-flex",
    font: "inherit",
    height: 36,
    justifyContent: "center",
    minWidth: 36,
    padding: "0 12px"
  });

  return (
    <InlineStack align="end" blockAlign="center" gap="200">
      <button type="button" disabled={page <= 1 || busy} onClick={() => onPageChange(page - 1)} style={{ ...buttonStyle(false), opacity: page <= 1 ? 0.35 : 1 }}>
        ‹ Back
      </button>
      {pages.map((item, index) => item === "ellipsis" ? (
        <span key={`ellipsis-${index}`} style={buttonStyle(false)}>...</span>
      ) : (
        <button key={item} type="button" disabled={busy || item === page} onClick={() => onPageChange(item)} style={buttonStyle(item === page)}>
          {item}
        </button>
      ))}
      <button type="button" disabled={page >= totalPages || busy} onClick={() => onPageChange(page + 1)} style={{ ...buttonStyle(false), opacity: page >= totalPages ? 0.35 : 1 }}>
        Next ›
      </button>
      <InlineStack gap="200" blockAlign="center" wrap={false}>
        {busy ? <Text as="span" tone="subdued">Loading reviews…</Text> : null}
        <Text as="p">Result per page</Text>
        <div style={{ width: 92 }}>
          <Select
            label="Result per page"
            labelHidden
            value={String(perPage)}
            options={pageSizeOptions.map((value) => ({ label: String(value), value: String(value) }))}
            onChange={onPerPageChange}
            disabled={busy}
          />
        </div>
      </InlineStack>
    </InlineStack>
  );
}

function paginationItems(page: number, totalPages: number) {
  if (totalPages <= 9) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const items: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, page - 2);
  const end = Math.min(totalPages - 1, page + 2);
  if (start > 2) items.push("ellipsis");
  for (let item = start; item <= end; item += 1) items.push(item);
  if (end < totalPages - 1) items.push("ellipsis");
  items.push(totalPages);
  return items;
}

function QuestionRow({ question, busy }: { question: any; busy: boolean }) {
  const fetcher = useFetcher();
  const [answerOpen, setAnswerOpen] = React.useState(false);
  const status = String(question.status || "PENDING");

  const deleteQuestion = () => {
    const formData = new FormData();
    formData.set("intent", "questionDelete");
    formData.set("id", question.id);
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 0.9fr) minmax(240px, 1.5fr) minmax(190px, 0.8fr)", gap: 16, padding: 16, borderBottom: "1px solid #ebebeb", alignItems: "start" }}>
      <InlineStack gap="300" wrap={false} blockAlign="start">
        <Checkbox label="" checked={false} onChange={() => {}} />
        <BlockStack gap="150">
          <Text as="p" variant="headingSm">{question.customerName}</Text>
          <Text as="p" tone="subdued">{question.productTitle || question.productId}</Text>
          <Text as="p" tone="subdued">via Storefront</Text>
        </BlockStack>
      </InlineStack>

      <BlockStack gap="200">
        <Text as="p" tone="subdued">{new Date(question.createdAt).toLocaleDateString()}</Text>
        <Text as="p">{question.question}</Text>
        {question.answer ? (
          <Box padding="300" background="bg-surface-secondary" borderRadius="200">
            <BlockStack gap="100">
              <Text as="p" variant="headingSm">Merchant answer:</Text>
              <Text as="p">{question.answer}</Text>
            </BlockStack>
          </Box>
        ) : null}
      </BlockStack>

      <BlockStack gap="300">
        <Select
          label="Status"
          labelHidden
          options={questionStatusOptions}
          value={status}
          onChange={(value) => {
            const formData = new FormData();
            formData.set("intent", "questionStatus");
            formData.set("id", question.id);
            formData.set("status", value);
            fetcher.submit(formData, { method: "post" });
          }}
        />
        <QuestionAnswerModal question={question} open={answerOpen} onClose={() => setAnswerOpen(false)} />
        <InlineStack gap="200">
          <Button size="micro" onClick={() => setAnswerOpen(true)}>{question.answer ? "Edit answer" : "Reply"}</Button>
          <Button size="micro" tone="critical" disabled={busy} onClick={deleteQuestion}>Delete</Button>
        </InlineStack>
      </BlockStack>
    </div>
  );
}

function QuestionAnswerModal({ question, open, onClose }: { question: any; open: boolean; onClose: () => void }) {
  const fetcher = useFetcher();
  const [answer, setAnswer] = React.useState(String(question.answer || ""));
  const saving = fetcher.state !== "idle";

  React.useEffect(() => {
    if (open) setAnswer(String(question.answer || ""));
  }, [open, question.answer]);

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) onClose();
  }, [fetcher.data, fetcher.state, onClose]);

  const saveAnswer = () => {
    const formData = new FormData();
    formData.set("intent", "questionAnswer");
    formData.set("id", question.id);
    formData.set("answer", answer);
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={question.answer ? "Edit answer" : "Reply to question"}
      primaryAction={{ content: "Save answer", onAction: saveAnswer, loading: saving }}
      secondaryActions={[
        { content: "Clear answer", onAction: () => setAnswer("") },
        { content: "Cancel", onAction: onClose }
      ]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Card>
            <BlockStack gap="150">
              <Text as="p" tone="subdued">{question.customerName} · {question.productTitle || question.productId}</Text>
              <Text as="p">{question.question}</Text>
            </BlockStack>
          </Card>
          <TextField
            label="Merchant answer"
            value={answer}
            onChange={setAnswer}
            multiline={5}
            autoComplete="off"
          />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function ReviewFilterPopover() {
  const [params, setParams] = useSearchParams();
  const navigation = useNavigation();
  const [active, setActive] = React.useState(false);
  const urlSelected =
    params.get("sort") === "most_recent"
      ? "most_recent"
      : params.get("picture") === "with"
      ? "with_picture"
      : params.get("picture") === "without"
        ? "without_picture"
        : params.get("rating") || "all";
  const [selected, setSelected] = React.useState(urlSelected);
  const isFiltering = navigation.state !== "idle" && navigation.location?.pathname.includes("/app/product-reviews");

  React.useEffect(() => {
    setSelected(urlSelected);
  }, [urlSelected]);

  const label =
    selected === "with_picture"
      ? "With Picture"
      : selected === "without_picture"
        ? "Without Picture"
        : selected === "most_recent"
          ? "Most recent"
        : selected === "all"
          ? "Filter"
          : `${selected} Stars`;

  return (
    <Popover
      active={active}
      activator={<Button disclosure loading={isFiltering} onClick={() => setActive((open) => !open)}>{label}</Button>}
      onClose={() => setActive(false)}
    >
      <Popover.Section>
        <ChoiceList
          title="Filter reviews"
          titleHidden
          selected={[selected]}
          choices={[
            { label: "All", value: "all" },
            { label: "Most recent", value: "most_recent" },
            { label: "5 Stars", value: "5" },
            { label: "4 Stars", value: "4" },
            { label: "3 Stars", value: "3" },
            { label: "2 Stars", value: "2" },
            { label: "1 Star", value: "1" },
            { label: "With Picture", value: "with_picture" },
            { label: "Without Picture", value: "without_picture" }
          ]}
          onChange={([value]) => {
            setSelected(value);
            setActive(false);
            const next = new URLSearchParams(params);
            next.delete("rating");
            next.delete("picture");
            next.delete("sort");
            next.set("page", "1");
            if (value === "most_recent") next.set("sort", "most_recent");
            else if (value === "with_picture") next.set("picture", "with");
            else if (value === "without_picture") next.set("picture", "without");
            else if (value && value !== "all") next.set("rating", value);
            setParams(next);
          }}
        />
      </Popover.Section>
    </Popover>
  );
}

function ReviewFields({ busy }: { busy: boolean }) {
  const [productId, setProductId] = React.useState("");
  const [productHandle, setProductHandle] = React.useState("");
  const [productTitle, setProductTitle] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [customerEmail, setCustomerEmail] = React.useState("");
  const [rating, setRating] = React.useState("5");
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState("");
  const [verifiedPurchase, setVerifiedPurchase] = React.useState(false);

  return (
    <Form method="post">
      <input type="hidden" name="intent" value="create" />
      <BlockStack gap="300">
        <TextField label="Product ID" name="productId" value={productId} onChange={setProductId} autoComplete="off" />
        <TextField label="Product handle" name="productHandle" value={productHandle} onChange={setProductHandle} autoComplete="off" />
        <TextField label="Product title" name="productTitle" value={productTitle} onChange={setProductTitle} autoComplete="off" />
        <TextField label="Customer name" name="customerName" value={customerName} onChange={setCustomerName} autoComplete="name" />
        <TextField label="Customer email" name="customerEmail" value={customerEmail} onChange={setCustomerEmail} type="email" autoComplete="email" />
        <TextField label="Rating" name="rating" value={rating} onChange={setRating} type="number" min={1} max={5} autoComplete="off" />
        <TextField label="Title" name="title" value={title} onChange={setTitle} autoComplete="off" />
        <TextField label="Review content" name="content" value={content} onChange={setContent} multiline={4} autoComplete="off" />
        <TextField label="Image URL" name="imageUrl" value={imageUrl} onChange={setImageUrl} type="url" autoComplete="off" />
        <input type="hidden" name="verifiedPurchase" value={verifiedPurchase ? "on" : ""} />
        <Checkbox label="Verified purchase" checked={verifiedPurchase} onChange={setVerifiedPurchase} />
        <Button submit variant="primary" disabled={busy}>Add review</Button>
      </BlockStack>
    </Form>
  );
}

function ImportReviewsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fetcher = useFetcher<typeof action>();
  const [file, setFile] = React.useState<File | null>(null);
  const [successMessage, setSuccessMessage] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const uploading = fetcher.state !== "idle";
  const importError = fetcher.data && !fetcher.data.ok
    ? String("error" in fetcher.data ? fetcher.data.error || "CSV import failed." : "CSV import failed.")
    : "";

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && file) {
      const importedCount = "importedCount" in fetcher.data ? Number(fetcher.data.importedCount || 0) : 0;
      const skippedCount = "skippedCount" in fetcher.data ? Number(fetcher.data.skippedCount || 0) : 0;
      setSuccessMessage(`Import successful. ${importedCount} ${importedCount === 1 ? "review was" : "reviews were"} imported. ${skippedCount} duplicate ${skippedCount === 1 ? "review was" : "reviews were"} skipped.`);
      setFile(null);
    }
  }, [fetcher.data, fetcher.state, file]);

  const uploadCsv = () => {
    if (!file) return;
    setSuccessMessage("");
    const formData = new FormData();
    formData.set("intent", "importCsv");
    formData.set("csvFile", file);
    fetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import reviews"
      primaryAction={{ content: "Upload CSV", onAction: uploadCsv, loading: uploading, disabled: !file }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center" gap="300">
            <Text as="p" tone="subdued">Upload reviews with the Furniture Brand Reviews CSV format or a Judge.me reviews export.</Text>
            <Button onClick={downloadCsvTemplate}>Download CSV template</Button>
          </InlineStack>
          <Card>
            <BlockStack gap="300">
              <Text as="p" variant="headingSm">CSV file</Text>
              <Text as="p" tone="subdued">Supported columns: productHandle, productTitle, customerName, customerEmail, rating, title, content, imageUrl, verifiedPurchase, createdAt. Judge.me exports are mapped automatically and all imported reviews are published.</Text>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(event) => setFile(event.currentTarget.files?.[0] || null)}
              />
              <InlineStack gap="200" blockAlign="center">
                <Button onClick={() => inputRef.current?.click()}>Choose CSV file</Button>
                {file ? <Text as="p" tone="subdued">{file.name}</Text> : <Text as="p" tone="subdued">No file selected</Text>}
              </InlineStack>
            </BlockStack>
          </Card>
          {importError ? (
            <Box background="bg-surface-critical" borderRadius="200" padding="300">
              <BlockStack gap="100">
                <Text as="p" tone="critical" variant="headingSm">Import failed</Text>
                <Text as="p" tone="critical">{importError}</Text>
              </BlockStack>
            </Box>
          ) : null}
          {successMessage ? (
            <Banner tone="success" title="Import successful">
              <Text as="p">{successMessage}</Text>
            </Banner>
          ) : null}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function downloadCsvTemplate() {
  const csv = [
    "productHandle,productTitle,customerName,customerEmail,rating,title,content,imageUrl,verifiedPurchase,createdAt",
    "test-product,Test Product,John Doe,john@example.com,5,Excellent,Amazing product!,https://example.com/image.jpg,true,2026-05-15"
  ].join("\n");
  const blob = new Blob([`${csv}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "fbr-review-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function productReviewsToCsv(reviews: Array<any>) {
  const headers = [
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
  const rows = reviews.map((review) => [
    review.productHandle || "",
    review.productTitle || "",
    review.customerName,
    review.customerEmail || "",
    review.rating,
    review.title,
    review.content,
    review.imageUrl || "",
    review.verifiedPurchase ? "true" : "false",
    new Date(review.createdAt).toISOString().slice(0, 10)
  ]);

  return `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function VerifiedPurchaseControl({ review }: { review: any }) {
  const fetcher = useFetcher();
  const [checked, setChecked] = React.useState(Boolean(review.verifiedPurchase));

  return (
    <Checkbox
      label="Verified purchase"
      checked={checked}
      onChange={(nextChecked) => {
        setChecked(nextChecked);
        const formData = new FormData();
        formData.set("intent", "verifiedPurchase");
        formData.set("id", review.id);
        if (nextChecked) formData.set("verifiedPurchase", "on");
        fetcher.submit(formData, { method: "post" });
      }}
    />
  );
}

function HideReviewImageControl({ review }: { review: any }) {
  const fetcher = useFetcher();
  const [checked, setChecked] = React.useState(Boolean(review.imageHidden));

  React.useEffect(() => {
    setChecked(Boolean(review.imageHidden));
  }, [review.imageHidden]);

  return (
    <Checkbox
      label="Hide image on storefront"
      checked={checked}
      onChange={(nextChecked) => {
        setChecked(nextChecked);
        const formData = new FormData();
        formData.set("intent", "imageHidden");
        formData.set("id", review.id);
        if (nextChecked) formData.set("imageHidden", "on");
        fetcher.submit(formData, { method: "post" });
      }}
    />
  );
}

function ReplyModal({ review, open, onClose }: { review: any; open: boolean; onClose: () => void }) {
  const fetcher = useFetcher();
  const [reply, setReply] = React.useState(String(review.merchantReply || ""));
  const saving = fetcher.state !== "idle";

  React.useEffect(() => {
    if (open) setReply(String(review.merchantReply || ""));
  }, [open, review.merchantReply]);

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) onClose();
  }, [fetcher.data, fetcher.state, onClose]);

  const saveReply = () => {
    const formData = new FormData();
    formData.set("intent", "reply");
    formData.set("id", review.id);
    formData.set("merchantReply", reply);
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={review.merchantReply ? "Edit reply" : "Reply to review"}
      primaryAction={{ content: "Save reply", onAction: saveReply, loading: saving }}
      secondaryActions={[
        { content: "Clear reply", onAction: () => setReply("") },
        { content: "Cancel", onAction: onClose }
      ]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Card>
            <BlockStack gap="150">
              <Text as="p" tone="subdued">{review.customerName} · {review.productTitle || review.productHandle || review.productId}</Text>
              <Text as="p"><span style={{ color: "#f5a623" }}>{stars(review.rating)}</span></Text>
              <Text as="h3" variant="headingSm">{review.title}</Text>
              <Text as="p">{review.content}</Text>
            </BlockStack>
          </Card>
          <TextField
            label="Merchant reply"
            value={reply}
            onChange={setReply}
            multiline={5}
            autoComplete="off"
          />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function stars(count: number) {
  return "★★★★★".slice(0, count) + "☆☆☆☆☆".slice(0, Math.max(0, 5 - count));
}

function formatCreated(value: string | Date) {
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / 86_400_000));

  if (diffDays < 5) {
    if (diffDays === 0) return "Today";
    return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
  }

  return createdAt.toLocaleDateString();
}

async function importReviewsFromCsv(shopDomain: string, csvText: string) {
  await ensureShop(shopDomain);
  const rows = parseCsv(csvText);
  const [header = [], ...records] = rows;
  const fields = header.map((field) => field.trim());
  const importedAt = new Date();
  const isJudgeMeCsv = fields.includes("reviewer_name") || fields.includes("body") || fields.includes("product_handle");
  const requiredHeaders = isJudgeMeCsv
    ? ["reviewer_name", "rating", "body"]
    : ["customerName", "rating", "title", "content"];
  const missingHeaders = requiredHeaders.filter((field) => !fields.includes(field));

  if (!fields.length || missingHeaders.length) {
    throw new Error(`CSV header missing: ${missingHeaders.join(", ") || "header row"}. Supported formats: Furniture Brand Reviews CSV or Judge.me reviews CSV.`);
  }

  if (!records.some((record) => record.some((value) => value.trim()))) {
    throw new Error("CSV file does not contain any review rows.");
  }

  let importedCount = 0;
  let skippedCount = 0;
  const preparedReviews: Array<{
    shopDomain: string;
    productId: string;
    productHandle: string;
    productTitle: string;
    customerName: string;
    customerEmail: string;
    rating: number;
    title: string;
    content: string;
    status: string;
    source: string;
    verifiedPurchase: boolean;
    imageUrl: string;
    merchantReply: string | null;
    repliedAt: Date | null;
    createdAt: Date;
  }> = [];
  const incomingKeys = new Set<string>();

  for (const [recordIndex, record] of records.entries()) {
    if (record.every((value) => !value.trim())) continue;
    try {
      const row = Object.fromEntries(fields.map((field, index) => [field, record[index] || ""]));
      const importedReview = normalizeImportedReviewRow(row, importedAt, isJudgeMeCsv);
      const title = requiredString(importedReview.title || fallbackImportedTitle(importedReview.content), "title");
      const content = requiredString(importedReview.content, "content");
      const rating = clampRating(importedReview.rating || "5");
      const duplicateKey = importedReviewKey({
        customerEmail: importedReview.customerEmail,
        productHandle: importedReview.productHandle,
        rating,
        content
      });

      if (incomingKeys.has(duplicateKey)) {
        skippedCount += 1;
        continue;
      }
      incomingKeys.add(duplicateKey);

      preparedReviews.push({
        shopDomain,
        productId: importedReview.productId,
        productHandle: importedReview.productHandle,
        productTitle: importedReview.productTitle,
        customerName: requiredString(importedReview.customerName, "customerName"),
        customerEmail: importedReview.customerEmail,
        rating,
        title,
        content,
        status: "PUBLISHED",
        source: "IMPORTED",
        verifiedPurchase: importedReview.verifiedPurchase,
        imageUrl: importedReview.imageUrl,
        merchantReply: importedReview.merchantReply,
        repliedAt: importedReview.repliedAt,
        createdAt: importedReview.createdAt
      });
    } catch (error) {
      throw new Error(`Row ${recordIndex + 2}: ${await importErrorMessage(error)}`);
    }
  }

  if (!preparedReviews.length) {
    return { importedCount, skippedCount };
  }

  const existingReviews = await prisma.productReview.findMany({
    where: { shopDomain, source: "IMPORTED" },
    select: {
      customerEmail: true,
      productHandle: true,
      rating: true,
      content: true
    }
  });
  const existingKeys = new Set(existingReviews.map(importedReviewKey));
  const reviewsToCreate = preparedReviews.filter((review) => {
    const key = importedReviewKey(review);
    if (existingKeys.has(key)) {
      skippedCount += 1;
      return false;
    }
    existingKeys.add(key);
    return true;
  });

  const batchSize = 500;
  for (let index = 0; index < reviewsToCreate.length; index += batchSize) {
    const batch = reviewsToCreate.slice(index, index + batchSize);
    const result = await prisma.productReview.createMany({ data: batch });
    importedCount += result.count;
  }

  return { importedCount, skippedCount };
}

type ImportedCsvRow = Record<string, string>;

function normalizeImportedReviewRow(row: ImportedCsvRow, importedAt: Date, isJudgeMeCsv: boolean) {
  if (isJudgeMeCsv) {
    const reply = getCsvField(row, "reply").trim();
    const productHandle = getCsvField(row, "product_handle", "productHandle");
    const productTitle = getCsvField(row, "product_title", "productTitle") || humanizeProductHandle(productHandle);
    return {
      productId: getCsvField(row, "product_id", "productId"),
      productHandle,
      productTitle,
      customerName: getCsvField(row, "reviewer_name", "customerName"),
      customerEmail: getCsvField(row, "reviewer_email", "customerEmail"),
      rating: getCsvField(row, "rating"),
      title: getCsvField(row, "title"),
      content: getCsvField(row, "body", "content"),
      verifiedPurchase: parseBoolean(getCsvField(row, "verifiedPurchase", "verified_purchase")),
      imageUrl: firstImageUrl(getCsvField(row, "picture_urls", "imageUrl")),
      merchantReply: reply || null,
      repliedAt: reply ? parseCsvDate(getCsvField(row, "reply_date", "repliedAt")) : null,
      createdAt: parseCsvDate(getCsvField(row, "review_date", "createdAt")) || importedAt
    };
  }

  const reply = getCsvField(row, "merchantReply", "reply").trim();
  const productHandle = getCsvField(row, "productHandle", "product_handle");
  const productTitle = getCsvField(row, "productTitle", "product_title") || humanizeProductHandle(productHandle);
  return {
    productId: getCsvField(row, "productId", "product_id"),
    productHandle,
    productTitle,
    customerName: getCsvField(row, "customerName", "reviewer_name"),
    customerEmail: getCsvField(row, "customerEmail", "reviewer_email"),
    rating: getCsvField(row, "rating"),
    title: getCsvField(row, "title"),
    content: getCsvField(row, "content", "body"),
    verifiedPurchase: parseBoolean(getCsvField(row, "verifiedPurchase", "verified_purchase")),
    imageUrl: firstImageUrl(getCsvField(row, "imageUrl", "picture_urls")),
    merchantReply: reply || null,
    repliedAt: reply ? parseCsvDate(getCsvField(row, "repliedAt", "reply_date")) : null,
    createdAt: parseCsvDate(getCsvField(row, "createdAt", "review_date")) || importedAt
  };
}

async function importErrorMessage(error: unknown) {
  if (error instanceof Response) {
    const text = await error.text();
    return text || `Import failed with status ${error.status}.`;
  }

  if (error instanceof Error) {
    return error.message || "CSV import failed.";
  }

  return "CSV import failed.";
}

function getCsvField(row: ImportedCsvRow, ...names: string[]) {
  for (const name of names) {
    const value = row[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function fallbackImportedTitle(content: string) {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  if (!normalizedContent) return "";
  return normalizedContent.length > 60 ? `${normalizedContent.slice(0, 57)}...` : normalizedContent;
}

function humanizeProductHandle(handle: string) {
  return handle
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function parseBoolean(value: string) {
  return ["1", "true", "yes", "y", "on"].includes(value.trim().toLowerCase());
}

function firstImageUrl(value: string) {
  return value
    .split(/[\n,|]+/)
    .map((url) => url.trim())
    .find(Boolean) || "";
}

function importedReviewKey(review: { customerEmail?: string | null; productHandle?: string | null; rating: number; content: string }) {
  return [
    String(review.customerEmail || "").trim().toLowerCase(),
    String(review.productHandle || "").trim().toLowerCase(),
    review.rating,
    String(review.content || "").replace(/\s+/g, " ").trim().toLowerCase()
  ].join("::");
}

function parseCsvDate(value: string) {
  if (!value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function parseCsv(csvText: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
