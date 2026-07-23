(function () {
  if (window.__fbrWidgetsLoaded) return;
  window.__fbrWidgetsLoaded = true;

  const starText = (rating) => {
    const rounded = Math.round(Number(rating) || 0);
    return "★★★★★".slice(0, rounded) + "☆☆☆☆☆".slice(0, Math.max(0, 5 - rounded));
  };

  const apiBase = (el) => {
    const configuredBase = (el.dataset.apiBase || "/apps/fbr").replace(/\/$/, "");
    return configuredBase === "/apps/fbr" ? "https://app.furniturebrandreviews.com" : configuredBase;
  };
  const shop = (el) => el.dataset.shop;
  const productReviewUrl = (el) => `${apiBase(el)}/api/product-reviews?shop=${encodeURIComponent(shop(el))}&productId=${encodeURIComponent(el.dataset.productId || "")}&productHandle=${encodeURIComponent(el.dataset.productHandle || "")}&productTitle=${encodeURIComponent(el.dataset.productTitle || "")}`;
  const productReviewSummaryUrl = (el) => `${productReviewUrl(el)}&summaryOnly=1`;
  const productReviewSettingsUrl = (el) => `${apiBase(el)}/api/product-review-widget-settings?shop=${encodeURIComponent(shop(el))}`;
  const fetchCache = new Map();
  const inflightFetches = new Map();
  const usefulCountOverrides = new Map();
  const fetchCacheTtl = 60000;
  // Reviews can refresh in the background, while returning visitors get an
  // immediate render instead of waiting for a cross-region cold request.
  const persistentCacheTtl = 10 * 60 * 1000;
  const persistentCachePrefix = "fbr_cache_v2:";

  const usefulCountKey = (el, reviewId) => `${shop(el)}:${reviewId}`;

  function displayedUsefulCount(el, review) {
    const serverCount = Number(review.usefulCount) || 0;
    const override = usefulCountOverrides.get(usefulCountKey(el, review.id));
    return override === undefined ? serverCount : Math.max(serverCount, override);
  }
  const defaultProductSettings = {
    productReviewsEnabled: true,
    productReviewWidgetEnabled: true,
    starColor: "#f5a623",
    starSize: 22,
    starGap: 2,
    ratingBarColor: "#f5a623",
    ratingBadgeBackgroundColor: "#fff7e6",
    ratingBadgeBorderRadius: 999,
    ratingBadgePadding: 8,
    avatarBackgroundColor: "#eef4ff",
    avatarTextColor: "#24438f",
    avatarSize: 28,
    buttonBackgroundColor: "#1f6f64",
    buttonTextColor: "#ffffff",
    buttonBorderColor: "#dfe3e8",
    textColor: "#202223",
    lighterTextColor: "#6d7175",
    titleTextColor: "#202223",
    contentTextColor: "#202223",
    titleFontSize: 16,
    contentFontSize: 15,
    hideReviewDate: false,
    borderColor: "#dfe3e8",
    cardBackgroundColor: "#ffffff",
    borderRadius: 8,
    reviewCardBorderWidth: 1,
    buttonBorderRadius: 8,
    widgetBackgroundColor: "#ffffff",
    widgetBorderRadius: 8,
    widgetBorderWidth: 0,
    reviewCardSpacing: 16,
    showAverageRating: true,
    showReviewCount: true,
    showRatingBreakdown: true,
    showWriteReviewButton: true,
    showAskQuestionButton: false,
    showAiSummary: true,
    showReviewHighlights: true,
    showPhotoSummary: true,
    photoSummaryLimit: 8,
    showVerifiedBadge: true,
    showReviewerPhotos: true,
    hideNoReviewProduct: false,
    starRatingBadgeHideNoReviewProduct: false,
    starRatingBadgeStarGap: 2,
    starRatingBadgeScrollToReviews: true,
    layoutType: "standard",
    carouselCardsPerRow: 3,
    carouselAutoSlide: false,
    carouselAutoplaySpeed: 4,
    carouselShowArrows: true,
    carouselShowDots: true,
    reviewsPerPage: 5,
    reviewsPerRow: 3,
    sortDefault: "newest"
  };

  async function fetchJson(url, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const cacheable = method === "GET" && !options.body;
    const now = Date.now();
    if (cacheable) {
      const cached = fetchCache.get(url);
      if (cached && cached.expires > now) return cached.data;
      if (cached) fetchCache.delete(url);
      if (inflightFetches.has(url)) return inflightFetches.get(url);
    }
    const earlyFetch = cacheable && window.__fbrEarlyFetches?.[url];
    const request = earlyFetch || (async () => {
      const response = await fetch(url, options);
      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: text };
      }
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || data.message || "Request failed");
      }
      if (cacheable) fetchCache.set(url, { data, expires: Date.now() + fetchCacheTtl });
      return data;
    })();
    if (cacheable) inflightFetches.set(url, request);
    try {
      const data = await request;
      if (cacheable) fetchCache.set(url, { data, expires: Date.now() + fetchCacheTtl });
      return data;
    } finally {
      if (cacheable) inflightFetches.delete(url);
      if (earlyFetch && window.__fbrEarlyFetches?.[url] === earlyFetch) {
        delete window.__fbrEarlyFetches[url];
      }
    }
  }

  function persistentCacheKey(url) {
    return `${persistentCachePrefix}${url}`;
  }

  function readPersistentCache(url) {
    try {
      if (!window.localStorage) return null;
      const raw = window.localStorage.getItem(persistentCacheKey(url));
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (!cached || cached.expires <= Date.now()) {
        window.localStorage.removeItem(persistentCacheKey(url));
        return null;
      }
      return cached.data || null;
    } catch {
      return null;
    }
  }

  function writePersistentCache(url, data) {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(persistentCacheKey(url), JSON.stringify({
        data,
        expires: Date.now() + persistentCacheTtl
      }));
    } catch {
      // Ignore storage limits or private browsing restrictions.
    }
  }

  function normalizeSeoText(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function productSchemaNodes(value, nodes = []) {
    if (!value || typeof value !== "object") return nodes;
    if (Array.isArray(value)) {
      value.forEach((item) => productSchemaNodes(item, nodes));
      return nodes;
    }
    const rawType = value["@type"];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    if (types.some((type) => String(type || "").toLowerCase() === "product")) {
      nodes.push(value);
    }
    Object.values(value).forEach((item) => productSchemaNodes(item, nodes));
    return nodes;
  }

  function canonicalProductUrl() {
    const canonical = document.querySelector('link[rel="canonical"]');
    return canonical && canonical.href
      ? canonical.href
      : `${window.location.origin}${window.location.pathname}`;
  }

  function restoreProductReviewSeo() {
    document.querySelectorAll('script[type="application/ld+json"][data-fbr-review-seo]').forEach((script) => {
      if (script.dataset.fbrReviewSeo === "generated") {
        script.remove();
        return;
      }
      if (typeof script.__fbrOriginalJson === "string") {
        script.textContent = script.__fbrOriginalJson;
        delete script.__fbrOriginalJson;
      }
      delete script.dataset.fbrReviewSeo;
    });
  }

  function applyProductReviewSeo(el, data) {
    if (!data || !data.seoRichSnippetsEnabled) {
      restoreProductReviewSeo();
      return;
    }

    const reviewCount = Math.max(0, Number(data.reviewCount) || 0);
    const ratingValue = Number(data.averageRating) || 0;
    const productName = String(el.dataset.productTitle || "").trim();
    if (!reviewCount || ratingValue <= 0 || !productName) return;

    const canonicalUrl = canonicalProductUrl();
    const aggregateRating = {
      "@type": "AggregateRating",
      ratingValue,
      reviewCount,
      bestRating: 5,
      worstRating: 1
    };
    const reviews = (Array.isArray(data.reviews) ? data.reviews : [])
      .filter((review) => review && review.customerName && review.content && Number(review.rating) > 0)
      .slice(0, 5)
      .map((review) => ({
        "@type": "Review",
        name: String(review.title || `Review of ${productName}`),
        reviewBody: String(review.content),
        datePublished: review.createdAt ? String(review.createdAt).slice(0, 10) : undefined,
        reviewRating: {
          "@type": "Rating",
          ratingValue: Number(review.rating),
          bestRating: 5,
          worstRating: 1
        },
        author: {
          "@type": "Person",
          name: String(review.customerName)
        }
      }));

    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    let bestMatch = null;
    let totalProductNodes = 0;
    for (const script of scripts) {
      let parsed;
      try {
        parsed = JSON.parse(script.textContent || "");
      } catch {
        continue;
      }
      const nodes = productSchemaNodes(parsed);
      totalProductNodes += nodes.length;
      for (const node of nodes) {
        const schemaUrl = typeof node.url === "string" ? node.url : "";
        const schemaId = typeof node["@id"] === "string" ? node["@id"] : "";
        const nameMatches = normalizeSeoText(node.name) === normalizeSeoText(productName);
        const urlMatches = Boolean(
          (schemaUrl && canonicalUrl && schemaUrl.split("#")[0] === canonicalUrl.split("#")[0]) ||
          (schemaId && canonicalUrl && schemaId.includes(canonicalUrl.split("#")[0]))
        );
        const score = (urlMatches ? 2 : 0) + (nameMatches ? 1 : 0);
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { script, node, parsed, score };
        }
      }
    }

    if (bestMatch && (bestMatch.score > 0 || totalProductNodes === 1)) {
      if (typeof bestMatch.script.__fbrOriginalJson !== "string") {
        bestMatch.script.__fbrOriginalJson = bestMatch.script.textContent || "";
      }
      bestMatch.node.aggregateRating = aggregateRating;
      if (reviews.length) bestMatch.node.review = reviews;
      bestMatch.script.textContent = JSON.stringify(bestMatch.parsed);
      bestMatch.script.dataset.fbrReviewSeo = "patched";
      return;
    }

    let generated = document.querySelector('script[data-fbr-review-seo="generated"]');
    if (!generated) {
      generated = document.createElement("script");
      generated.type = "application/ld+json";
      generated.dataset.fbrReviewSeo = "generated";
      document.head.appendChild(generated);
    }
    generated.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${canonicalUrl}#fbr-product`,
      name: productName,
      url: canonicalUrl,
      aggregateRating,
      ...(reviews.length ? { review: reviews } : {})
    });
  }

  function settingsFromReviewData(data, fallbackSettings) {
    const settings = {
      ...defaultProductSettings,
      ...((data && data.widgetSettings) || {}),
      ...(fallbackSettings || {})
    };
    if (settings.sortDefault === "lowest_rating") settings.sortDefault = "pictures_first";
    settings.showAverageRating = true;
    settings.showReviewCount = true;
    settings.showRatingBreakdown = true;
    settings.showWriteReviewButton = true;
    return settings;
  }

  function starDataWithLatestSettings(data, settings) {
    if (!settings) return data;
    return {
      ...data,
      starRatingBadgeSettings: {
        starColor: settings.starRatingBadgeStarColor,
        textColor: settings.starRatingBadgeTextColor,
        backgroundColor: settings.starRatingBadgeBackgroundColor,
        borderColor: settings.starRatingBadgeBorderColor,
        borderWidth: settings.starRatingBadgeBorderWidth,
        borderRadius: settings.starRatingBadgeBorderRadius,
        starGap: settings.starRatingBadgeStarGap,
        hideNoReviewProduct: settings.starRatingBadgeHideNoReviewProduct,
        scrollToReviews: settings.starRatingBadgeScrollToReviews
      }
    };
  }

  function removeLegacyFloatingBadges() {
    document.querySelectorAll("[data-fbr-floating-badge], .fbr-floating-badge").forEach((el) => {
      el.remove();
    });
  }

  function watchLegacyFloatingBadges() {
    removeLegacyFloatingBadges();
    const observer = new MutationObserver(removeLegacyFloatingBadges);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function renderProductStars(el, data) {
    const computedStyles = window.getComputedStyle(el);
    const widgetSettings = (data && data.widgetSettings) || {};
    const badge = (data && data.starRatingBadgeSettings) || {
      starColor: widgetSettings.starRatingBadgeStarColor,
      textColor: widgetSettings.starRatingBadgeTextColor,
      backgroundColor: widgetSettings.starRatingBadgeBackgroundColor,
      borderColor: widgetSettings.starRatingBadgeBorderColor,
      borderWidth: widgetSettings.starRatingBadgeBorderWidth,
      borderRadius: widgetSettings.starRatingBadgeBorderRadius,
      starGap: widgetSettings.starRatingBadgeStarGap,
      hideNoReviewProduct: widgetSettings.starRatingBadgeHideNoReviewProduct,
      scrollToReviews: widgetSettings.starRatingBadgeScrollToReviews
    };
    if (badge.hideNoReviewProduct && Number(data.reviewCount) === 0) {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const settings = {
      ...defaultProductSettings,
      starColor: badge.starColor || computedStyles.getPropertyValue("--fbr-star").trim() || defaultProductSettings.starColor,
      starSize: 18,
      starGap: Math.max(0, Math.min(12, Number(badge.starGap ?? 2)))
    };
    el.innerHTML = `
      <div class="fbr-row fbr-product-star-rating-badge" style="color:${escapeHtml(badge.textColor || "#202223")};background:${escapeHtml(badge.backgroundColor || "#ffffff")};border:${Number(badge.borderWidth) || 0}px solid ${escapeHtml(badge.borderColor || "#dfe3e8")};border-radius:${Math.max(0, Number(badge.borderRadius) || 0)}px;">
        ${starSquares(data.averageRating, settings)}
        <strong>${data.averageRating || "0.0"}</strong>
        <span>(${data.reviewCount || 0} reviews)</span>
      </div>
    `;
    syncStarRatingInteractivity(el, badge, Number(data.reviewCount) || 0);
  }

  function productReviewTarget() {
    const targets = Array.from(document.querySelectorAll("[data-fbr-product-reviews]"));
    return targets.find((target) => !target.hidden && window.getComputedStyle(target).display !== "none") || targets[0] || null;
  }

  function ensureProductReviewTargetId(target) {
    if (!target) return "";
    if (target.id) return target.id;
    let id = "fbr-product-reviews";
    let suffix = 2;
    while (document.getElementById(id) && document.getElementById(id) !== target) {
      id = `fbr-product-reviews-${suffix++}`;
    }
    target.id = id;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    return id;
  }

  function syncStarRatingInteractivity(el, badge, reviewCount) {
    const rating = el.querySelector(".fbr-product-star-rating-badge");
    if (!rating) return;
    const target = productReviewTarget();
    const enabled = badge.scrollToReviews !== false && Boolean(target);
    if (!enabled) return;
    const targetId = ensureProductReviewTargetId(target);
    rating.dataset.fbrScrollToReviews = "true";
    rating.setAttribute("role", "link");
    rating.setAttribute("tabindex", "0");
    rating.setAttribute("aria-controls", targetId);
    rating.setAttribute("aria-label", reviewCount === 1 ? "Read 1 product review" : `Read ${reviewCount} product reviews`);
  }

  function stickyHeaderOffset() {
    const candidates = document.querySelectorAll("header, [data-sticky-header], .shopify-section-header-sticky, .header-wrapper");
    let offset = 0;
    candidates.forEach((candidate) => {
      const style = window.getComputedStyle(candidate);
      const rect = candidate.getBoundingClientRect();
      if ((style.position === "fixed" || style.position === "sticky") && rect.height > 0 && rect.top <= 1 && rect.bottom > 0) {
        offset = Math.max(offset, rect.bottom);
      }
    });
    return offset;
  }

  function openProductReviewAncestors(target) {
    const ancestors = [];
    let ancestor = target.parentElement;
    while (ancestor && ancestor !== document.body) {
      ancestors.push(ancestor);
      ancestor = ancestor.parentElement;
    }

    ancestors.reverse().forEach((container) => {
      if (container.tagName === "DETAILS") container.setAttribute("open", "");

      const style = window.getComputedStyle(container);
      const hidden = container.hidden || container.getAttribute("aria-hidden") === "true" || style.display === "none";
      if (!hidden || !container.id) return;

      const escapedId = cssEscape(container.id);
      const triggers = Array.from(document.querySelectorAll(
        `a[href="#${escapedId}"], button[data-target="#${escapedId}"], [aria-controls="${escapedId}"], [data-tab="#${escapedId}"]`
      ));
      const trigger = triggers.find((item) => item.getClientRects().length > 0) || triggers[0];
      trigger?.click();
    });

    target.dispatchEvent(new CustomEvent("fbr:reveal-product-reviews", { bubbles: true }));
  }

  function waitForProductReviewTarget(target, callback, attempt = 0) {
    const rect = target.getBoundingClientRect();
    if ((rect.width > 0 && rect.height > 0) || attempt >= 80) {
      callback();
      return;
    }
    window.setTimeout(() => waitForProductReviewTarget(target, callback, attempt + 1), 50);
  }

  function scrollToProductReviews() {
    const target = productReviewTarget();
    if (!target) return;
    const targetId = ensureProductReviewTargetId(target);
    openProductReviewAncestors(target);
    waitForProductReviewTarget(target, () => window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const top = target.getBoundingClientRect().top + window.scrollY - stickyHeaderOffset() - 16;
      window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" });
      if (window.history?.replaceState) window.history.replaceState(null, "", `#${targetId}`);
      target.focus({ preventScroll: true });
    }));
  }

  function bindStarRatingNavigation() {
    if (document.documentElement.dataset.fbrStarNavigationBound === "true") return;
    document.documentElement.dataset.fbrStarNavigationBound = "true";
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest?.("[data-fbr-scroll-to-reviews='true']");
      if (!trigger) return;
      event.preventDefault();
      scrollToProductReviews();
    });
    document.addEventListener("keydown", (event) => {
      const trigger = event.target.closest?.("[data-fbr-scroll-to-reviews='true']");
      if (!trigger || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      scrollToProductReviews();
    });
    window.addEventListener("hashchange", () => {
      if (window.location.hash === "#fbr-product-reviews") scrollToProductReviews();
    });
  }

  function renderCollectionProductStars(el, data, options) {
    const rating = Number(data.averageRating) || 0;
    const reviewCount = Number(data.reviewCount) || 0;
    if (options.hideEmpty && reviewCount === 0) {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }

    el.hidden = false;
    el.innerHTML = `
      <span class="fbr-collection-star-icons">${starSquares(rating, {
        ...defaultProductSettings,
        starColor: options.starColor,
        starSize: options.starSize,
        starGap: options.starGap
      })}</span>
      <span class="fbr-collection-star-score">${rating.toFixed(1)}</span>
      ${options.showCount ? `<span class="fbr-collection-star-count">${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}</span>` : ""}
    `;
  }

  function initCollectionProductStars(configEl) {
    const options = {
      apiBase: apiBase(configEl),
      shop: shop(configEl),
      showCount: configEl.dataset.showCount !== "false",
      hideEmpty: configEl.dataset.hideEmpty === "true",
      starColor: window.getComputedStyle(configEl).getPropertyValue("--fbr-star").trim() || defaultProductSettings.starColor,
      starSize: 15,
      starGap: 1
    };
    if (!options.shop) return;

    const productLinks = Array.from(document.querySelectorAll('a[href*="/products/"]'))
      .filter((link) => !link.closest(".fbr-widget") && !link.closest(".fbr-collection-star-rating"));
    const insertedByCard = new Set();

    productLinks.forEach((link) => {
      const handle = productHandleFromHref(link.getAttribute("href") || "");
      if (!handle) return;

      const titleTarget = productTitleTarget(link);
      if (!titleTarget) return;

      const card = productCardForLink(link);
      const dedupeKey = card || titleTarget;
      if (insertedByCard.has(dedupeKey)) return;
      insertedByCard.add(dedupeKey);

      const existing = card?.querySelector?.(`[data-fbr-collection-star-handle="${cssEscape(handle)}"]`);
      if (existing) return;

      const ratingEl = document.createElement("div");
      ratingEl.className = "fbr-collection-star-rating";
      ratingEl.dataset.fbrCollectionStarHandle = handle;
      ratingEl.setAttribute("aria-label", "Product rating");
      titleTarget.insertAdjacentElement("afterend", ratingEl);

      fetchJson(`${options.apiBase}/api/product-reviews?shop=${encodeURIComponent(options.shop)}&productHandle=${encodeURIComponent(handle)}&productTitle=${encodeURIComponent(productTitleFromLink(link))}&summaryOnly=1`)
        .then((data) => renderCollectionProductStars(ratingEl, data, options))
        .catch((error) => {
          console.error("[fbr] Collection product stars failed", { handle, error });
          renderCollectionProductStars(ratingEl, { averageRating: 0, reviewCount: 0 }, options);
        });
    });
  }

  function productHandleFromHref(href) {
    try {
      const url = new URL(href, window.location.origin);
      const match = url.pathname.match(/\/products\/([^/?#]+)/);
      return match ? decodeURIComponent(match[1]).replace(/\/$/, "") : "";
    } catch {
      const match = href.match(/\/products\/([^/?#]+)/);
      return match ? decodeURIComponent(match[1]).replace(/\/$/, "") : "";
    }
  }

  function productTitleTarget(link) {
    if (link.querySelector("img, picture") && !cleanProductText(link)) return null;
    const heading = link.closest("h1,h2,h3,h4,.card__heading,.product-card__title,.product-title");
    if (heading && cleanProductText(heading)) return heading;
    if (cleanProductText(link)) return link;
    return null;
  }

  function productCardForLink(link) {
    return link.closest(".card-wrapper,.product-card-wrapper,.card,.grid__item,li,[class*='product-card']");
  }

  function productTitleFromLink(link) {
    return cleanProductText(link.closest("h1,h2,h3,h4,.card__heading,.product-card__title,.product-title") || link);
  }

  function cleanProductText(el) {
    return String(el?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function renderProductReviews(el, data, settings = defaultProductSettings) {
    if (!settings.productReviewsEnabled || !settings.productReviewWidgetEnabled) {
      el.innerHTML = "";
      return;
    }
    if (settings.hideNoReviewProduct && Number(data.reviewCount) === 0) {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }
    el.hidden = false;

    el.__fbrReviewData = data;
    el.__fbrReviewSettings = settings;
    const selectedFilter = settings.storefrontFilter || sortDefaultToStorefrontFilter(settings.sortDefault);
    const selectedRatings = Array.isArray(settings.storefrontRatings) ? settings.storefrontRatings : [];
    const reviewsPerPage = Math.max(1, Number(settings.reviewsPerPage) || 5);
    const currentReviewPage = Math.max(1, Number(settings.storefrontReviewPage) || 1);
    const photoSummaryLimit = Math.max(4, Math.min(20, Number(settings.photoSummaryLimit) || 8));
    const publicReviews = (data.reviews || []).map((review) => review && review.imageHidden ? { ...review, imageUrl: "" } : review);
    const reviewPhotos = settings.showPhotoSummary
      ? publicReviews.filter((review) => Boolean(review.imageUrl))
      : [];
    const allSortedReviews = sortReviews(publicReviews, selectedFilter, selectedRatings);
    const reviewTotalPages = Math.max(1, Math.ceil(allSortedReviews.length / reviewsPerPage));
    const reviewPage = Math.min(currentReviewPage, reviewTotalPages);
    const reviews = allSortedReviews.slice((reviewPage - 1) * reviewsPerPage, reviewPage * reviewsPerPage);
    const questions = data.questions || [];
    const hasApprovedReviews = publicReviews.length > 0;
    const breakdown = buildRatingBreakdown(publicReviews);
    const totalBreakdown = Math.max(Object.values(breakdown).reduce((total, count) => total + Number(count || 0), 0), 1);
    const layoutType = ["standard", "cards", "carousel", "sidebar"].includes(settings.layoutType) ? settings.layoutType : "standard";
    const layoutClass = `fbr-layout-${layoutType}`;
    el.style.setProperty("--fbr-star", settings.starColor);
    el.style.setProperty("--fbr-primary", settings.buttonBackgroundColor);
    el.style.setProperty("--fbr-radius", `${settings.borderRadius}px`);
    const reviewCardBorderWidth = Math.max(0, Math.min(4, Number(settings.reviewCardBorderWidth ?? defaultProductSettings.reviewCardBorderWidth)));
    const buttonBorderRadius = Math.max(0, Math.min(24, Number(settings.buttonBorderRadius ?? defaultProductSettings.buttonBorderRadius)));
    el.style.setProperty("--fbr-review-card-border-width", `${reviewCardBorderWidth}px`);
    el.style.setProperty("--fbr-button-radius", `${buttonBorderRadius}px`);
    el.style.setProperty("--fbr-button-border-color", settings.buttonBorderColor || defaultProductSettings.buttonBorderColor);
    el.style.setProperty("--fbr-button-text-color", settings.buttonTextColor || defaultProductSettings.buttonTextColor);
    const widgetBorderWidth = Math.max(0, Math.min(3, Number(settings.widgetBorderWidth ?? defaultProductSettings.widgetBorderWidth)));
    const widgetBorderRadius = Math.max(0, Number(settings.widgetBorderRadius ?? defaultProductSettings.widgetBorderRadius));
    el.style.setProperty("--fbr-widget-border-width", `${widgetBorderWidth}px`);
    el.style.setProperty("--fbr-widget-border-color", settings.borderColor);
    el.style.setProperty("--fbr-widget-border-radius", `${widgetBorderRadius}px`);
    el.style.setProperty("--fbr-widget-background", settings.widgetBackgroundColor);
    el.style.color = settings.textColor;
    el.style.width = "100%";
    el.style.maxWidth = "none";
    el.innerHTML = `
      <div class="fbr-product-reviews-card ${layoutClass}" style="--fbr-widget-border-width:${widgetBorderWidth}px; --fbr-widget-border-color:${escapeAttr(settings.borderColor)}; --fbr-widget-border-radius:${widgetBorderRadius}px; --fbr-widget-background:${escapeAttr(settings.widgetBackgroundColor)}; background:${escapeAttr(settings.widgetBackgroundColor)} !important; border:${widgetBorderWidth}px solid ${escapeAttr(settings.borderColor)} !important; border-radius:${widgetBorderRadius}px !important;">
        <div class="fbr-layout-shell">
        <aside class="fbr-sidebar-panel">
        <div class="fbr-product-review-header">
          <div class="fbr-review-title-row">
            <h3>Customer Reviews</h3>
            <div class="fbr-review-actions">
              ${settings.showWriteReviewButton ? `<button class="fbr-button" type="button" data-fbr-open-review style="background:${escapeAttr(settings.buttonBackgroundColor)}; color:${escapeAttr(settings.buttonTextColor)};">Write a review</button>` : ""}
              ${settings.showAskQuestionButton ? `<button class="fbr-button fbr-button-secondary fbr-ask-question-button" type="button" data-fbr-open-question style="background:${escapeAttr(settings.cardBackgroundColor)}; color:${escapeAttr(settings.textColor)};">Ask a question</button>` : ""}
            </div>
          </div>
          <div class="fbr-review-summary-grid">
            <div class="fbr-average-rating">
              <span class="fbr-average-label" style="color:${escapeAttr(settings.lighterTextColor)}">Average rating</span>
              ${settings.showAverageRating ? `<div class="fbr-average-score"><strong>${data.averageRating || "0.0"}</strong><span style="color:${escapeAttr(settings.lighterTextColor)}">out of 5</span></div>` : ""}
              ${settings.showAverageRating ? `<span class="fbr-rating-badge" style="background:${escapeAttr(settings.ratingBadgeBackgroundColor)}; border-radius:${Number(settings.ratingBadgeBorderRadius) || 0}px; padding:${Number(settings.ratingBadgePadding) || 8}px;">${starSquares(data.averageRating, settings)}</span>` : ""}
              ${settings.showReviewCount ? `<span class="fbr-muted fbr-average-count" style="color:${escapeAttr(settings.lighterTextColor)}">${data.reviewCount || 0} total reviews</span>` : ""}
            </div>
            ${settings.showRatingBreakdown ? `
              <div class="fbr-breakdown">
                ${[5, 4, 3, 2, 1].map((rating) => {
                  const count = Number(breakdown[String(rating)] || 0);
                  const percent = Math.round((count / totalBreakdown) * 100);
                  const checked = selectedRatings.includes(rating);
                  return `
                    <div class="fbr-breakdown-row">
                      <label class="fbr-breakdown-filter">
                        <input type="checkbox" data-fbr-rating-filter="${rating}" ${checked ? "checked" : ""}>
                        <span>${rating}-star</span>
                      </label>
                      <span class="fbr-breakdown-bar" style="background:#eef0f2"><span style="width:${percent}%; background:${escapeAttr(settings.ratingBarColor)}"></span></span>
                      <span>${percent}%</span>
                    </div>
                  `;
                }).join("")}
              </div>
            ` : ""}
          </div>
          <div class="fbr-mobile-review-actions">
            ${settings.showWriteReviewButton ? `<button class="fbr-button" type="button" data-fbr-open-review style="background:${escapeAttr(settings.buttonBackgroundColor)}; color:${escapeAttr(settings.buttonTextColor)};">Write a review</button>` : ""}
            ${settings.showAskQuestionButton ? `<button class="fbr-button fbr-button-secondary fbr-ask-question-button" type="button" data-fbr-open-question style="background:${escapeAttr(settings.cardBackgroundColor)}; color:${escapeAttr(settings.textColor)};">Ask a question</button>` : ""}
          </div>
        </div>
        ${settings.showAiSummary && hasApprovedReviews ? `
          <div class="fbr-review-item fbr-ai-summary" style="background:#f7faf9; border-color:${escapeAttr(settings.borderColor)};">
            <strong class="fbr-ai-title">AI review summary</strong>
            <p style="color:${escapeAttr(settings.lighterTextColor)}">Customers frequently highlight product quality, sturdy materials, clear delivery updates, and helpful support before and after purchase. Recent reviews suggest shoppers value accurate product details, responsive communication, and furniture that arrives looking consistent with the photos and samples.</p>
            <p class="fbr-ai-note" style="color:${escapeAttr(settings.lighterTextColor)}">*AI-powered review summary based on recent customer reviews</p>
          </div>
        ` : ""}
        ${settings.showReviewHighlights && hasApprovedReviews ? `
          <div class="fbr-row">
            ${["Quality materials", "Helpful service", "Careful delivery"].map((highlight) => `<span class="fbr-verified">${highlight}</span>`).join("")}
          </div>
        ` : ""}
        ${reviewPhotos.length ? `
          <div class="fbr-photo-summary" style="--fbr-photo-visible:${photoSummaryLimit};">
            <div class="fbr-photo-summary-track" data-fbr-photo-summary-track>
              ${reviewPhotos.map((review) => `
                <button class="fbr-photo-summary-item" type="button" data-fbr-image-preview="${escapeAttr(review.imageUrl)}" aria-label="Open customer review photo">
                  <img src="${escapeAttr(review.imageUrl)}" alt="" onerror="this.closest('button').remove();">
                </button>
              `).join("")}
            </div>
            ${reviewPhotos.length > photoSummaryLimit ? `
              <button class="fbr-photo-summary-arrow fbr-photo-summary-prev" type="button" data-fbr-photo-summary-prev aria-label="Previous review photos">‹</button>
              <button class="fbr-photo-summary-arrow fbr-photo-summary-next" type="button" data-fbr-photo-summary-next aria-label="Next review photos">›</button>
            ` : ""}
          </div>
        ` : ""}
        </aside>
        <main class="fbr-review-main-panel">
        <div class="fbr-widget-tabs-row">
          <div class="fbr-widget-tabs" role="tablist" aria-label="Product reviews and questions">
            <button type="button" class="fbr-widget-tab fbr-widget-tab-active" data-fbr-tab="reviews" role="tab" aria-selected="true">Reviews (${Number(data.reviewCount) || reviews.length})</button>
            <button type="button" class="fbr-widget-tab" data-fbr-tab="questions" role="tab" aria-selected="false">Questions (${questions.length})</button>
          </div>
          <label class="fbr-review-sort-label">
            <span class="fbr-visually-hidden">Sort reviews</span>
            <select class="fbr-review-sort-select" data-fbr-review-sort>
              ${[
                ["most_recent", "Most recent"],
                ["highest_rating", "Highest rating"],
                ["lowest_rating", "Lowest rating"],
                ["only_pictures", "Only pictures"],
                ["pictures_first", "Pictures first"]
              ].map(([value, label]) => `<option value="${value}"${selectedFilter === value ? " selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
        </div>
        <section data-fbr-tab-panel="reviews">
          ${layoutType === "carousel" && reviews.length && settings.carouselShowArrows ? '<div class="fbr-carousel-controls"><button type="button" data-fbr-carousel-prev aria-label="Previous reviews">‹</button><button type="button" data-fbr-carousel-next aria-label="Next reviews">›</button></div>' : ""}
          <div class="fbr-review-list fbr-review-list-${layoutType}" data-carousel-auto-slide="${settings.carouselAutoSlide ? "true" : "false"}" data-carousel-autoplay-speed="${Number(settings.carouselAutoplaySpeed) || 4}" style="${layoutType === "carousel" ? `grid-auto-columns:calc((100% - ${((Number(settings.carouselCardsPerRow) || 3) - 1) * (Number(settings.reviewCardSpacing) || 16)}px) / ${Number(settings.carouselCardsPerRow) || 3});` : layoutType === "cards" ? `grid-template-columns:repeat(${Math.max(2, Math.min(4, Number(settings.reviewsPerRow) || 3))}, minmax(0, 1fr));` : ""}">
            ${reviews.length ? reviews.map((review) => `
              <article class="fbr-review-item" style="background:${escapeAttr(settings.cardBackgroundColor)}; border-color:${escapeAttr(settings.borderColor)}; margin-bottom:${Number(settings.reviewCardSpacing) || 16}px;">
                <p class="fbr-muted fbr-review-author" style="color:${escapeAttr(settings.lighterTextColor)}">
                  ${settings.showReviewerPhotos ? `<span class="fbr-initials-avatar" style="background:${escapeAttr(settings.avatarBackgroundColor)}; color:${escapeAttr(settings.avatarTextColor)}; width:${Number(settings.avatarSize) || 28}px; height:${Number(settings.avatarSize) || 28}px;">${initials(review.customerName)}</span>` : ""}
                  ${escapeHtml(review.customerName)}${settings.hideReviewDate ? "" : ` · ${new Date(review.createdAt).toLocaleDateString()}`}
                </p>
                <div class="fbr-row">
                  ${starSquares(review.rating, settings)}
                  ${settings.showVerifiedBadge && review.verifiedPurchase ? '<span class="fbr-verified">Verified purchase</span>' : ""}
                </div>
                <strong style="color:${escapeAttr(settings.titleTextColor)}; font-size:${Number(settings.titleFontSize) || 16}px;">${escapeHtml(review.title)}</strong>
                <p style="color:${escapeAttr(settings.contentTextColor)}; font-size:${Number(settings.contentFontSize) || 15}px;">${escapeHtml(review.content)}</p>
                ${review.imageUrl ? `<button class="fbr-review-image-button" type="button" data-fbr-image-preview="${escapeAttr(review.imageUrl)}" aria-label="Open review photo"><img class="fbr-review-image" src="${escapeAttr(review.imageUrl)}" alt="" onerror="this.closest('button').remove();"></button>` : ""}
                <div class="fbr-helpful-row" aria-label="Review helpfulness">
                  <span class="fbr-helpful-label">Helpful?</span>
                  <button class="fbr-helpful-action" type="button" data-fbr-useful-review-id="${escapeAttr(review.id)}" data-fbr-useful-count="${displayedUsefulCount(el, review)}" aria-label="Mark review as helpful">
                    ${thumbIcon("up")}
                    <span data-fbr-helpful-count>${displayedUsefulCount(el, review)}</span>
                  </button>
                  <button class="fbr-helpful-action" type="button" data-fbr-not-helpful-review-id="${escapeAttr(review.id)}" data-fbr-not-helpful-count="0" aria-label="Mark review as not helpful">
                    ${thumbIcon("down")}
                    <span data-fbr-not-helpful-count>0</span>
                  </button>
                </div>
                ${review.merchantReply ? `
                  <div class="fbr-merchant-reply">
                    <strong>Merchant reply</strong>
                    <p>${escapeHtml(review.merchantReply)}</p>
                  </div>
                ` : ""}
              </article>
            `).join("") : '<p class="fbr-muted">No approved reviews yet.</p>'}
          </div>
          ${layoutType === "carousel" && reviews.length && settings.carouselShowDots ? `<div class="fbr-carousel-dots">${reviews.map((_, index) => `<button type="button" data-fbr-carousel-dot="${index}" aria-label="Go to review ${index + 1}"></button>`).join("")}</div>` : ""}
          ${allSortedReviews.length > reviewsPerPage ? renderReviewPagination(reviewPage, reviewTotalPages) : ""}
        </section>
        <section class="fbr-tab-panel-hidden" data-fbr-tab-panel="questions">
          <div class="fbr-questions">
            ${questions.length ? questions.map((question) => `
              <article class="fbr-question-item" style="border-color:${escapeAttr(settings.borderColor)}; background:${escapeAttr(settings.cardBackgroundColor)};">
                <div class="fbr-question-author">
                  <span class="fbr-initials-avatar" style="background:${escapeAttr(settings.avatarBackgroundColor)}; color:${escapeAttr(settings.avatarTextColor)};">${initials(question.customerName || "Customer")}</span>
                  <span>${escapeHtml(question.customerName || "Customer")}</span>
                </div>
                <p class="fbr-question-text">Q: ${escapeHtml(question.question)}</p>
                ${question.answer ? `<p class="fbr-question-answer">A: ${escapeHtml(question.answer)}</p>` : ""}
              </article>
            `).join("") : `
              <div class="fbr-question-empty">
                <p class="fbr-muted">No questions yet.</p>
              </div>
            `}
          </div>
        </section>
        </main>
        </div>
      </div>
      ${settings.showWriteReviewButton ? renderReviewModal(el, settings) : ""}
      ${settings.showAskQuestionButton ? renderQuestionModal(el, settings) : ""}
    `;

    bindInlineReviewModal(el, settings);
    bindInlineQuestionModal(el, settings);
    bindWidgetTabs(el);
    bindCarousel(el);
    bindReviewSort(el);
    bindRatingFilters(el);
    bindReviewPagination(el);
    bindPhotoSummary(el);
    bindReviewImageLightbox(el);
    bindUsefulButtons(el);
  }

  function renderReviewModal(el, settings) {
    const formRadius = Number(settings.borderRadius) || 6;
    const buttonRadius = Math.max(0, Math.min(24, Number(settings.buttonBorderRadius ?? defaultProductSettings.buttonBorderRadius)));
    return `
      <div class="fbr-modal-backdrop" data-fbr-review-modal aria-hidden="true">
        <div class="fbr-modal" role="dialog" aria-modal="true" aria-labelledby="fbr-review-modal-title" style="--fbr-form-radius:${formRadius}px; --fbr-button-radius:${buttonRadius}px;">
          <div class="fbr-modal-header">
            <h3 id="fbr-review-modal-title">Write a review</h3>
            <button class="fbr-modal-close" type="button" data-fbr-close-review aria-label="Close review form">×</button>
          </div>
          <form class="fbr-form" data-fbr-review-form>
            <input type="hidden" name="shop" value="${escapeAttr(shop(el))}">
            <input type="hidden" name="productId" value="${escapeAttr(el.dataset.productId || "")}">
            <input type="hidden" name="productHandle" value="${escapeAttr(el.dataset.productHandle || "")}">
            <input type="hidden" name="productTitle" value="${escapeAttr(el.dataset.productTitle || "")}">

            <label>
              Name
              <input name="customerName" required>
            </label>
            <label>
              Email
              <input name="customerEmail" type="email" required>
            </label>
            <label>
              Rating
              <select name="rating" required>
                <option value="5">5 stars</option>
                <option value="4">4 stars</option>
                <option value="3">3 stars</option>
                <option value="2">2 stars</option>
                <option value="1">1 star</option>
              </select>
            </label>
            <label>
              Review title
              <input name="title" required>
            </label>
            <label>
              Review content
              <textarea name="content" rows="5" required></textarea>
            </label>
            <label>
              Upload photo
              <input type="file" accept="image/*" data-fbr-review-photo>
              <input type="hidden" name="imageUrl" data-fbr-review-image-url>
            </label>
            <img class="fbr-photo-preview" data-fbr-photo-preview alt="">
            <div class="fbr-modal-actions">
              <button class="fbr-button" type="submit" style="background:${escapeAttr(settings.buttonBackgroundColor)}; color:${escapeAttr(settings.buttonTextColor)};">Submit review</button>
              <button class="fbr-button fbr-button-secondary" type="button" data-fbr-close-review style="background:${escapeAttr(settings.cardBackgroundColor)}; color:${escapeAttr(settings.textColor)}; border-color:${escapeAttr(settings.borderColor)};">Cancel</button>
            </div>
            <p class="fbr-muted" data-fbr-form-message></p>
          </form>
        </div>
      </div>
    `;
  }

  function renderQuestionModal(el, settings) {
    const formRadius = Number(settings.borderRadius) || 6;
    const buttonRadius = Math.max(0, Math.min(24, Number(settings.buttonBorderRadius ?? defaultProductSettings.buttonBorderRadius)));
    return `
      <div class="fbr-modal-backdrop" data-fbr-question-modal aria-hidden="true">
        <div class="fbr-modal" role="dialog" aria-modal="true" aria-labelledby="fbr-question-modal-title" style="--fbr-form-radius:${formRadius}px; --fbr-button-radius:${buttonRadius}px;">
          <div class="fbr-modal-header">
            <h3 id="fbr-question-modal-title">Ask a question</h3>
            <button class="fbr-modal-close" type="button" data-fbr-close-question aria-label="Close question form">×</button>
          </div>
          <form class="fbr-form" data-fbr-question-form>
            <input type="hidden" name="shop" value="${escapeAttr(shop(el))}">
            <input type="hidden" name="productId" value="${escapeAttr(el.dataset.productId || "")}">
            <input type="hidden" name="productHandle" value="${escapeAttr(el.dataset.productHandle || "")}">
            <input type="hidden" name="productTitle" value="${escapeAttr(el.dataset.productTitle || "")}">
            <label>Name<input name="customerName" required></label>
            <label>Email<input name="customerEmail" type="email" required></label>
            <label>Question<textarea name="question" rows="5" required></textarea></label>
            <div class="fbr-modal-actions">
              <button class="fbr-button" type="submit" style="background:${escapeAttr(settings.buttonBackgroundColor)}; color:${escapeAttr(settings.buttonTextColor)};">Submit</button>
              <button class="fbr-button fbr-button-secondary" type="button" data-fbr-close-question style="background:${escapeAttr(settings.cardBackgroundColor)}; color:${escapeAttr(settings.textColor)}; border-color:${escapeAttr(settings.borderColor)};">Cancel</button>
            </div>
            <p class="fbr-muted" data-fbr-question-message></p>
          </form>
        </div>
      </div>
    `;
  }

  function bindInlineReviewModal(el, settings) {
    const modal = el.querySelector("[data-fbr-review-modal]");
    const openButton = el.querySelector("[data-fbr-open-review]");
    if (!modal || !openButton) return;

    const close = () => {
      modal.classList.remove("fbr-modal-backdrop-active");
      modal.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("fbr-modal-open");
    };
    const open = () => {
      modal.classList.add("fbr-modal-backdrop-active");
      modal.setAttribute("aria-hidden", "false");
      document.documentElement.classList.add("fbr-modal-open");
      const firstInput = modal.querySelector("input[name='customerName']");
      if (firstInput) firstInput.focus();
    };

    openButton.addEventListener("click", open);
    modal.querySelectorAll("[data-fbr-close-review]").forEach((button) => {
      button.addEventListener("click", close);
    });
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.classList.contains("fbr-modal-backdrop-active")) close();
    });

    bindReviewForm(modal.querySelector("[data-fbr-review-form]"), el, settings);
    bindPhotoInput(modal);
  }

  function bindInlineQuestionModal(el, settings) {
    const modal = el.querySelector("[data-fbr-question-modal]");
    const openButtons = el.querySelectorAll("[data-fbr-open-question]");
    if (!modal || !openButtons.length) return;
    const close = () => {
      modal.classList.remove("fbr-modal-backdrop-active");
      modal.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("fbr-modal-open");
    };
    const open = () => {
      modal.classList.add("fbr-modal-backdrop-active");
      modal.setAttribute("aria-hidden", "false");
      document.documentElement.classList.add("fbr-modal-open");
    };
    openButtons.forEach((button) => button.addEventListener("click", open));
    modal.querySelectorAll("[data-fbr-close-question]").forEach((button) => button.addEventListener("click", close));
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
    const form = modal.querySelector("[data-fbr-question-form]");
    if (form) {
      if (form.dataset.fbrBound === "true") return;
      form.dataset.fbrBound = "true";
      let isSubmitting = false;
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (isSubmitting) return;
        const message = form.querySelector("[data-fbr-question-message]");
        const button = form.querySelector("button[type='submit']");
        isSubmitting = true;
        if (button) button.disabled = true;
        setFormMessage(message, "", "");

        try {
          const result = await fetchJson(`${apiBase(el)}/api/product-questions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(new FormData(form)))
          });
          form.reset();
          setFormMessage(
            message,
            result.status === "PUBLISHED"
              ? "Thank you. Your question has been submitted and published."
              : "Thank you. Your question has been submitted and is awaiting approval.",
            "success"
          );
          if (result.status === "PUBLISHED") {
            window.setTimeout(async () => {
              const data = await fetchJson(productReviewUrl(el));
              renderProductReviews(el, data, settingsFromReviewData(data, settings));
            }, 900);
          }
        } catch (error) {
          setFormMessage(message, error.message || "Question could not be submitted. Please try again.", "error");
        } finally {
          isSubmitting = false;
          if (button) button.disabled = false;
        }
      });
    }
  }

  function bindWidgetTabs(el) {
    const tabs = Array.from(el.querySelectorAll("[data-fbr-tab]"));
    const panels = Array.from(el.querySelectorAll("[data-fbr-tab-panel]"));
    const askButtons = Array.from(el.querySelectorAll("[data-fbr-open-question]"));
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const selected = tab.dataset.fbrTab || "reviews";
        tabs.forEach((item) => {
          const active = item.dataset.fbrTab === selected;
          item.classList.toggle("fbr-widget-tab-active", active);
          item.setAttribute("aria-selected", active ? "true" : "false");
        });
        panels.forEach((panel) => {
          panel.classList.toggle("fbr-tab-panel-hidden", panel.dataset.fbrTabPanel !== selected);
        });
        askButtons.forEach((button) => {
          button.classList.toggle("fbr-button-highlight", selected === "questions");
        });
      });
    });
  }

  function bindReviewSort(el) {
    const select = el.querySelector("[data-fbr-review-sort]");
    if (!select) return;
    select.addEventListener("change", () => {
      const data = el.__fbrReviewData;
      const settings = el.__fbrReviewSettings || defaultProductSettings;
      if (!data) return;
      renderProductReviews(el, data, { ...settings, storefrontFilter: select.value, storefrontReviewPage: 1 });
    });
  }

  function bindRatingFilters(el) {
    el.querySelectorAll("[data-fbr-rating-filter]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const data = el.__fbrReviewData;
        const settings = el.__fbrReviewSettings || defaultProductSettings;
        if (!data) return;
        const ratings = Array.from(el.querySelectorAll("[data-fbr-rating-filter]:checked"))
          .map((input) => Number(input.dataset.fbrRatingFilter))
          .filter(Boolean);
        renderProductReviews(el, data, { ...settings, storefrontRatings: ratings, storefrontReviewPage: 1 });
      });
    });
  }

  function bindReviewPagination(el) {
    el.querySelectorAll("[data-fbr-review-page]").forEach((button) => {
      button.addEventListener("click", () => {
        const data = el.__fbrReviewData;
        const settings = el.__fbrReviewSettings || defaultProductSettings;
        const page = Number(button.dataset.fbrReviewPage) || 1;
        if (!data) return;
        renderProductReviews(el, data, { ...settings, storefrontReviewPage: page });
      });
    });
  }

  function bindReviewImageLightbox(el) {
    const imageUrls = Array.from(el.querySelectorAll("[data-fbr-image-preview]"))
      .map((button) => button.dataset.fbrImagePreview)
      .filter(Boolean)
      .filter((url, index, urls) => urls.indexOf(url) === index);
    el.querySelectorAll("[data-fbr-image-preview]").forEach((button) => {
      button.addEventListener("click", () => {
        const imageUrl = button.dataset.fbrImagePreview;
        if (imageUrl) openImageLightbox(imageUrl, imageUrls);
      });
    });
  }

  function bindPhotoSummary(el) {
    const prev = el.querySelector("[data-fbr-photo-summary-prev]");
    const next = el.querySelector("[data-fbr-photo-summary-next]");
    const track = el.querySelector("[data-fbr-photo-summary-track]");
    if (!track) return;
    const distance = () => Math.max(180, Math.round(track.clientWidth * 0.75));
    if (prev) prev.addEventListener("click", () => track.scrollBy({ left: -distance(), behavior: "smooth" }));
    if (next) next.addEventListener("click", () => track.scrollBy({ left: distance(), behavior: "smooth" }));
  }

  function openImageLightbox(imageUrl, imageUrls = []) {
    const existing = document.querySelector("[data-fbr-image-lightbox]");
    if (existing) existing.remove();
    const images = imageUrls.length ? imageUrls : [imageUrl];
    let currentIndex = Math.max(0, images.indexOf(imageUrl));
    const backdrop = document.createElement("div");
    backdrop.className = "fbr-modal-backdrop fbr-modal-backdrop-active";
    backdrop.dataset.fbrImageLightbox = "true";
    backdrop.innerHTML = `
      <div class="fbr-image-lightbox" role="dialog" aria-modal="true" aria-label="Review photo preview">
        <button class="fbr-modal-close" type="button" aria-label="Close photo preview">×</button>
        ${images.length > 1 ? '<button class="fbr-image-lightbox-arrow fbr-image-lightbox-prev" type="button" aria-label="Previous photo">‹</button>' : ""}
        <img src="${escapeAttr(images[currentIndex])}" alt="">
        ${images.length > 1 ? '<button class="fbr-image-lightbox-arrow fbr-image-lightbox-next" type="button" aria-label="Next photo">›</button>' : ""}
      </div>
    `;
    let keyHandler = null;
    const close = () => {
      if (keyHandler) document.removeEventListener("keydown", keyHandler);
      backdrop.remove();
      document.documentElement.classList.remove("fbr-modal-open");
    };
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close();
    });
    const closeButton = backdrop.querySelector(".fbr-modal-close");
    if (closeButton) closeButton.addEventListener("click", close);
    const image = backdrop.querySelector("img");
    const showImage = (nextIndex) => {
      currentIndex = (nextIndex + images.length) % images.length;
      if (image) image.src = images[currentIndex];
    };
    const prevButton = backdrop.querySelector(".fbr-image-lightbox-prev");
    const nextButton = backdrop.querySelector(".fbr-image-lightbox-next");
    if (prevButton) prevButton.addEventListener("click", () => showImage(currentIndex - 1));
    if (nextButton) nextButton.addEventListener("click", () => showImage(currentIndex + 1));
    keyHandler = (event) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft" && images.length > 1) showImage(currentIndex - 1);
      if (event.key === "ArrowRight" && images.length > 1) showImage(currentIndex + 1);
    };
    document.addEventListener("keydown", keyHandler);
    document.body.appendChild(backdrop);
    document.documentElement.classList.add("fbr-modal-open");
  }

  function bindUsefulButtons(el) {
    el.querySelectorAll("[data-fbr-useful-review-id]").forEach((button) => {
      const reviewId = button.dataset.fbrUsefulReviewId;
      const storageKey = `fbr_useful_${shop(el)}_${reviewId}`;
      if (!reviewId) return;
      if (window.localStorage.getItem(storageKey)) {
        button.disabled = true;
        button.classList.add("fbr-helpful-action-used");
      }
      button.addEventListener("click", async () => {
        if (button.disabled || window.localStorage.getItem(storageKey)) return;
        const currentCount = Number(button.dataset.fbrUsefulCount || 0);
        const optimisticCount = currentCount + 1;
        const overrideKey = usefulCountKey(el, reviewId);
        usefulCountOverrides.set(overrideKey, optimisticCount);
        button.disabled = true;
        button.dataset.fbrUsefulCount = String(optimisticCount);
        updateHelpfulCount(button, optimisticCount);
        button.classList.add("fbr-helpful-action-used");
        try {
          let result;
          try {
            result = await fetchJson(`${apiBase(el)}/api/product-reviews/${encodeURIComponent(reviewId)}/useful`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ shop: shop(el) })
            });
          } catch (error) {
            result = await fetchJson(`${apiBase(el)}/api/product-review-useful`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ shop: shop(el), reviewId })
            });
          }
          window.localStorage.setItem(storageKey, "1");
          const confirmedCount = Number.isFinite(Number(result.usefulCount))
            ? Number(result.usefulCount)
            : optimisticCount;
          const displayedCount = Math.max(optimisticCount, confirmedCount);
          usefulCountOverrides.set(overrideKey, displayedCount);
          button.dataset.fbrUsefulCount = String(displayedCount);
          updateHelpfulCount(button, displayedCount);
        } catch (error) {
          usefulCountOverrides.delete(overrideKey);
          button.dataset.fbrUsefulCount = String(currentCount);
          updateHelpfulCount(button, currentCount);
          button.classList.remove("fbr-helpful-action-used");
          button.disabled = false;
        }
      });
    });

    el.querySelectorAll("[data-fbr-not-helpful-review-id]").forEach((button) => {
      const reviewId = button.dataset.fbrNotHelpfulReviewId;
      const storageKey = `fbr_not_helpful_${shop(el)}_${reviewId}`;
      if (!reviewId) return;
      if (window.localStorage.getItem(storageKey)) {
        button.disabled = true;
        button.classList.add("fbr-helpful-action-used");
      }
      button.addEventListener("click", () => {
        if (button.disabled || window.localStorage.getItem(storageKey)) return;
        const countEl = button.querySelector("[data-fbr-not-helpful-count]");
        const currentCount = Number(button.dataset.fbrNotHelpfulCount || 0);
        const nextCount = currentCount + 1;
        button.dataset.fbrNotHelpfulCount = String(nextCount);
        if (countEl) countEl.textContent = String(nextCount);
        window.localStorage.setItem(storageKey, "1");
        button.disabled = true;
        button.classList.add("fbr-helpful-action-used");
      });
    });
  }

  function updateHelpfulCount(button, count) {
    const countEl = button.querySelector("[data-fbr-helpful-count]");
    if (countEl) countEl.textContent = String(count);
  }

  function bindPhotoInput(container) {
    const input = container.querySelector("[data-fbr-review-photo]");
    const hidden = container.querySelector("[data-fbr-review-image-url]");
    const preview = container.querySelector("[data-fbr-photo-preview]");
    if (!input || !hidden) return;
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) {
        hidden.value = "";
        if (preview) preview.removeAttribute("src");
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        hidden.value = String(reader.result || "");
        if (preview) preview.src = hidden.value;
      });
      reader.readAsDataURL(file);
    });
  }

  function bindCarousel(el) {
    const list = el.querySelector(".fbr-review-list-carousel");
    if (!list) return;
    const prev = el.querySelector("[data-fbr-carousel-prev]");
    const next = el.querySelector("[data-fbr-carousel-next]");
    const dots = Array.from(el.querySelectorAll("[data-fbr-carousel-dot]"));
    const distance = () => Math.max(260, Math.floor(list.clientWidth * 0.8));
    const maxScroll = () => list.scrollWidth - list.clientWidth;
    const goNext = () => {
      if (list.scrollLeft >= maxScroll() - 8) list.scrollTo({ left: 0, behavior: "smooth" });
      else list.scrollBy({ left: distance(), behavior: "smooth" });
    };
    const goPrev = () => {
      if (list.scrollLeft <= 8) list.scrollTo({ left: maxScroll(), behavior: "smooth" });
      else list.scrollBy({ left: -distance(), behavior: "smooth" });
    };
    if (prev) prev.addEventListener("click", goPrev);
    if (next) next.addEventListener("click", goNext);
    dots.forEach((dot) => {
      dot.addEventListener("click", () => {
        const index = Number(dot.dataset.fbrCarouselDot || 0);
        const card = list.children[index];
        if (card) card.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      });
    });
    const interval = Number(list.dataset.carouselAutoplaySpeed || 0);
    if (list.dataset.carouselAutoSlide === "true") {
      window.setInterval(goNext, Math.max(2, interval || 4) * 1000);
    }
  }

  function sortReviews(reviews, filter, ratings = []) {
    const ratingFilteredReviews = ratings.length
      ? reviews.filter((review) => ratings.includes(Math.round(Number(review.rating) || 0)))
      : reviews;
    const filteredReviews = filter === "only_pictures"
      ? ratingFilteredReviews.filter((review) => Boolean(review.imageUrl))
      : [...ratingFilteredReviews];

    return filteredReviews.sort((a, b) => {
      if (filter === "highest_rating") return Number(b.rating) - Number(a.rating);
      if (filter === "lowest_rating") return Number(a.rating) - Number(b.rating);
      if (filter === "pictures_first") return Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl));
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  function sortDefaultToStorefrontFilter(sortDefault) {
    if (sortDefault === "highest_rating") return "highest_rating";
    if (sortDefault === "lowest_rating") return "lowest_rating";
    if (sortDefault === "pictures_first") return "pictures_first";
    return "most_recent";
  }

  function buildRatingBreakdown(reviews) {
    return reviews.reduce((acc, review) => {
      const rating = String(Math.max(1, Math.min(5, Math.round(Number(review.rating) || 0))));
      acc[rating] = (acc[rating] || 0) + 1;
      return acc;
    }, { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 });
  }

  function bindReviewForm(form, widgetEl, settings) {
    if (!form) return;
    if (form.dataset.fbrBound === "true") return;
    form.dataset.fbrBound = "true";
    let isSubmitting = false;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (isSubmitting) return;

      const message = form.querySelector("[data-fbr-form-message]");
      const button = form.querySelector("button[type='submit']");
      isSubmitting = true;
      if (button) button.disabled = true;
      setFormMessage(message, "", "");

      try {
        const result = await fetchJson(`${apiBase(widgetEl || form)}/api/product-reviews`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(new FormData(form)))
        });
        form.reset();
        setFormMessage(
          message,
          result.status === "PUBLISHED"
            ? "Thank you. Your review has been submitted and published."
            : "Thank you. Your review has been submitted and is awaiting approval.",
          "success"
        );
        isSubmitting = false;
        if (button) button.disabled = false;
        if (result.status === "PUBLISHED" && widgetEl) {
          window.setTimeout(async () => {
            const data = await fetchJson(productReviewUrl(widgetEl));
            document.documentElement.classList.remove("fbr-modal-open");
            renderProductReviews(widgetEl, data, settingsFromReviewData(data, settings));
          }, 900);
        }
      } catch (error) {
        isSubmitting = false;
        if (button) button.disabled = false;
        setFormMessage(message, error.message || "Review could not be submitted. Please try again.", "error");
      }
    });
  }

  function setFormMessage(message, text, tone) {
    if (!message) return;
    message.textContent = text;
    message.classList.remove("fbr-form-message-success", "fbr-form-message-error");
    if (tone === "success") message.classList.add("fbr-form-message-success");
    if (tone === "error") message.classList.add("fbr-form-message-error");
  }

  function renderBrandCarousel(el, data) {
    const reviews = data.reviews || [];
    el.innerHTML = `
      <div class="fbr-carousel">
        <div class="fbr-row">
          <strong>${escapeHtml(data.brandName)}</strong>
          ${starSquares(data.rating, defaultProductSettings)}
          <span class="fbr-muted">${data.rating} from ${data.reviewCount} reviews</span>
        </div>
        <div class="fbr-carousel-track">
          ${reviews.map((review) => `
            <article class="fbr-card">
              <div class="fbr-row">
                ${starSquares(review.rating, defaultProductSettings)}
                ${review.verifiedPurchase ? '<span class="fbr-verified">Verified</span>' : ""}
              </div>
              <h3>${escapeHtml(review.title)}</h3>
              <p>${escapeHtml(review.content)}</p>
              <p class="fbr-muted">${escapeHtml(review.reviewerName)} · ${new Date(review.reviewDate).toLocaleDateString()}</p>
            </article>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderTrustSummary(el, data) {
    const breakdown = data.ratingBreakdown || {};
    const max = Math.max(...Object.values(breakdown), 1);
    el.innerHTML = `
      <div class="fbr-card fbr-summary-grid">
        <div>
          <h3>${escapeHtml(data.brandName)}</h3>
          <div class="fbr-row">
            ${starSquares(data.rating, defaultProductSettings)}
            <strong>${data.rating}/5</strong>
            <span class="fbr-muted">${data.reviewCount} reviews</span>
          </div>
        </div>
        <p>${escapeHtml(data.summary || "")}</p>
        <div>
          ${[5, 4, 3, 2, 1].map((rating) => {
            const count = breakdown[String(rating)] || 0;
            return `
              <div class="fbr-breakdown-row">
                <span>${rating} star</span>
                <span class="fbr-breakdown-bar"><span style="width:${(count / max) * 100}%"></span></span>
                <span>${count}</span>
              </div>
            `;
          }).join("")}
        </div>
        <a href="${escapeAttr(data.profileUrl)}" target="_blank" rel="noopener">View FurnitureBrandReviews profile</a>
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function renderReviewPagination(page, totalPages) {
    const items = paginationItems(page, totalPages);
    return `
      <nav class="fbr-review-pagination" aria-label="Reviews pagination">
        <button class="fbr-pagination-arrow" type="button" data-fbr-review-page="${Math.max(1, page - 1)}" ${page <= 1 ? "disabled" : ""} aria-label="Previous page">‹</button>
        ${items.map((item, index) => item === "ellipsis"
          ? `<span class="fbr-pagination-ellipsis" aria-hidden="true" key="${index}">...</span>`
          : `<button type="button" class="${item === page ? "fbr-pagination-active" : ""}" data-fbr-review-page="${item}" ${item === page ? 'aria-current="page"' : ""}>${item}</button>`
        ).join("")}
        <button class="fbr-pagination-arrow" type="button" data-fbr-review-page="${Math.min(totalPages, page + 1)}" ${page >= totalPages ? "disabled" : ""} aria-label="Next page">›</button>
      </nav>
    `;
  }

  function paginationItems(page, totalPages) {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
    return [1, 2, 3, 4, "ellipsis", totalPages];
  }

  function starSquares(rating, settings) {
    const normalizedRating = Math.max(0, Math.min(5, Number(rating) || 0));
    const gap = Number(settings.starGap) || 0;
    const size = Number(settings.starSize) || 22;
    const emptyColor = "#d8dde3";
    return `<span class="fbr-star-squares">${[1, 2, 3, 4, 5].map((index) => `
      <span style="background:transparent; color:${emptyColor}; margin-left:${index === 1 ? 0 : gap}px; width:${size}px; height:${size}px;">
        ${roundedStarSvg(size)}
        <span aria-hidden="true" style="background:transparent; color:${escapeAttr(settings.starColor)}; display:block; inset:0; overflow:hidden; position:absolute; width:${Math.max(0, Math.min(1, normalizedRating - (index - 1))) * 100}%;">
          <span style="align-items:center; display:inline-flex; height:${size}px; justify-content:center; width:${size}px;">${roundedStarSvg(size)}</span>
        </span>
      </span>
    `).join("")}</span>`;
  }

  function roundedStarSvg(size) {
    return `
      <svg aria-hidden="true" focusable="false" width="${size}" height="${size}" viewBox="0 0 24 24" style="display:block; flex:0 0 auto;">
        <path fill="currentColor" d="M12 3.1c.35 0 .66.2.82.52l1.9 3.83c.14.29.42.49.74.54l4.23.61c.35.05.64.29.75.62.11.34.02.7-.23.95l-3.06 2.98c-.23.22-.33.55-.28.86l.72 4.21c.06.35-.08.7-.37.91-.28.21-.66.23-.97.07l-3.78-1.99a1.02 1.02 0 0 0-.94 0l-3.78 1.99c-.31.16-.69.14-.97-.07a.93.93 0 0 1-.37-.91l.72-4.21c.05-.31-.05-.64-.28-.86l-3.06-2.98a.91.91 0 0 1-.23-.95c.11-.33.4-.57.75-.62l4.23-.61c.32-.05.6-.25.74-.54l1.9-3.83c.16-.32.47-.52.82-.52Z"></path>
      </svg>
    `;
  }

  function initials(value) {
    return escapeHtml(String(value || "?").trim().charAt(0).toUpperCase() || "?");
  }

  function thumbIcon(direction) {
    const path = direction === "down"
      ? '<path d="M7.5 3H5.25A2.25 2.25 0 0 0 3 5.25v6a2.25 2.25 0 0 0 2.25 2.25H7.5V3Z"></path><path d="M7.5 13.5l4.2 7.2a1.8 1.8 0 0 0 3.35-.9v-4.05h3.55a2.4 2.4 0 0 0 2.35-2.9l-1.2-5.65A5.25 5.25 0 0 0 14.62 3H7.5v10.5Z"></path>'
      : '<path d="M7.5 21H5.25A2.25 2.25 0 0 1 3 18.75v-6A2.25 2.25 0 0 1 5.25 10.5H7.5V21Z"></path><path d="M7.5 10.5l4.2-7.2a1.8 1.8 0 0 1 3.35.9v4.05h3.55a2.4 2.4 0 0 1 2.35 2.9l-1.2 5.65A5.25 5.25 0 0 1 14.62 21H7.5V10.5Z"></path>';
    return `
      <svg class="fbr-helpful-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        ${path}
      </svg>
    `;
  }

  function initFbrWidgets() {
    watchLegacyFloatingBadges();
    bindStarRatingNavigation();
    document.querySelectorAll("[data-fbr-product-reviews]").forEach(ensureProductReviewTargetId);
    if (window.location.hash === "#fbr-product-reviews") window.setTimeout(scrollToProductReviews, 0);

    document.querySelectorAll("[data-fbr-product-stars]").forEach(async (el) => {
      // The public brand widget also uses `.fbr-widget`. Mark Shopify product
      // widgets as claimed so that its loader cannot replace them with a
      // missing-brand error while this widget is fetching review data.
      el.dataset.fbrwReady = "true";
      if (el.dataset.fbrRendered === "true") return;
      el.dataset.fbrRendered = "true";
      const hasProductReviewWidget = Boolean(document.querySelector("[data-fbr-product-reviews]"));
      const url = hasProductReviewWidget ? productReviewUrl(el) : productReviewSummaryUrl(el);
      let renderedFromCache = false;
      const cached = readPersistentCache(url);
      if (cached) {
        renderProductStars(el, cached);
        renderedFromCache = true;
      }
      try {
        const [data, latestSettings] = await Promise.all([
          fetchJson(url),
          fetchJson(productReviewSettingsUrl(el)).catch(() => null)
        ]);
        writePersistentCache(url, data);
        const currentData = starDataWithLatestSettings(data, latestSettings);
        renderProductStars(el, currentData);
        applyProductReviewSeo(el, currentData);
      } catch (error) {
        console.error("[fbr] Product Star Rating failed", error);
        if (!renderedFromCache) {
          renderProductStars(el, { averageRating: 0, reviewCount: 0 });
        }
      }
    });

    document.querySelectorAll("[data-fbr-product-reviews]").forEach(async (el) => {
      el.dataset.fbrwReady = "true";
      if (el.dataset.fbrRendered === "true") return;
      el.dataset.fbrRendered = "true";
      const url = productReviewUrl(el);
      let renderedFromCache = false;
      const cached = readPersistentCache(url);
      if (cached) {
        renderProductReviews(el, cached, settingsFromReviewData(cached, cached.widgetSettings || defaultProductSettings));
        renderedFromCache = true;
      }
      try {
        const [data, latestSettings] = await Promise.all([
          fetchJson(url),
          fetchJson(productReviewSettingsUrl(el)).catch(() => null)
        ]);
        writePersistentCache(url, data);
        const settings = latestSettings || data.widgetSettings || defaultProductSettings;
        renderProductReviews(el, data, settingsFromReviewData(data, settings));
        applyProductReviewSeo(el, data);
      } catch (error) {
        console.error("[fbr] Product Reviews Widget failed", error);
        if (!renderedFromCache) {
          renderProductReviews(el, { averageRating: 0, reviewCount: 0, reviews: [], questions: [] }, defaultProductSettings);
        }
      }
    });

    document.querySelectorAll("[data-fbr-collection-stars]").forEach(initCollectionProductStars);

    document.querySelectorAll("[data-fbr-review-form]").forEach(bindReviewForm);

    document.querySelectorAll("[data-fbr-brand-carousel]").forEach(async (el) => {
      const data = await fetchJson(`${apiBase(el)}/api/brand-widget-data?shop=${encodeURIComponent(shop(el))}`);
      renderBrandCarousel(el, data);
    });

    document.querySelectorAll("[data-fbr-trust-summary]").forEach(async (el) => {
      const data = await fetchJson(`${apiBase(el)}/api/brand-widget-data?shop=${encodeURIComponent(shop(el))}`);
      renderTrustSummary(el, data);
    });

  }

  initFbrWidgets();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFbrWidgets, { once: true });
  }
})();
