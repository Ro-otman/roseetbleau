import { randomUUID } from "node:crypto";
import config from "../../config/config.js";
import catalogModel from "../../models/users/catalogModel.js";
import orderModel from "../../models/users/orderModel.js";

const CARD_PALETTES = [
  "rose",
  "blue",
  "sky",
  "mint",
  "sand",
  "violet",
  "peach",
  "aqua",
];

const FEATURED_CATEGORY_TONES = {
  bebes: "baby",
  filles: "girls",
  garcons: "boys",
  accessoires: "accessories",
};

const SORT_VALUES = new Set(["popular", "new", "price-low", "price-high"]);
const MARKETPLACE_NEW_ARRIVALS_LIMIT = 8;
const MARKETPLACE_SPOTLIGHT_LIMIT = 12;
const MARKETPLACE_POOL_LIMIT = 80;
const CART_SESSION_COOKIE_NAME = "rb_cart_session";
const CART_SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const CART_SHIPPING_FLAT_AMOUNT = 4.9;
const CART_FREE_SHIPPING_THRESHOLD = 120;
const CART_MAX_QTY_PER_ITEM = 99;
const CHECKOUT_PAYMENT_METHOD_VALUES = new Set([
  "card",
  "mobile_money",
  "bank_transfer",
  "cash_on_delivery",
]);
const CHECKOUT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHECKOUT_COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const COOKIE_SECURE =
  process.env.COOKIE_SECURE != null
    ? process.env.COOKIE_SECURE === "true"
    : config.env === "production";

const DETAIL_GALLERY_FALLBACK = [
  {
    src: "/images/hero-slide-1.svg",
    alt: "Produit Rose et Bleu",
    label: "Vue principale",
  },
  {
    src: "/images/hero-slide-2.svg",
    alt: "Detail produit",
    label: "Detail coupe",
  },
  {
    src: "/images/hero-slide-3.svg",
    alt: "Produit en situation",
    label: "Mise en situation",
  },
  {
    src: "/images/category-filles.svg",
    alt: "Inspiration mode enfant",
    label: "Inspiration",
  },
];

const DETAIL_COMFORT_POINTS = [
  {
    icon: "bx-body",
    title: "Coupe souple",
    text: "Aisance totale pour courir, jouer et bouger librement.",
  },
  {
    icon: "bx-shield-quarter",
    title: "Qualite fiable",
    text: "Tissu resistant aux lavages frequents de la semaine.",
  },
  {
    icon: "bx-palette",
    title: "Style ludique",
    text: "Coloris joyeux, faciles a matcher avec d autres pieces.",
  },
  {
    icon: "bx-leaf",
    title: "Doux pour la peau",
    text: "Matiere agreable pour accompagner les peaux sensibles.",
  },
];

const DETAIL_DELIVERY_INFOS = [
  {
    icon: "bx-rocket",
    title: "Preparation rapide",
    text: "Commande preparee en 24-48h.",
  },
  {
    icon: "bx-package",
    title: "Suivi colis",
    text: "Lien de suivi envoye apres expedition.",
  },
  {
    icon: "bx-refresh",
    title: "Retour 14 jours",
    text: "Echange ou retour simplifie si besoin.",
  },
];

const DETAIL_COLOR_HEX = {
  rose: "#ec2e8a",
  pink: "#ec2e8a",
  bleu: "#3680c2",
  blue: "#3680c2",
  ciel: "#63bbeb",
  sky: "#63bbeb",
  mint: "#74cba9",
  vert: "#74cba9",
  green: "#74cba9",
  violet: "#8d74d7",
  purple: "#8d74d7",
  beige: "#d9b98c",
  sand: "#d9b98c",
  peach: "#f2b38f",
  orange: "#ee9f6f",
  noir: "#1f324a",
  black: "#1f324a",
  blanc: "#f3f5f9",
  white: "#f3f5f9",
  rouge: "#d94a66",
  red: "#d94a66",
  jaune: "#e7be45",
  yellow: "#e7be45",
  gris: "#8d99aa",
  gray: "#8d99aa",
};

const DETAIL_COLOR_FALLBACK = [
  "#ec2e8a",
  "#3680c2",
  "#63bbeb",
  "#74cba9",
  "#d9b98c",
  "#8d74d7",
  "#f2b38f",
];

const createPageHandler = (view, pageTitle, pageStylesheet) => {
  return (req, res) => {
    return res.render(view, {
      pageTitle,
      pageStylesheet,
      currentPath: req.path,
      authFeedback: null,
      formData: {},
    });
  };
};

const normalizeText = (value, maxLength = 100) => {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
};

const parseBooleanQuery = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const normalizeCategorySlug = (value) => {
  const slug = normalizeText(value, 140).toLowerCase();
  return /^[a-z0-9-]+$/.test(slug) ? slug : "";
};

const normalizeDetailSlug = (value) => {
  const slug = normalizeText(value, 220).toLowerCase();
  return /^[a-z0-9-]+$/.test(slug) ? slug : "";
};

const normalizeSort = (value) => {
  const candidate = normalizeText(value, 20).toLowerCase();
  return SORT_VALUES.has(candidate) ? candidate : "popular";
};

const parsePriceRange = (value) => {
  const candidate = normalizeText(value, 30).toLowerCase();
  if (!candidate) {
    return { raw: "", min: null, max: null };
  }

  if (candidate.endsWith("+")) {
    const min = Number.parseFloat(candidate.slice(0, -1));
    return {
      raw: candidate,
      min: Number.isFinite(min) ? min : null,
      max: null,
    };
  }

  const [minRaw, maxRaw] = candidate.split("-");
  const min = Number.parseFloat(minRaw);
  const max = Number.parseFloat(maxRaw);

  return {
    raw: candidate,
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null,
  };
};

const parseShopFilters = (query = {}) => {
  const priceRange = parsePriceRange(query.price);

  return {
    q: normalizeText(query.q, 120),
    category: normalizeCategorySlug(query.category),
    sort: normalizeSort(query.sort),
    promo: parseBooleanQuery(query.promo),
    size: normalizeText(query.size, 30),
    price: priceRange.raw,
    priceMin: priceRange.min,
    priceMax: priceRange.max,
  };
};

const parseFavoriteFilters = (query = {}) => {
  return {
    category: normalizeCategorySlug(query.category),
    sort: normalizeSort(query.sort || "new"),
    promo: parseBooleanQuery(query.promo),
  };
};

const normalizeCartSessionToken = (value) => {
  return normalizeText(value, 120);
};

const parsePositiveInteger = (value, fallback = 1, max = CART_MAX_QTY_PER_ITEM) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
};

const parseInteger = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};

const baseCartCookieOptions = () => ({
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: "lax",
  path: "/",
});

const setCartSessionCookie = (res, sessionToken) => {
  res.cookie(CART_SESSION_COOKIE_NAME, sessionToken, {
    ...baseCartCookieOptions(),
    maxAge: CART_SESSION_COOKIE_MAX_AGE,
  });
};

const resolveCartContext = (req, res, { createGuestSession = false } = {}) => {
  const userUuid = normalizeText(req.authUser?.id, 64);
  let sessionToken = normalizeCartSessionToken(
    req.cookies?.[CART_SESSION_COOKIE_NAME],
  );

  if (!userUuid && !sessionToken && createGuestSession) {
    sessionToken = randomUUID();
    setCartSessionCookie(res, sessionToken);
  }

  return {
    userUuid: userUuid || "",
    sessionToken: sessionToken || "",
  };
};

const toNumber = (value, fallback = 0) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
};

const resolveCartError = (reason) => {
  switch (reason) {
    case "product_not_found":
      return { status: 404, message: "Produit introuvable." };
    case "out_of_stock":
      return { status: 409, message: "Ce produit est en rupture de stock." };
    case "stock_exceeded":
      return { status: 409, message: "Stock insuffisant pour cette quantite." };
    case "invalid_quantity":
      return { status: 400, message: "Quantite invalide." };
    case "invalid_item":
      return { status: 400, message: "Article panier invalide." };
    case "item_not_found":
      return { status: 404, message: "Article panier introuvable." };
    case "cart_not_found":
      return { status: 404, message: "Panier introuvable." };
    default:
      return { status: 400, message: "Operation panier impossible." };
  }
};

const parseCheckoutPayload = (body = {}) => {
  return {
    fullName: normalizeText(body.fullName, 160),
    email: normalizeText(body.email, 190),
    phone: normalizeText(body.phone, 30),
    line1: normalizeText(body.line1, 220),
    line2: normalizeText(body.line2, 220),
    city: normalizeText(body.city, 120),
    stateRegion: normalizeText(body.stateRegion, 120),
    postalCode: normalizeText(body.postalCode, 40),
    countryCode: normalizeText(body.countryCode || "BJ", 2).toUpperCase(),
    paymentMethod: normalizeText(body.paymentMethod, 40).toLowerCase(),
    note: normalizeText(body.note, 500),
  };
};

const validateCheckoutPayload = (payload = {}) => {
  const fieldErrors = {};
  const numericPhone = String(payload.phone || "").replace(/[^\d]/g, "");

  if (String(payload.fullName || "").length < 2) {
    fieldErrors.fullName = "Nom complet requis.";
  }

  if (!CHECKOUT_EMAIL_PATTERN.test(String(payload.email || ""))) {
    fieldErrors.email = "Adresse email invalide.";
  }

  if (numericPhone.length < 6) {
    fieldErrors.phone = "Numero de telephone invalide.";
  }

  if (String(payload.line1 || "").length < 4) {
    fieldErrors.line1 = "Adresse de livraison requise.";
  }

  if (String(payload.city || "").length < 2) {
    fieldErrors.city = "Ville requise.";
  }

  if (!CHECKOUT_COUNTRY_CODE_PATTERN.test(String(payload.countryCode || ""))) {
    fieldErrors.countryCode = "Code pays invalide.";
  }

  if (!CHECKOUT_PAYMENT_METHOD_VALUES.has(String(payload.paymentMethod || ""))) {
    fieldErrors.paymentMethod = "Mode de paiement invalide.";
  }

  return {
    ok: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
};

const resolveCheckoutError = (reason) => {
  switch (reason) {
    case "cart_not_found":
    case "cart_empty":
      return {
        status: 400,
        message: "Ton panier est vide ou indisponible.",
      };
    case "product_unavailable":
      return {
        status: 409,
        message: "Un produit de ton panier n est plus disponible.",
      };
    case "stock_exceeded":
      return {
        status: 409,
        message: "Stock insuffisant pour finaliser la commande.",
      };
    case "invalid_payment_method":
      return {
        status: 400,
        message: "Mode de paiement invalide.",
      };
    default:
      return {
        status: 500,
        message: "Impossible de finaliser la commande pour le moment.",
      };
  }
};

const isJsonRequest = (req) => {
  const acceptHeader = String(req.get("accept") || "").toLowerCase();
  const contentType = String(req.get("content-type") || "").toLowerCase();

  return (
    acceptHeader.includes("application/json") ||
    contentType.includes("application/json") ||
    req.xhr === true
  );
};

const formatPrice = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "0,00 EUR";
  }

  return `${amount.toFixed(2).replace(".", ",")} EUR`;
};

const formatRating = (value) => {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating <= 0) {
    return "4.8";
  }

  return rating.toFixed(1);
};

const formatAgeRange = (minMonths, maxMonths) => {
  const min = Number(minMonths);
  const max = Number(maxMonths);

  if (!Number.isFinite(min) && !Number.isFinite(max)) {
    return "Tout age";
  }

  if (Number.isFinite(min) && Number.isFinite(max) && min === max) {
    return `${min} mois`;
  }

  if (!Number.isFinite(min) && Number.isFinite(max)) {
    return `Jusqu a ${max} mois`;
  }

  if (Number.isFinite(min) && !Number.isFinite(max)) {
    return `${min}+ mois`;
  }

  return `${min}-${max} mois`;
};

const resolveProductStatus = (stockQty) => {
  const stock = Number(stockQty);

  if (!Number.isFinite(stock) || stock <= 0) {
    return { label: "Rupture", tone: "warn" };
  }

  if (stock <= 5) {
    return { label: "Stock limite", tone: "limited" };
  }

  return { label: "Disponible", tone: "ok" };
};

const resolveProductTag = ({ displayPrice, compareAtPrice, createdAt }) => {
  const price = Number(displayPrice);
  const compareAt = Number(compareAtPrice);

  if (
    Number.isFinite(compareAt) &&
    compareAt > 0 &&
    Number.isFinite(price) &&
    compareAt > price
  ) {
    const discount = Math.round(((compareAt - price) / compareAt) * 100);
    return `-${Math.max(discount, 1)}%`;
  }

  const createdTimestamp = Date.parse(createdAt);
  if (Number.isFinite(createdTimestamp)) {
    const ageInDays = (Date.now() - createdTimestamp) / (1000 * 60 * 60 * 24);
    if (ageInDays <= 21) {
      return "New";
    }
  }

  return "Top vente";
};

const mapCatalogProduct = (row, index) => {
  const status = resolveProductStatus(row.stock_total);
  const displayPrice = Number(row.display_price);
  const compareAtPrice = Number(row.compare_at_price);
  const hasCompareAt =
    Number.isFinite(compareAtPrice) && Number.isFinite(displayPrice) && compareAtPrice > displayPrice;

  return {
    id: row.id,
    slug: row.slug,
    href: row.slug ? `/details?slug=${encodeURIComponent(row.slug)}` : "/details",
    sku: normalizeText(row.sku, 80) || `RB-${row.id}`,
    name: normalizeText(row.name, 180) || "Produit Rose&Bleu",
    category: normalizeText(row.category_name, 120) || "Collection",
    categorySlug: normalizeText(row.category_slug, 140),
    age: formatAgeRange(row.age_min_months, row.age_max_months),
    price: formatPrice(displayPrice),
    oldPrice: hasCompareAt ? formatPrice(compareAtPrice) : null,
    rating: formatRating(row.avg_rating),
    tag: resolveProductTag({
      displayPrice,
      compareAtPrice,
      createdAt: row.created_at,
    }),
    status: status.label,
    statusTone: status.tone,
    palette: CARD_PALETTES[index % CARD_PALETTES.length],
    image: normalizeText(row.image_url, 500) || null,
    stockQty: Number.isFinite(Number(row.stock_total)) ? Number(row.stock_total) : 0,
  };
};

const dedupeProducts = (rows) => {
  const seen = new Set();
  const uniqueRows = [];

  for (const row of rows) {
    const key = String(row.id);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueRows.push(row);
  }

  return uniqueRows;
};

const getMarketplaceCategoryKey = (row) => {
  const slugKey = normalizeCategorySlug(row?.category_slug);
  if (slugKey) {
    return slugKey;
  }

  const nameKey = normalizeText(row?.category_name, 120).toLowerCase();
  return nameKey || "autres";
};

const buildMarketplaceRows = (rows) => {
  const totalNeeded =
    MARKETPLACE_NEW_ARRIVALS_LIMIT + MARKETPLACE_SPOTLIGHT_LIMIT;
  const uniqueRows = dedupeProducts(rows);

  if (!uniqueRows.length) {
    return { newRows: [], spotlightRows: [] };
  }

  const buckets = new Map();
  const categoryOrder = [];

  for (const row of uniqueRows) {
    const categoryKey = getMarketplaceCategoryKey(row);
    if (!buckets.has(categoryKey)) {
      buckets.set(categoryKey, []);
      categoryOrder.push(categoryKey);
    }
    buckets.get(categoryKey).push(row);
  }

  const diversifiedRows = [];
  let cursor = 0;

  while (diversifiedRows.length < totalNeeded && categoryOrder.length) {
    const categoryKey = categoryOrder[cursor];
    const bucket = buckets.get(categoryKey);

    if (!bucket || !bucket.length) {
      buckets.delete(categoryKey);
      categoryOrder.splice(cursor, 1);
      if (!categoryOrder.length) {
        break;
      }
      if (cursor >= categoryOrder.length) {
        cursor = 0;
      }
      continue;
    }

    diversifiedRows.push(bucket.shift());

    if (!bucket.length) {
      buckets.delete(categoryKey);
      categoryOrder.splice(cursor, 1);
      if (!categoryOrder.length) {
        break;
      }
      if (cursor >= categoryOrder.length) {
        cursor = 0;
      }
      continue;
    }

    cursor = (cursor + 1) % categoryOrder.length;
  }

  if (diversifiedRows.length < totalNeeded) {
    const usedIds = new Set(diversifiedRows.map((row) => String(row.id)));
    for (const row of uniqueRows) {
      const rowKey = String(row.id);
      if (usedIds.has(rowKey)) {
        continue;
      }

      diversifiedRows.push(row);
      usedIds.add(rowKey);

      if (diversifiedRows.length >= totalNeeded) {
        break;
      }
    }
  }

  const newRows = diversifiedRows.slice(0, MARKETPLACE_NEW_ARRIVALS_LIMIT);
  const spotlightRows = diversifiedRows.slice(
    MARKETPLACE_NEW_ARRIVALS_LIMIT,
    MARKETPLACE_NEW_ARRIVALS_LIMIT + MARKETPLACE_SPOTLIGHT_LIMIT,
  );

  return { newRows, spotlightRows };
};

const toFavoriteProductIdSet = (favoriteRows) => {
  const ids = new Set();

  for (const row of favoriteRows || []) {
    const productId = Number(row.product_id);
    if (Number.isFinite(productId) && productId > 0) {
      ids.add(productId);
    }
  }

  return ids;
};

const applyFavoriteState = (products, favoriteProductIdSet) => {
  return products.map((product) => ({
    ...product,
    isFavorite: favoriteProductIdSet.has(Number(product.id)),
  }));
};

const buildFavoriteHref = ({ category = "", promo = false, sort = "new" } = {}) => {
  const params = new URLSearchParams();
  const normalizedCategory = normalizeCategorySlug(category);
  const normalizedSort = normalizeSort(sort);

  if (normalizedCategory) {
    params.set("category", normalizedCategory);
  }

  if (promo) {
    params.set("promo", "true");
  }

  if (normalizedSort && normalizedSort !== "new") {
    params.set("sort", normalizedSort);
  }

  const query = params.toString();
  return query ? `/favoris?${query}` : "/favoris";
};

const sanitizeLongText = (value, maxLength = 1200) => {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
};

const normalizeColorKey = (value) => {
  return normalizeText(value, 80)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
};

const resolveColorHex = (label, index) => {
  const colorKey = normalizeColorKey(label);
  if (DETAIL_COLOR_HEX[colorKey]) {
    return DETAIL_COLOR_HEX[colorKey];
  }

  return DETAIL_COLOR_FALLBACK[index % DETAIL_COLOR_FALLBACK.length];
};

const uniqueValues = (items) => {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const normalized = normalizeText(item, 80);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(normalized);
  }

  return output;
};

const buildDetailCharacteristics = ({ product, variantCount, sizes, colors }) => {
  const lines = [
    `Categorie: ${product.category}.`,
    `Reference SKU: ${product.sku}.`,
    `Tranche d age recommandee: ${product.age}.`,
    `Stock disponible: ${Math.max(0, product.stockQty)} unite(s).`,
    `${variantCount} variante(s) active(s) en base.`,
  ];

  if (sizes.length) {
    lines.push(`Tailles disponibles: ${sizes.join(", ")}.`);
  }

  if (colors.length) {
    lines.push(`Coloris disponibles: ${colors.join(", ")}.`);
  }

  if (product.shortDescription) {
    lines.push(product.shortDescription);
  }

  return lines.slice(0, 8);
};

const CART_TRUST_POINTS = [
  {
    icon: "bx-check-shield",
    title: "Paiement securise",
    text: "Transactions protegees et verification anti-fraude.",
  },
  {
    icon: "bx-time-five",
    title: "Preparation rapide",
    text: "Commandes preparees sous 24-48h.",
  },
  {
    icon: "bx-refresh",
    title: "Retours faciles",
    text: "14 jours pour changer d avis sans stress.",
  },
];

const mapCartItem = (row, index) => {
  const quantity = parsePositiveInteger(row.quantity, 1, 1000000);
  const unitPriceValue = toNumber(row.unit_price, 0);
  const compareAtValue = toNumber(row.compare_at_price, 0);
  const hasCompareAt = compareAtValue > unitPriceValue;
  const linePriceValue = unitPriceValue * quantity;
  const lineCompareValue = (hasCompareAt ? compareAtValue : unitPriceValue) * quantity;
  const stockQty = Math.max(0, parseInteger(row.stock_qty, 0));
  const status = resolveProductStatus(stockQty);
  const maxQty =
    stockQty > 0 ? Math.min(stockQty, CART_MAX_QTY_PER_ITEM) : quantity;

  return {
    id: Number(row.cart_item_id),
    productId: Number(row.product_id),
    slug: normalizeDetailSlug(row.product_slug),
    href: row.product_slug
      ? `/details?slug=${encodeURIComponent(row.product_slug)}`
      : "/details",
    sku: normalizeText(row.variant_sku || row.product_sku, 80),
    name: normalizeText(row.product_name, 180) || "Produit Rose&Bleu",
    category: normalizeText(row.category_name, 120) || "Collection",
    size: normalizeText(row.size_label, 40) || "Unique",
    color: normalizeText(row.color_label, 60) || "Standard",
    qty: quantity,
    unitPriceValue,
    linePriceValue,
    lineCompareValue,
    unitPrice: formatPrice(unitPriceValue),
    oldPrice: hasCompareAt ? formatPrice(compareAtValue) : "",
    total: formatPrice(linePriceValue),
    badge: resolveProductTag({
      displayPrice: unitPriceValue,
      compareAtPrice: hasCompareAt ? compareAtValue : null,
      createdAt: row.product_created_at,
    }),
    stock: status.label,
    stockTone: status.tone,
    stockQty,
    maxQty,
    canIncrease: stockQty > 0 && quantity < maxQty,
    image: normalizeText(row.image_url, 500) || null,
    palette: CARD_PALETTES[index % CARD_PALETTES.length],
  };
};

const buildCartSummary = (cartItems) => {
  const pricing = cartItems.reduce(
    (acc, item) => {
      acc.payableSubtotal += item.linePriceValue;
      acc.displaySubtotal += item.lineCompareValue;
      return acc;
    },
    { payableSubtotal: 0, displaySubtotal: 0 },
  );

  const discountRaw = Math.max(0, pricing.displaySubtotal - pricing.payableSubtotal);
  const shippingRaw =
    pricing.payableSubtotal > 0 &&
    pricing.payableSubtotal < CART_FREE_SHIPPING_THRESHOLD
      ? CART_SHIPPING_FLAT_AMOUNT
      : 0;
  const totalRaw = pricing.payableSubtotal + shippingRaw;

  return {
    subtotalRaw: pricing.displaySubtotal,
    discountRaw,
    shippingRaw,
    totalRaw,
    subtotal: formatPrice(pricing.displaySubtotal),
    discount: discountRaw > 0 ? `-${formatPrice(discountRaw)}` : "0,00 EUR",
    shipping: shippingRaw > 0 ? formatPrice(shippingRaw) : "Offerte",
    total: formatPrice(totalRaw),
  };
};

const loadCartViewModel = async (cartContext) => {
  const [cartRows, suggestionRows] = await Promise.all([
    catalogModel.listCartRowsByContext(cartContext),
    catalogModel.listPublicProducts({
      limit: 16,
      sort: "popular",
    }),
  ]);

  const cartItems = cartRows.map((row, index) => mapCartItem(row, index));
  const cartSummary = buildCartSummary(cartItems);
  const cartTotalQuantity = cartItems.reduce(
    (acc, item) => acc + parsePositiveInteger(item.qty, 0, 1000000),
    0,
  );
  const cartProductIdSet = new Set(cartItems.map((item) => Number(item.productId)));

  const cartSuggestions = dedupeProducts(suggestionRows)
    .filter((row) => !cartProductIdSet.has(Number(row.id)))
    .slice(0, 4)
    .map((row, index) => mapCatalogProduct(row, index));

  return {
    cartItems,
    cartSummary,
    cartTotalQuantity,
    cartSuggestions,
  };
};

const usersControllers = {
  showIndexPage: async (req, res) => {
    try {
      const [newRowsPool, popularRowsPool, favoriteRows] = await Promise.all([
        catalogModel.listPublicProducts({
          limit: MARKETPLACE_POOL_LIMIT,
          sort: "new",
        }),
        catalogModel.listPublicProducts({
          limit: MARKETPLACE_POOL_LIMIT,
          sort: "popular",
        }),
        req.authUser?.id
          ? catalogModel.listFavoriteProductIdsByUserUuid(req.authUser.id)
          : Promise.resolve([]),
      ]);

      const favoriteProductIdSet = toFavoriteProductIdSet(favoriteRows);
      const marketplacePoolRows = dedupeProducts([
        ...newRowsPool,
        ...popularRowsPool,
      ]);
      const { newRows, spotlightRows } =
        buildMarketplaceRows(marketplacePoolRows);

      const newArrivals = newRows.map((row, index) =>
        mapCatalogProduct(row, index),
      );
      const spotlightProducts = spotlightRows.map((row, index) =>
        mapCatalogProduct(row, index + newArrivals.length),
      );

      const newArrivalsWithFavoriteState = applyFavoriteState(
        newArrivals,
        favoriteProductIdSet,
      );
      const spotlightWithFavoriteState = applyFavoriteState(
        spotlightProducts,
        favoriteProductIdSet,
      );

      return res.render("pages/users/index", {
        pageTitle: "Accueil | Rose&Bleu",
        pageStylesheet: "/css/pages/index.css",
        currentPath: req.path,
        authFeedback: null,
        formData: {},
        marketplaceNewArrivals: newArrivalsWithFavoriteState,
        marketplaceSpotlightProducts: spotlightWithFavoriteState,
      });
    } catch (error) {
      console.error("[SHOP] showIndexPage error:", error);
      return res.render("pages/users/index", {
        pageTitle: "Accueil | Rose&Bleu",
        pageStylesheet: "/css/pages/index.css",
        currentPath: req.path,
        authFeedback: null,
        formData: {},
        marketplaceNewArrivals: [],
        marketplaceSpotlightProducts: [],
      });
    }
  },

  showShopPage: async (req, res) => {
    const shopFilters = parseShopFilters(req.query);

    try {
      const [productsRows, categoryRows, summary, favoriteRows] = await Promise.all([
        catalogModel.listPublicProducts({
          searchTerm: shopFilters.q,
          categorySlug: shopFilters.category,
          promoOnly: shopFilters.promo,
          sizeFilter: shopFilters.size,
          priceMin: shopFilters.priceMin,
          priceMax: shopFilters.priceMax,
          sort: shopFilters.sort,
        }),
        catalogModel.listPublicCategoryCounts(),
        catalogModel.getShopSummary(),
        req.authUser?.id
          ? catalogModel.listFavoriteProductIdsByUserUuid(req.authUser.id)
          : Promise.resolve([]),
      ]);

      const favoriteProductIdSet = toFavoriteProductIdSet(favoriteRows);

      const shopProducts = dedupeProducts(productsRows).map((row, index) =>
        mapCatalogProduct(row, index),
      );
      const shopProductsWithFavoriteState = applyFavoriteState(
        shopProducts,
        favoriteProductIdSet,
      );

      const shopCategories = categoryRows.map((row) => ({
        name: normalizeText(row.name, 120) || "Collection",
        slug: normalizeText(row.slug, 140),
        count: Number(row.product_count) || 0,
      }));

      const shopFeaturedCategories = shopCategories.slice(0, 4).map((item) => ({
        title: item.name,
        text: `${item.count} produit(s) disponibles dans cette categorie.`,
        href: item.slug ? `/shop?category=${encodeURIComponent(item.slug)}` : "/shop",
        tone: FEATURED_CATEGORY_TONES[item.slug] || "accessories",
      }));

      return res.render("pages/users/shop", {
        pageTitle: "Shop | Rose&Bleu",
        pageStylesheet: "/css/pages/shop.css",
        currentPath: req.path,
        authFeedback: null,
        formData: {},
        shopProducts: shopProductsWithFavoriteState,
        shopCategories,
        shopFeaturedCategories,
        shopFilters,
        shopMeta: {
          filteredProducts: shopProductsWithFavoriteState.length,
          totalProducts: Number(summary.total_products) || 0,
          totalCategories: Number(summary.total_categories) || shopCategories.length,
        },
      });
    } catch (error) {
      console.error("[SHOP] showShopPage error:", error);
      return res.render("pages/users/shop", {
        pageTitle: "Shop | Rose&Bleu",
        pageStylesheet: "/css/pages/shop.css",
        currentPath: req.path,
        authFeedback: null,
        formData: {},
        shopProducts: [],
        shopCategories: [],
        shopFeaturedCategories: [],
        shopFilters,
        shopMeta: {
          filteredProducts: 0,
          totalProducts: 0,
          totalCategories: 0,
        },
      });
    }
  },

  showAboutPage: createPageHandler(
    "pages/users/about",
    "About | Rose&Bleu",
    "/css/pages/about.css",
  ),
  showFaqPage: createPageHandler(
    "pages/users/faq",
    "FAQ | Rose&Bleu",
    "/css/pages/faq.css",
  ),
  showFavorisPage: async (req, res) => {
    const favoriteFilters = parseFavoriteFilters(req.query);

    const renderFavorisPage = ({
      status = 200,
      favoriteProducts = [],
      favoriteQuickFilters = [],
      favoriteSummary = {
        totalSaved: 0,
        discountedCount: 0,
      },
      favoriteMessage = null,
    } = {}) => {
      return res.status(status).render("pages/users/favoris", {
        pageTitle: "Favoris | Rose&Bleu",
        pageStylesheet: "/css/pages/favoris.css",
        currentPath: req.path,
        authFeedback: null,
        formData: {},
        favoriteProducts,
        favoriteQuickFilters,
        favoriteSummary,
        favoriteFilters,
        favoriteMessage,
        favoriteIsAuthenticated: Boolean(req.authUser?.id),
      });
    };

    if (!req.authUser?.id) {
      return renderFavorisPage({
        status: 200,
        favoriteMessage: {
          tone: "info",
          title: "Connecte-toi pour retrouver tes favoris",
          text: "Tes coups de coeur sont relies a ton compte client.",
        },
      });
    }

    try {
      const [filteredRows, allRows] = await Promise.all([
        catalogModel.listFavoriteProductsByUserUuid({
          userUuid: req.authUser.id,
          categorySlug: favoriteFilters.category,
          promoOnly: favoriteFilters.promo,
          sort: favoriteFilters.sort,
        }),
        catalogModel.listFavoriteProductsByUserUuid({
          userUuid: req.authUser.id,
          sort: "new",
        }),
      ]);

      const allFavorites = dedupeProducts(allRows).map((row, index) => ({
        ...mapCatalogProduct(row, index),
        isFavorite: true,
      }));
      const favoriteProducts = dedupeProducts(filteredRows).map((row, index) => ({
        ...mapCatalogProduct(row, index),
        isFavorite: true,
      }));

      const categoryCountMap = new Map();
      for (const item of allFavorites) {
        const slug = normalizeCategorySlug(item.categorySlug);
        if (!slug) {
          continue;
        }

        const currentCount = categoryCountMap.get(slug) || {
          label: item.category,
          slug,
          count: 0,
        };
        currentCount.count += 1;
        categoryCountMap.set(slug, currentCount);
      }

      const categoryFilters = Array.from(categoryCountMap.values()).sort(
        (a, b) => b.count - a.count || a.label.localeCompare(b.label),
      );

      const favoriteQuickFilters = [
        {
          label: "Tous",
          href: buildFavoriteHref({ category: "", promo: false, sort: "new" }),
          active: !favoriteFilters.category && !favoriteFilters.promo,
        },
        {
          label: "Nouveautes",
          href: buildFavoriteHref({
            category: favoriteFilters.category,
            promo: favoriteFilters.promo,
            sort: "new",
          }),
          active: favoriteFilters.sort === "new" && !favoriteFilters.category,
        },
        {
          label: "Promotions",
          href: buildFavoriteHref({
            category: favoriteFilters.category,
            promo: true,
            sort: favoriteFilters.sort,
          }),
          active: favoriteFilters.promo,
        },
        ...categoryFilters.map((item) => ({
          label: item.label,
          href: buildFavoriteHref({
            category: item.slug,
            promo: false,
            sort: favoriteFilters.sort,
          }),
          active: favoriteFilters.category === item.slug,
        })),
      ];

      return renderFavorisPage({
        status: 200,
        favoriteProducts,
        favoriteQuickFilters,
        favoriteSummary: {
          totalSaved: allFavorites.length,
          discountedCount: allFavorites.filter((item) => Boolean(item.oldPrice))
            .length,
        },
        favoriteMessage: allFavorites.length
          ? null
          : {
              tone: "info",
              title: "Aucun favori pour le moment",
              text: "Ajoute des produits depuis le shop pour les retrouver ici.",
            },
      });
    } catch (error) {
      console.error("[FAVORIS] showFavorisPage error:", error);
      return renderFavorisPage({
        status: 500,
        favoriteMessage: {
          tone: "error",
          title: "Erreur serveur",
          text: "Impossible de charger tes favoris pour le moment.",
        },
      });
    }
  },
  toggleFavorite: async (req, res) => {
    const wantsJson = isJsonRequest(req);

    if (!req.authUser?.id) {
      if (wantsJson) {
        return res.status(401).json({
          ok: false,
          message: "Authentification requise.",
        });
      }

      return res.redirect(302, "/login");
    }

    const requestedSlug = normalizeDetailSlug(req.body?.slug || req.query?.slug);
    if (!requestedSlug) {
      if (wantsJson) {
        return res.status(400).json({
          ok: false,
          message: "Slug produit invalide.",
        });
      }

      return res.redirect(303, req.get("referer") || "/favoris");
    }

    try {
      const result = await catalogModel.toggleFavoriteByUserUuid(
        req.authUser.id,
        requestedSlug,
      );

      if (!result.ok) {
        const statusCode = result.reason === "product_not_found" ? 404 : 400;
        const errorMessage =
          result.reason === "product_not_found"
            ? "Produit introuvable."
            : "Impossible de modifier ce favori.";

        if (wantsJson) {
          return res.status(statusCode).json({
            ok: false,
            message: errorMessage,
          });
        }

        return res.redirect(303, req.get("referer") || "/favoris");
      }

      if (wantsJson) {
        return res.status(200).json({
          ok: true,
          isFavorite: result.isFavorite,
          slug: result.slug,
        });
      }

      return res.redirect(303, req.get("referer") || "/favoris");
    } catch (error) {
      console.error("[FAVORIS] toggleFavorite error:", error);

      if (wantsJson) {
        return res.status(500).json({
          ok: false,
          message: "Erreur serveur.",
        });
      }

      return res.redirect(303, req.get("referer") || "/favoris");
    }
  },
  showDetailsPage: async (req, res) => {
    const rawSlug = normalizeText(req.query?.slug, 220);
    const requestedSlug = normalizeDetailSlug(rawSlug);
    const hasSlugQuery = rawSlug.length > 0;

    const renderDetailsPage = ({
      status = 200,
      detailProduct = null,
      detailGallery = [],
      detailSizes = [],
      detailColors = [],
      detailReviews = [],
      detailCharacteristics = [],
      detailMessage = null,
    } = {}) => {
      return res.status(status).render("pages/users/details", {
        pageTitle: detailProduct
          ? `${detailProduct.name} | Rose&Bleu`
          : "Details | Rose&Bleu",
        pageStylesheet: "/css/pages/details.css",
        currentPath: req.path,
        authFeedback: null,
        formData: {},
        detailProduct,
        detailGallery,
        detailSizes,
        detailColors,
        detailReviews,
        detailCharacteristics,
        detailComfortPoints: DETAIL_COMFORT_POINTS,
        detailDeliveryInfos: DETAIL_DELIVERY_INFOS,
        detailMessage,
      });
    };

    try {
      if (hasSlugQuery && !requestedSlug) {
        return renderDetailsPage({
          status: 400,
          detailMessage: {
            tone: "error",
            title: "Lien produit invalide",
            text: "Le slug du produit est invalide.",
          },
        });
      }

      let productRow = null;
      if (requestedSlug) {
        productRow = await catalogModel.getPublicProductBySlug(requestedSlug);
        if (!productRow) {
          return renderDetailsPage({
            status: 404,
            detailMessage: {
              tone: "error",
              title: "Produit introuvable",
              text: "Ce produit n existe pas ou n est plus disponible.",
            },
          });
        }
      } else {
        productRow = await catalogModel.getLatestPublicProduct();
      }

      if (!productRow) {
        return renderDetailsPage({
          status: 404,
          detailMessage: {
            tone: "error",
            title: "Aucun produit disponible",
            text: "Ajoute des produits depuis l administration pour voir la fiche detail.",
          },
        });
      }

      const safeDetailQuery = async (label, promiseFactory, fallback = []) => {
        try {
          return await promiseFactory();
        } catch (error) {
          console.error(`[SHOP] showDetailsPage ${label} error:`, error);
          return fallback;
        }
      };

      const [imageRows, variantRows, reviewRows, favoriteRows] = await Promise.all([
        safeDetailQuery(
          "images",
          () => catalogModel.listPublicProductImages(productRow.id),
          [],
        ),
        safeDetailQuery(
          "variants",
          () => catalogModel.listPublicProductVariants(productRow.id),
          [],
        ),
        safeDetailQuery(
          "reviews",
          () => catalogModel.listPublicProductReviews(productRow.id, { limit: 8 }),
          [],
        ),
        req.authUser?.id
          ? safeDetailQuery(
              "favorites",
              () => catalogModel.listFavoriteProductIdsByUserUuid(req.authUser.id),
              [],
            )
          : Promise.resolve([]),
      ]);

      const favoriteProductIdSet = toFavoriteProductIdSet(favoriteRows);

      const mappedProduct = {
        ...mapCatalogProduct(productRow, 0),
        isFavorite: favoriteProductIdSet.has(Number(productRow.id)),
      };
      const sizeValues = uniqueValues(variantRows.map((variant) => variant.size_label));
      const colorValues = uniqueValues(
        variantRows.map((variant) => variant.color_label),
      );

      const detailSizes = sizeValues.length ? sizeValues : ["Unique"];
      const detailColorsSource = colorValues.length ? colorValues : ["Standard"];
      const detailColors = detailColorsSource.map((label, index) => ({
        label,
        hex: resolveColorHex(label, index),
      }));

      const detailGallery = imageRows.length
        ? imageRows.map((image, index) => ({
            src: normalizeText(image.image_url, 500) || DETAIL_GALLERY_FALLBACK[0].src,
            alt:
              sanitizeLongText(image.alt_text, 180) ||
              `${mappedProduct.name} - visuel ${index + 1}`,
            label: index === 0 ? "Vue principale" : `Vue ${index + 1}`,
          }))
        : DETAIL_GALLERY_FALLBACK;

      const detailReviews = reviewRows.map((review, index) => {
        const title = sanitizeLongText(review.title, 160);
        const comment = sanitizeLongText(review.comment, 460);

        return {
          author: `Client ${index + 1}`,
          score: formatRating(review.rating),
          text:
            comment ||
            title ||
            "Retour client valide sur ce produit.",
        };
      });

      const shortDescription = sanitizeLongText(productRow.short_description, 320);
      const fullDescription = sanitizeLongText(productRow.description, 1800);

      const detailProduct = {
        ...mappedProduct,
        shortDescription:
          shortDescription ||
          "Une piece confortable, pratique et pensee pour le quotidien.",
        description:
          fullDescription ||
          shortDescription ||
          "Description produit indisponible pour le moment.",
        reviewCount: Number(productRow.review_count) || detailReviews.length,
        discountTag: resolveProductTag({
          displayPrice: productRow.display_price,
          compareAtPrice: productRow.compare_at_price,
          createdAt: productRow.created_at,
        }),
      };

      const detailCharacteristics = buildDetailCharacteristics({
        product: detailProduct,
        variantCount: variantRows.length,
        sizes: sizeValues,
        colors: colorValues,
      });

      return renderDetailsPage({
        status: 200,
        detailProduct,
        detailGallery,
        detailSizes,
        detailColors,
        detailReviews,
        detailCharacteristics,
        detailMessage: null,
      });
    } catch (error) {
      console.error("[SHOP] showDetailsPage error:", error);
      return renderDetailsPage({
        status: 500,
        detailMessage: {
          tone: "error",
          title: "Erreur serveur",
          text: "Impossible de charger la fiche produit pour le moment.",
        },
      });
    }
  },
  showLoginPage: createPageHandler(
    "pages/users/login",
    "Connexion | Rose&Bleu",
    "/css/pages/login.css",
  ),
  showSignupPage: createPageHandler(
    "pages/users/signup",
    "Inscription | Rose&Bleu",
    "/css/pages/signup.css",
  ),
  showCartPage: async (req, res) => {
    const cartContext = resolveCartContext(req, res, {
      createGuestSession: false,
    });

    try {
      const cartView = await loadCartViewModel(cartContext);

      return res.render("pages/users/cart", {
        pageTitle: "Panier | Rose&Bleu",
        pageStylesheet: "/css/pages/cart.css",
        currentPath: req.path,
        authFeedback: null,
        formData: {},
        cartItems: cartView.cartItems,
        cartSummary: cartView.cartSummary,
        cartTotalQuantity: cartView.cartTotalQuantity,
        cartTrustPoints: CART_TRUST_POINTS,
        cartSuggestions: cartView.cartSuggestions,
      });
    } catch (error) {
      console.error("[CART] showCartPage error:", error);
      return res.render("pages/users/cart", {
        pageTitle: "Panier | Rose&Bleu",
        pageStylesheet: "/css/pages/cart.css",
        currentPath: req.path,
        authFeedback: null,
        formData: {},
        cartItems: [],
        cartSummary: buildCartSummary([]),
        cartTotalQuantity: 0,
        cartTrustPoints: CART_TRUST_POINTS,
        cartSuggestions: [],
      });
    }
  },
  getCartData: async (req, res) => {
    const cartContext = resolveCartContext(req, res, {
      createGuestSession: false,
    });

    try {
      const cartView = await loadCartViewModel(cartContext);

      return res.status(200).json({
        ok: true,
        cartItems: cartView.cartItems,
        cartSummary: cartView.cartSummary,
        cartTotalQuantity: cartView.cartTotalQuantity,
        cartCount: cartView.cartTotalQuantity,
      });
    } catch (error) {
      console.error("[CART] getCartData error:", error);
      return res.status(500).json({
        ok: false,
        message: "Impossible de recuperer les donnees du panier.",
      });
    }
  },
  getCartCount: async (req, res) => {
    const cartContext = resolveCartContext(req, res, {
      createGuestSession: false,
    });

    try {
      const cartCount = await catalogModel.getCartCountByContext(cartContext);
      return res.status(200).json({
        ok: true,
        cartCount,
      });
    } catch (error) {
      console.error("[CART] getCartCount error:", error);
      return res.status(500).json({
        ok: false,
        cartCount: 0,
        message: "Impossible de recuperer le compteur panier.",
      });
    }
  },
  addToCart: async (req, res) => {
    const wantsJson = isJsonRequest(req);
    const requestedSlug = normalizeDetailSlug(req.body?.slug || req.query?.slug);
    const quantity = parsePositiveInteger(req.body?.quantity || req.query?.quantity, 1);
    const sizeLabel = normalizeText(req.body?.size || req.query?.size, 40);
    const colorLabel = normalizeText(req.body?.color || req.query?.color, 60);
    const cartContext = resolveCartContext(req, res, {
      createGuestSession: true,
    });

    if (!requestedSlug) {
      if (wantsJson) {
        return res.status(400).json({
          ok: false,
          message: "Produit invalide.",
        });
      }

      return res.redirect(303, req.get("referer") || "/shop");
    }

    try {
      const result = await catalogModel.addProductToCartByContext({
        ...cartContext,
        productSlug: requestedSlug,
        quantity,
        sizeLabel,
        colorLabel,
      });

      if (!result.ok) {
        const cartError = resolveCartError(result.reason);
        if (wantsJson) {
          return res.status(cartError.status).json({
            ok: false,
            message: cartError.message,
            reason: result.reason,
          });
        }

        return res.redirect(303, req.get("referer") || "/shop");
      }

      if (wantsJson) {
        return res.status(200).json({
          ok: true,
          cartCount: result.cartCount,
        });
      }

      return res.redirect(303, req.get("referer") || "/cart");
    } catch (error) {
      console.error("[CART] addToCart error:", error);

      if (wantsJson) {
        return res.status(500).json({
          ok: false,
          message: "Erreur serveur panier.",
        });
      }

      return res.redirect(303, req.get("referer") || "/cart");
    }
  },
  updateCartItemQuantity: async (req, res) => {
    const wantsJson = isJsonRequest(req);
    const cartItemId = parseInteger(req.body?.itemId || req.query?.itemId, 0);
    const quantity = parseInteger(req.body?.quantity || req.query?.quantity, -1);
    const cartContext = resolveCartContext(req, res, {
      createGuestSession: false,
    });

    if (cartItemId <= 0 || quantity < 0) {
      if (wantsJson) {
        return res.status(400).json({
          ok: false,
          message: "Parametres panier invalides.",
        });
      }

      return res.redirect(303, "/cart");
    }

    try {
      const result = await catalogModel.updateCartItemQuantityByContext({
        ...cartContext,
        cartItemId,
        quantity,
      });

      if (!result.ok) {
        const cartError = resolveCartError(result.reason);
        if (wantsJson) {
          return res.status(cartError.status).json({
            ok: false,
            message: cartError.message,
            reason: result.reason,
          });
        }

        return res.redirect(303, "/cart");
      }

      if (wantsJson) {
        return res.status(200).json({
          ok: true,
          cartCount: result.cartCount,
        });
      }

      return res.redirect(303, "/cart");
    } catch (error) {
      console.error("[CART] updateCartItemQuantity error:", error);

      if (wantsJson) {
        return res.status(500).json({
          ok: false,
          message: "Erreur serveur panier.",
        });
      }

      return res.redirect(303, "/cart");
    }
  },
  removeCartItem: async (req, res) => {
    const wantsJson = isJsonRequest(req);
    const cartItemId = parseInteger(req.body?.itemId || req.query?.itemId, 0);
    const cartContext = resolveCartContext(req, res, {
      createGuestSession: false,
    });

    if (cartItemId <= 0) {
      if (wantsJson) {
        return res.status(400).json({
          ok: false,
          message: "Article panier invalide.",
        });
      }

      return res.redirect(303, "/cart");
    }

    try {
      const result = await catalogModel.removeCartItemByContext({
        ...cartContext,
        cartItemId,
      });

      if (!result.ok) {
        const cartError = resolveCartError(result.reason);
        if (wantsJson) {
          return res.status(cartError.status).json({
            ok: false,
            message: cartError.message,
            reason: result.reason,
          });
        }

        return res.redirect(303, "/cart");
      }

      if (wantsJson) {
        return res.status(200).json({
          ok: true,
          cartCount: result.cartCount,
        });
      }

      return res.redirect(303, "/cart");
    } catch (error) {
      console.error("[CART] removeCartItem error:", error);

      if (wantsJson) {
        return res.status(500).json({
          ok: false,
          message: "Erreur serveur panier.",
        });
      }

      return res.redirect(303, "/cart");
    }
  },
  placeOrder: async (req, res) => {
    const wantsJson = isJsonRequest(req);
    const checkoutPayload = parseCheckoutPayload(req.body);
    const validation = validateCheckoutPayload(checkoutPayload);

    if (!validation.ok) {
      if (wantsJson) {
        return res.status(400).json({
          ok: false,
          message: "Certains champs de livraison sont invalides.",
          fieldErrors: validation.fieldErrors,
        });
      }

      return res.redirect(303, "/cart");
    }

    const cartContext = resolveCartContext(req, res, {
      createGuestSession: false,
    });

    try {
      const cartRows = await catalogModel.listCartRowsByContext(cartContext);
      const cartId = Number(cartRows[0]?.cart_id) || 0;
      if (!cartId) {
        if (wantsJson) {
          return res.status(400).json({
            ok: false,
            message: "Ton panier est vide.",
          });
        }

        return res.redirect(303, "/cart");
      }

      const result = await orderModel.createOrderFromCart({
        cartId,
        userUuid: cartContext.userUuid,
        checkout: checkoutPayload,
        shippingFlatAmount: CART_SHIPPING_FLAT_AMOUNT,
        freeShippingThreshold: CART_FREE_SHIPPING_THRESHOLD,
      });

      if (!result.ok) {
        const checkoutError = resolveCheckoutError(result.reason);
        if (wantsJson) {
          return res.status(checkoutError.status).json({
            ok: false,
            message: checkoutError.message,
            reason: result.reason,
          });
        }

        return res.redirect(303, "/cart");
      }

      if (wantsJson) {
        return res.status(201).json({
          ok: true,
          message: "Commande enregistree avec succes.",
          cartCount: 0,
          order: {
            id: result.orderId,
            number: result.orderNumber,
            itemCount: result.itemCount,
            paymentMethod: result.paymentMethod,
            subtotal: formatPrice(result.subtotal),
            discount: result.discountTotal > 0 ? formatPrice(result.discountTotal) : "0,00 EUR",
            shipping: result.shippingTotal > 0 ? formatPrice(result.shippingTotal) : "Offerte",
            total: formatPrice(result.grandTotal),
            currency: result.currency,
          },
        });
      }

      return res.redirect(303, "/cart");
    } catch (error) {
      console.error("[ORDER] placeOrder error:", error);

      if (wantsJson) {
        return res.status(500).json({
          ok: false,
          message: "Erreur serveur lors de la creation de commande.",
        });
      }

      return res.redirect(303, "/cart");
    }
  },
  clearCart: async (req, res) => {
    const wantsJson = isJsonRequest(req);
    const cartContext = resolveCartContext(req, res, {
      createGuestSession: false,
    });

    try {
      const result = await catalogModel.clearCartByContext(cartContext);

      if (!result.ok) {
        if (wantsJson) {
          return res.status(400).json({
            ok: false,
            message: "Impossible de vider le panier.",
          });
        }

        return res.redirect(303, "/cart");
      }

      if (wantsJson) {
        return res.status(200).json({
          ok: true,
          cartCount: result.cartCount,
        });
      }

      return res.redirect(303, "/cart");
    } catch (error) {
      console.error("[CART] clearCart error:", error);

      if (wantsJson) {
        return res.status(500).json({
          ok: false,
          message: "Erreur serveur panier.",
        });
      }

      return res.redirect(303, "/cart");
    }
  },
};

export default usersControllers;
