import bcrypt from "bcrypt";
import crypto from "node:crypto";
import {
  ADMIN_REFRESH_COOKIE_NAME,
  buildAdminAccessToken,
  buildAdminRefreshToken,
  clearAdminAuthCookies,
  setAdminAuthCookies,
} from "../../config/adminAuth.js";
import adminAuthModel from "../../models/admins/adminAuthModel.js";
import dashboardModel from "../../models/admins/dashboardModel.js";
import orderModel from "../../models/admins/orderModel.js";
import productModel from "../../models/admins/productModel.js";
import userModel from "../../models/admins/userModel.js";

const normalizeText = (value, maxLength = 255) => {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
};

const parseAdminLoginBody = (body = {}) => {
  return {
    key: String(body.key ?? body.adminKey ?? ""),
  };
};

const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const buildAdminIdentity = (adminAuth) => {
  if (!adminAuth) {
    return null;
  }

  return {
    name: normalizeText(adminAuth.fullName || adminAuth.firstName, 180),
    email: normalizeText(adminAuth.email, 190),
  };
};

const renderAdminLoginPage = ({ res, status = 200 } = {}) => {
  return res.status(status).render("pages/admins/login", {
    layout: "layouts/admin-auth",
    pageTitle: "Admin Login | Rose&Bleu",
    pageStylesheet: "/css/pages/admin.css",
    currentAdminPath: "/admin/login",
    adminPageTitle: "",
    adminPageLead: "",
    adminIdentity: null,
  });
};

const moneyFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const generatedAtFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const ADMIN_PRODUCTS_IMAGE_FALLBACKS = {
  bebes: "/images/category-bebes.svg",
  filles: "/images/category-filles.svg",
  accessoires: "/images/category-accessoires.svg",
  default: "/images/hero-slide-1.svg",
};

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatMoney = (value) => {
  return `${moneyFormatter.format(toFiniteNumber(value, 0))} EUR`;
};

const formatDate = (rawDate) => {
  if (!rawDate) {
    return "-";
  }

  const dateValue = new Date(rawDate);
  if (Number.isNaN(dateValue.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateValue);
};

const resolveCustomerName = (rawName, rawEmail) => {
  const fullName = normalizeText(rawName, 180);
  if (fullName) {
    return fullName;
  }

  const email = normalizeText(rawEmail, 190);
  if (!email) {
    return "Client";
  }

  const emailPrefix = email.includes("@") ? email.split("@")[0] : email;
  return normalizeText(emailPrefix, 100) || "Client";
};

const ADMIN_ORDER_STATUS_META = {
  pending: { label: "A verifier", tone: "warn" },
  confirmed: { label: "Confirmee", tone: "warn" },
  processing: { label: "En preparation", tone: "warn" },
  ready_to_ship: { label: "Prete a expedier", tone: "warn" },
  shipped: { label: "Expediee", tone: "ok" },
  delivered: { label: "Livree", tone: "ok" },
  cancelled: { label: "Annulee", tone: "danger" },
  refunded: { label: "Remboursee", tone: "danger" },
};

const ADMIN_ORDER_PAYMENT_METHOD_META = {
  card: "Carte",
  mobile_money: "Mobile Money",
  bank_transfer: "Virement",
  cash_on_delivery: "Paiement a la livraison",
};
const ADMIN_ORDER_STATUS_FLOW = {
  pending: "confirmed",
  confirmed: "processing",
  processing: "ready_to_ship",
  ready_to_ship: "shipped",
  shipped: "delivered",
};

const formatDateTime = (rawDate) => {
  if (!rawDate) {
    return "-";
  }

  const dateValue = new Date(rawDate);
  if (Number.isNaN(dateValue.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(dateValue);
};

const parsePositiveInteger = (value) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
};

const resolveNextOrderStatus = (statusKey) => {
  const normalizedStatus = normalizeText(statusKey, 40).toLowerCase();
  const nextStatus = ADMIN_ORDER_STATUS_FLOW[normalizedStatus] || "";
  if (!nextStatus) {
    return { nextStatus: "", nextLabel: "" };
  }

  const meta = ADMIN_ORDER_STATUS_META[nextStatus] || {
    label: nextStatus,
  };
  return {
    nextStatus,
    nextLabel: normalizeText(meta.label, 60),
  };
};

const sanitizeAdminReturnPath = (value, fallbackPath) => {
  const rawPath = String(value ?? "")
    .trim()
    .slice(0, 400);

  if (rawPath.startsWith("/admin/")) {
    return rawPath;
  }

  return fallbackPath;
};

const appendQueryFlagToPath = (pathValue, key, value = "1") => {
  const safePath = String(pathValue ?? "").trim() || "/admin";

  try {
    const url = new URL(safePath, "http://localhost");
    url.searchParams.set(String(key), String(value));
    return `${url.pathname}${url.search}`;
  } catch (_error) {
    return safePath;
  }
};

const buildOrderStatusOptions = (currentStatus) => {
  const normalizedCurrent = normalizeText(currentStatus, 40).toLowerCase();
  const values = [
    "pending",
    "confirmed",
    "processing",
    "ready_to_ship",
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
  ];

  return values.map((value) => ({
    value,
    label: ADMIN_ORDER_STATUS_META[value]?.label || value,
    selected: value === normalizedCurrent,
  }));
};

const parseAdminOrdersFilters = (query = {}) => {
  return {
    q: orderModel.normalizeAdminOrderSearch(query.q),
    status: orderModel.normalizeAdminOrderStatusFilter(query.status),
  };
};

const mapAdminOrderRow = (row) => {
  const orderId = toFiniteNumber(row.id, 0);
  const statusKey = normalizeText(row.status, 40).toLowerCase();
  const statusData = ADMIN_ORDER_STATUS_META[statusKey] || {
    label: "A verifier",
    tone: "warn",
  };
  const nextStatusData = resolveNextOrderStatus(statusKey);
  const paymentMethodKey = normalizeText(row.payment_method, 40).toLowerCase();

  return {
    id: orderId,
    orderNumber: normalizeText(row.order_number, 40) || "-",
    customer: resolveCustomerName(row.customer_name, row.customer_email),
    date: formatDate(row.placed_at),
    total: formatMoney(row.grand_total),
    payment:
      ADMIN_ORDER_PAYMENT_METHOD_META[paymentMethodKey] ||
      (paymentMethodKey ? normalizeText(paymentMethodKey, 40) : "-"),
    status: statusData.label,
    tone: statusData.tone,
    href: `/admin/orders/${orderId}`,
    nextStatus: nextStatusData.nextStatus,
    nextStatusLabel: nextStatusData.nextLabel,
    canUpdate: Boolean(nextStatusData.nextStatus),
  };
};

const buildAdminOrdersOverview = async (filters) => {
  const [rows, summaryRaw] = await Promise.all([
    orderModel.listAdminOrders({
      search: filters.q,
      status: filters.status,
    }),
    orderModel.getAdminOrdersSummary(),
  ]);

  const orders = rows.map((row) => mapAdminOrderRow(row));
  const totalOrders = Math.max(0, Math.round(toFiniteNumber(summaryRaw.total_orders, 0)));
  const reviewOrders = Math.max(0, Math.round(toFiniteNumber(summaryRaw.review_orders, 0)));
  const processingOrders = Math.max(
    0,
    Math.round(toFiniteNumber(summaryRaw.processing_orders, 0)),
  );
  const shippedOrders = Math.max(0, Math.round(toFiniteNumber(summaryRaw.shipped_orders, 0)));
  const now = new Date();

  return {
    filters,
    orders,
    summary: {
      totalOrders,
      reviewOrders,
      processingOrders,
      shippedOrders,
      filteredOrders: orders.length,
    },
    generatedAt: now.toISOString(),
    generatedLabel: generatedAtFormatter.format(now),
  };
};

const ADMIN_USER_STATUS_META = {
  active: { label: "Actif", tone: "ok" },
  pending: { label: "A verifier", tone: "warn" },
  suspended: { label: "Suspendu", tone: "warn" },
  blocked: { label: "Bloque", tone: "danger" },
};

const resolveUserQuickAction = (statusKey) => {
  const normalizedStatus = normalizeText(statusKey, 40).toLowerCase();

  if (normalizedStatus === "active") {
    return {
      nextStatus: "suspended",
      label: "Suspendre",
    };
  }

  if (normalizedStatus === "pending" || normalizedStatus === "suspended") {
    return {
      nextStatus: "active",
      label: "Reactiver",
    };
  }

  return {
    nextStatus: "",
    label: "Bloque",
  };
};

const buildUserStatusOptions = (currentStatus) => {
  const normalizedCurrent = normalizeText(currentStatus, 40).toLowerCase();
  const values = ["active", "pending", "suspended", "blocked"];

  return values.map((value) => ({
    value,
    label: ADMIN_USER_STATUS_META[value]?.label || value,
    selected: value === normalizedCurrent,
  }));
};

const parseAdminUsersFilters = (query = {}) => {
  return {
    q: userModel.normalizeAdminUserSearch(query.q),
    status: userModel.normalizeAdminUserStatusFilter(query.status),
  };
};

const resolveAdminUserName = (firstName, lastName, email) => {
  const name = normalizeText(
    `${normalizeText(firstName, 100)} ${normalizeText(lastName, 100)}`,
    180,
  );
  if (name) {
    return name;
  }

  return resolveCustomerName("", email);
};

const mapAdminUserRow = (row) => {
  const userId = toFiniteNumber(row.id, 0);
  const statusKey = normalizeText(row.status, 40).toLowerCase();
  const statusData = ADMIN_USER_STATUS_META[statusKey] || {
    label: "A verifier",
    tone: "warn",
  };
  const quickAction = resolveUserQuickAction(statusKey);

  return {
    id: userId,
    name: resolveAdminUserName(row.first_name, row.last_name, row.email),
    email: normalizeText(row.email, 190) || "-",
    orders: Math.max(0, Math.round(toFiniteNumber(row.orders_count, 0))),
    spent: formatMoney(row.spent_total),
    status: statusData.label,
    tone: statusData.tone,
    href: `/admin/users/${userId}`,
    nextStatus: quickAction.nextStatus,
    nextStatusLabel: quickAction.label,
    canUpdate: Boolean(quickAction.nextStatus),
  };
};

const buildAdminUsersOverview = async (filters) => {
  const [rows, summaryRaw] = await Promise.all([
    userModel.listAdminUsers({
      search: filters.q,
      status: filters.status,
    }),
    userModel.getAdminUsersSummary(),
  ]);

  const users = rows.map((row) => mapAdminUserRow(row));
  const totalUsers = Math.max(0, Math.round(toFiniteNumber(summaryRaw.total_users, 0)));
  const activeUsers = Math.max(0, Math.round(toFiniteNumber(summaryRaw.active_users, 0)));
  const watchUsers = Math.max(0, Math.round(toFiniteNumber(summaryRaw.watch_users, 0)));
  const blockedUsers = Math.max(0, Math.round(toFiniteNumber(summaryRaw.blocked_users, 0)));
  const now = new Date();

  return {
    filters,
    users,
    summary: {
      totalUsers,
      activeUsers,
      watchUsers,
      blockedUsers,
      filteredUsers: users.length,
    },
    generatedAt: now.toISOString(),
    generatedLabel: generatedAtFormatter.format(now),
  };
};

const mapAdminOrderItem = (row) => {
  const sizeLabel = normalizeText(row.size_label, 40);
  const colorLabel = normalizeText(row.color_label, 60);

  return {
    id: toFiniteNumber(row.id, 0),
    productName: normalizeText(row.product_name, 180) || "Produit",
    sku: normalizeText(row.sku, 80) || "-",
    variant: [sizeLabel, colorLabel].filter(Boolean).join(" / ") || "-",
    unitPrice: formatMoney(row.unit_price),
    quantity: Math.max(0, Math.round(toFiniteNumber(row.quantity, 0))),
    lineTotal: formatMoney(row.line_total),
    productSlug: normalizeText(row.product_slug, 220),
  };
};

const buildAdminOrderDetails = async (orderId) => {
  const orderRow = await orderModel.getAdminOrderById(orderId);
  if (!orderRow) {
    return null;
  }

  const itemsRows = await orderModel.listAdminOrderItems(orderId);
  const statusKey = normalizeText(orderRow.status, 40).toLowerCase();
  const statusData = ADMIN_ORDER_STATUS_META[statusKey] || {
    label: "A verifier",
    tone: "warn",
  };
  const paymentMethodKey = normalizeText(orderRow.payment_method, 40).toLowerCase();
  const paymentMethodLabel =
    ADMIN_ORDER_PAYMENT_METHOD_META[paymentMethodKey] ||
    (paymentMethodKey ? normalizeText(paymentMethodKey, 40) : "-");
  const customerName = resolveCustomerName(
    `${normalizeText(orderRow.user_first_name, 100)} ${normalizeText(orderRow.user_last_name, 100)}`,
    orderRow.customer_email || orderRow.user_email,
  );

  return {
    id: toFiniteNumber(orderRow.id, 0),
    orderNumber: normalizeText(orderRow.order_number, 40) || "-",
    status: statusData.label,
    tone: statusData.tone,
    statusValue: statusKey || "pending",
    statusOptions: buildOrderStatusOptions(statusKey || "pending"),
    paymentMethod: paymentMethodLabel,
    paymentStatus: normalizeText(orderRow.payment_status, 40) || "-",
    currency: normalizeText(orderRow.currency, 3) || "EUR",
    subtotal: formatMoney(orderRow.subtotal),
    discountTotal: formatMoney(orderRow.discount_total),
    shippingTotal: formatMoney(orderRow.shipping_total),
    taxTotal: formatMoney(orderRow.tax_total),
    grandTotal: formatMoney(orderRow.grand_total),
    customerName,
    customerEmail: normalizeText(orderRow.customer_email, 190) || "-",
    customerPhone: normalizeText(orderRow.customer_phone, 30) || "-",
    note: normalizeText(orderRow.note, 500),
    placedAt: formatDateTime(orderRow.placed_at),
    shippedAt: formatDateTime(orderRow.shipped_at),
    deliveredAt: formatDateTime(orderRow.delivered_at),
    updatedAt: formatDateTime(orderRow.updated_at),
    items: itemsRows.map((row) => mapAdminOrderItem(row)),
  };
};

const mapAdminUserRecentOrder = (row) => {
  const statusKey = normalizeText(row.status, 40).toLowerCase();
  const statusMeta = ADMIN_ORDER_STATUS_META[statusKey] || {
    label: "A verifier",
    tone: "warn",
  };

  return {
    id: toFiniteNumber(row.id, 0),
    orderNumber: normalizeText(row.order_number, 40) || "-",
    status: statusMeta.label,
    tone: statusMeta.tone,
    total: formatMoney(row.grand_total),
    placedAt: formatDateTime(row.placed_at),
    href: `/admin/orders/${toFiniteNumber(row.id, 0)}`,
  };
};

const buildAdminUserDetails = async (userId) => {
  const userRow = await userModel.getAdminUserById(userId);
  if (!userRow) {
    return null;
  }

  const ordersRows = await userModel.listAdminUserRecentOrders(userId, 10);
  const statusKey = normalizeText(userRow.status, 40).toLowerCase();
  const statusMeta = ADMIN_USER_STATUS_META[statusKey] || {
    label: "A verifier",
    tone: "warn",
  };
  const fullName = resolveAdminUserName(
    userRow.first_name,
    userRow.last_name,
    userRow.email,
  );

  return {
    id: toFiniteNumber(userRow.id, 0),
    uuid: normalizeText(userRow.uuid, 36),
    name: fullName,
    firstName: normalizeText(userRow.first_name, 100),
    lastName: normalizeText(userRow.last_name, 100),
    email: normalizeText(userRow.email, 190) || "-",
    phone: normalizeText(userRow.phone, 30) || "-",
    status: statusMeta.label,
    tone: statusMeta.tone,
    statusValue: statusKey || "active",
    statusOptions: buildUserStatusOptions(statusKey || "active"),
    ordersCount: Math.max(0, Math.round(toFiniteNumber(userRow.orders_count, 0))),
    spentTotal: formatMoney(userRow.spent_total),
    createdAt: formatDateTime(userRow.created_at),
    lastLoginAt: formatDateTime(userRow.last_login_at),
    emailVerifiedAt: formatDateTime(userRow.email_verified_at),
    recentOrders: ordersRows.map((row) => mapAdminUserRecentOrder(row)),
  };
};

const formatRelativeUpdate = (rawDate) => {
  if (!rawDate) {
    return "Maj recente";
  }

  const dateValue = new Date(rawDate);
  if (Number.isNaN(dateValue.getTime())) {
    return "Maj recente";
  }

  const nowMs = Date.now();
  const diffMs = Math.max(0, nowMs - dateValue.getTime());
  const diffMinutes = Math.round(diffMs / (60 * 1000));

  if (diffMinutes < 1) {
    return "Maj a l instant";
  }

  if (diffMinutes < 60) {
    return `Maj il y a ${diffMinutes} min`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `Maj il y a ${diffHours}h`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) {
    return "Maj hier";
  }

  return `Maj le ${new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  }).format(dateValue)}`;
};

const resolveAdminProductFallbackImage = (categoryName) => {
  const normalized = normalizeText(categoryName, 120).toLowerCase();

  if (normalized.includes("bebe")) {
    return ADMIN_PRODUCTS_IMAGE_FALLBACKS.bebes;
  }

  if (normalized.includes("fille")) {
    return ADMIN_PRODUCTS_IMAGE_FALLBACKS.filles;
  }

  if (normalized.includes("accessoire")) {
    return ADMIN_PRODUCTS_IMAGE_FALLBACKS.accessoires;
  }

  return ADMIN_PRODUCTS_IMAGE_FALLBACKS.default;
};

const resolveAdminProductStatus = ({ productStatus, stockTotal }) => {
  const normalizedStatus = normalizeText(productStatus, 40).toLowerCase();
  const stock = Math.max(0, Math.round(toFiniteNumber(stockTotal, 0)));

  if (normalizedStatus === "archived") {
    return { status: "Archive", tone: "danger" };
  }

  if (normalizedStatus === "draft") {
    return { status: "Brouillon", tone: "warn" };
  }

  if (stock <= 0) {
    return { status: "Rupture", tone: "danger" };
  }

  if (stock <= productModel.LOW_STOCK_THRESHOLD) {
    return { status: "Stock limite", tone: "warn" };
  }

  return { status: "Actif", tone: "ok" };
};

const parseAdminProductsFilters = (query = {}) => {
  return {
    q: productModel.normalizeAdminProductSearch(query.q),
    stock: productModel.normalizeAdminProductStockFilter(query.stock),
  };
};

const mapAdminProductCard = (row) => {
  const stockTotal = Math.max(0, Math.round(toFiniteNumber(row.stock_total, 0)));
  const displayPrice = toFiniteNumber(row.display_price, toFiniteNumber(row.base_price, 0));
  const compareAtPrice = toFiniteNumber(row.compare_at_price, 0);
  const statusData = resolveAdminProductStatus({
    productStatus: row.product_status,
    stockTotal,
  });
  const categoryName = normalizeText(row.category_name, 120) || "Collection";

  return {
    id: toFiniteNumber(row.id, 0),
    name: normalizeText(row.name, 180) || "Produit sans nom",
    category: categoryName,
    sku: normalizeText(row.sku, 80) || "-",
    price: formatMoney(displayPrice),
    oldPrice: compareAtPrice > displayPrice ? formatMoney(compareAtPrice) : "",
    stock: stockTotal,
    status: statusData.status,
    tone: statusData.tone,
    image:
      normalizeText(row.image_url, 500) ||
      resolveAdminProductFallbackImage(categoryName),
    updated: formatRelativeUpdate(row.updated_at),
    href: `/admin/produits/${toFiniteNumber(row.id, 0)}/edit`,
  };
};

const buildAdminProductsOverview = async (filters) => {
  const [rows, summaryRaw] = await Promise.all([
    productModel.listAdminProducts({
      search: filters.q,
      stock: filters.stock,
    }),
    productModel.getAdminProductSummary(),
  ]);

  const products = rows.map((row) => mapAdminProductCard(row));
  const totalProducts = Math.max(0, Math.round(toFiniteNumber(summaryRaw.total_products, 0)));
  const activeProducts = Math.max(0, Math.round(toFiniteNumber(summaryRaw.active_products, 0)));
  const lowStockProducts = Math.max(
    0,
    Math.round(toFiniteNumber(summaryRaw.low_stock_products, 0)),
  );
  const outOfStockProducts = Math.max(
    0,
    Math.round(toFiniteNumber(summaryRaw.out_of_stock_products, 0)),
  );
  const now = new Date();

  return {
    filters,
    products,
    summary: {
      totalProducts,
      activeProducts,
      lowStockProducts,
      outOfStockProducts,
      watchProducts: lowStockProducts + outOfStockProducts,
      filteredProducts: products.length,
    },
    generatedAt: now.toISOString(),
    generatedLabel: generatedAtFormatter.format(now),
  };
};

const resolveAdminPageContext = (req, pageIdentity = null) => {
  const rawPath = `${req.baseUrl}${req.path === "/" ? "" : req.path}`;
  const currentAdminPath = rawPath || "/admin";

  const baseIdentity = buildAdminIdentity(req.adminAuth);
  const adminIdentity = baseIdentity
    ? { ...baseIdentity, ...(pageIdentity || {}) }
    : pageIdentity;

  return {
    currentAdminPath,
    adminIdentity: adminIdentity || null,
  };
};

const createAdminPageHandler = (view, pageTitle, adminPageMeta = {}) => {
  return (req, res) => {
    const pageContext = resolveAdminPageContext(req, adminPageMeta.identity || null);

    return res.render(view, {
      layout: adminPageMeta.layout || "layouts/admin",
      pageTitle,
      pageStylesheet: "/css/pages/admin.css",
      currentAdminPath: pageContext.currentAdminPath,
      adminPageTitle: adminPageMeta.title || "",
      adminPageLead: adminPageMeta.lead || "",
      adminIdentity: pageContext.adminIdentity,
      formData: {},
    });
  };
};

const emitAdminRealtimeEvent = (req, eventName, payload = {}) => {
  if (!req.io || typeof req.io.to !== "function") {
    return;
  }

  req.io.to("admins").emit(eventName, {
    ...payload,
    at: new Date().toISOString(),
  });
};

const resolveAdminByAccessKey = async (rawAccessKey) => {
  const accessKey = normalizeText(rawAccessKey, 240);
  if (!accessKey) {
    return null;
  }

  const admins = await adminAuthModel.listActiveAdminsWithAccessKeyHash();
  for (const adminRow of admins) {
    const hash = String(adminRow.admin_access_key_hash || "").trim();
    if (!hash) {
      continue;
    }

    const isValid = await bcrypt.compare(accessKey, hash);
    if (isValid) {
      return adminRow;
    }
  }

  return null;
};

const issueAdminSession = async (res, adminUser) => {
  const refreshTokenId = adminAuthModel.createUuid();
  const accessToken = buildAdminAccessToken(adminUser);
  const refreshToken = buildAdminRefreshToken(adminUser, refreshTokenId);

  await adminAuthModel.createAdminRefreshToken({
    tokenId: refreshTokenId,
    userId: adminUser.id,
    tokenHash: hashToken(refreshToken),
  });

  setAdminAuthCookies(res, accessToken, refreshToken);
};

const adminControllers = {
  showDashboardPage: async (req, res) => {
    const pageContext = resolveAdminPageContext(req, {
      showBadge: true,
    });

    let adminDashboard = dashboardModel.buildFallbackDashboardSnapshot();
    try {
      adminDashboard = await dashboardModel.getRealtimeDashboardSnapshot();
    } catch (error) {
      console.error("[ADMIN DASHBOARD] showDashboardPage error:", error);
    }

    return res.render("pages/admins/dashboard", {
      layout: "layouts/admin",
      pageTitle: "Admin Dashboard | Rose&Bleu",
      pageStylesheet: "/css/pages/admin.css",
      currentAdminPath: pageContext.currentAdminPath,
      adminPageTitle: "Dashboard",
      adminPageLead: "Suivi des ventes, commandes et clients en temps reel.",
      adminIdentity: pageContext.adminIdentity,
      formData: {},
      adminDashboard,
    });
  },
  showAddProductPage: createAdminPageHandler(
    "pages/admins/ajoutproduit",
    "Admin Ajout Produit | Rose&Bleu",
    {
      title: "Ajouter un produit",
      lead: "Cree une nouvelle fiche produit complete.",
    },
  ),
  showUsersPage: async (req, res) => {
    const pageContext = resolveAdminPageContext(req, null);
    const filters = parseAdminUsersFilters(req.query);

    let adminUsersOverview = {
      filters,
      users: [],
      summary: {
        totalUsers: 0,
        activeUsers: 0,
        watchUsers: 0,
        blockedUsers: 0,
        filteredUsers: 0,
      },
      generatedAt: "",
      generatedLabel: "",
    };

    try {
      adminUsersOverview = await buildAdminUsersOverview(filters);
    } catch (error) {
      console.error("[ADMIN USERS] showUsersPage error:", error);
    }

    const usersFeedback =
      req.query?.updated === "1"
        ? {
            tone: "success",
            title: "Utilisateur mis a jour",
            message: "Le statut utilisateur a ete mis a jour.",
          }
        : req.query?.error === "1"
          ? {
              tone: "error",
              title: "Action impossible",
              message: "Impossible de mettre a jour ce compte pour le moment.",
            }
          : null;

    return res.render("pages/admins/users", {
      layout: "layouts/admin",
      pageTitle: "Admin Utilisateurs | Rose&Bleu",
      pageStylesheet: "/css/pages/admin.css",
      currentAdminPath: pageContext.currentAdminPath,
      adminPageTitle: "Utilisateurs",
      adminPageLead: "Consulte les comptes clients et leur activite.",
      adminIdentity: pageContext.adminIdentity,
      formData: {},
      adminUsersOverview,
      usersFeedback,
    });
  },
  showOrdersPage: async (req, res) => {
    const pageContext = resolveAdminPageContext(req, null);
    const filters = parseAdminOrdersFilters(req.query);

    let adminOrdersOverview = {
      filters,
      orders: [],
      summary: {
        totalOrders: 0,
        reviewOrders: 0,
        processingOrders: 0,
        shippedOrders: 0,
        filteredOrders: 0,
      },
      generatedAt: "",
      generatedLabel: "",
    };

    try {
      adminOrdersOverview = await buildAdminOrdersOverview(filters);
    } catch (error) {
      console.error("[ADMIN ORDERS] showOrdersPage error:", error);
    }

    const ordersFeedback =
      req.query?.updated === "1"
        ? {
            tone: "success",
            title: "Commande mise a jour",
            message: "Le statut de la commande a ete modifie.",
          }
        : req.query?.error === "1"
          ? {
              tone: "error",
              title: "Action impossible",
              message: "Impossible de mettre a jour cette commande pour le moment.",
            }
          : null;

    return res.render("pages/admins/orders", {
      layout: "layouts/admin",
      pageTitle: "Admin Commandes | Rose&Bleu",
      pageStylesheet: "/css/pages/admin.css",
      currentAdminPath: pageContext.currentAdminPath,
      adminPageTitle: "Commandes",
      adminPageLead: "Suis les commandes, statuts et priorites du jour.",
      adminIdentity: pageContext.adminIdentity,
      formData: {},
      adminOrdersOverview,
      ordersFeedback,
    });
  },
  showOrderDetailsPage: async (req, res) => {
    const pageContext = resolveAdminPageContext(req, null);
    const orderId = parsePositiveInteger(req.params.orderId);
    if (!Number.isInteger(orderId)) {
      return res.redirect(303, "/admin/orders");
    }

    try {
      const adminOrderDetail = await buildAdminOrderDetails(orderId);
      if (!adminOrderDetail) {
        return res.redirect(303, "/admin/orders");
      }

      const feedback =
        req.query?.updated === "1"
          ? {
              tone: "success",
              title: "Commande mise a jour",
              message: "Le statut de la commande a ete mis a jour.",
            }
          : req.query?.error === "1"
            ? {
                tone: "error",
                title: "Mise a jour impossible",
                message: "Impossible de mettre a jour cette commande pour le moment.",
              }
            : null;

      return res.render("pages/admins/orderdetails", {
        layout: "layouts/admin",
        pageTitle: "Admin Details Commande | Rose&Bleu",
        pageStylesheet: "/css/pages/admin.css",
        currentAdminPath: "/admin/orders",
        adminPageTitle: `Commande ${adminOrderDetail.orderNumber}`,
        adminPageLead: "Consulte les details et mets a jour le statut.",
        adminIdentity: pageContext.adminIdentity,
        formData: {},
        adminOrderDetail,
        orderDetailFeedback: feedback,
      });
    } catch (error) {
      console.error("[ADMIN ORDERS] showOrderDetailsPage error:", error);
      return res.redirect(303, "/admin/orders");
    }
  },
  updateOrderStatus: async (req, res) => {
    const orderId = parsePositiveInteger(req.params.orderId);
    if (!Number.isInteger(orderId)) {
      return res.redirect(303, "/admin/orders");
    }

    const nextStatus = orderModel.normalizeAdminOrderStatusValue(req.body?.status);
    const fallbackReturnPath = `/admin/orders/${orderId}`;
    const returnPath = sanitizeAdminReturnPath(
      req.body?.returnTo,
      fallbackReturnPath,
    );

    if (!nextStatus) {
      return res.redirect(
        303,
        appendQueryFlagToPath(returnPath, "error", "1"),
      );
    }

    try {
      const currentOrder = await orderModel.getAdminOrderById(orderId);
      if (!currentOrder) {
        return res.redirect(
          303,
          appendQueryFlagToPath(returnPath, "error", "1"),
        );
      }

      const currentStatus = normalizeText(currentOrder.status, 40).toLowerCase();
      if (currentStatus === nextStatus) {
        return res.redirect(
          303,
          appendQueryFlagToPath(returnPath, "updated", "1"),
        );
      }

      const updated = await orderModel.updateAdminOrderStatus({
        orderId,
        status: nextStatus,
      });

      if (!updated) {
        return res.redirect(
          303,
          appendQueryFlagToPath(returnPath, "error", "1"),
        );
      }

      emitAdminRealtimeEvent(req, "admin:orders:updated", {
        orderId,
        status: nextStatus,
      });

      return res.redirect(
        303,
        appendQueryFlagToPath(returnPath, "updated", "1"),
      );
    } catch (error) {
      console.error("[ADMIN ORDERS] updateOrderStatus error:", error);
      return res.redirect(
        303,
        appendQueryFlagToPath(returnPath, "error", "1"),
      );
    }
  },
  showUserDetailsPage: async (req, res) => {
    const pageContext = resolveAdminPageContext(req, null);
    const userId = parsePositiveInteger(req.params.userId);
    if (!Number.isInteger(userId)) {
      return res.redirect(303, "/admin/users");
    }

    try {
      const adminUserDetail = await buildAdminUserDetails(userId);
      if (!adminUserDetail) {
        return res.redirect(303, "/admin/users");
      }

      const feedback =
        req.query?.updated === "1"
          ? {
              tone: "success",
              title: "Utilisateur mis a jour",
              message: "Le statut du compte a ete mis a jour.",
            }
          : req.query?.error === "1"
            ? {
                tone: "error",
                title: "Mise a jour impossible",
                message: "Impossible de mettre a jour cet utilisateur pour le moment.",
              }
            : null;

      return res.render("pages/admins/userdetails", {
        layout: "layouts/admin",
        pageTitle: "Admin Profil Utilisateur | Rose&Bleu",
        pageStylesheet: "/css/pages/admin.css",
        currentAdminPath: "/admin/users",
        adminPageTitle: `Profil ${adminUserDetail.name}`,
        adminPageLead: "Consulte le profil client et ajuste le statut.",
        adminIdentity: pageContext.adminIdentity,
        formData: {},
        adminUserDetail,
        userDetailFeedback: feedback,
      });
    } catch (error) {
      console.error("[ADMIN USERS] showUserDetailsPage error:", error);
      return res.redirect(303, "/admin/users");
    }
  },
  updateUserStatus: async (req, res) => {
    const userId = parsePositiveInteger(req.params.userId);
    if (!Number.isInteger(userId)) {
      return res.redirect(303, "/admin/users");
    }

    const nextStatus = userModel.normalizeAdminUserStatusValue(req.body?.status);
    const fallbackReturnPath = `/admin/users/${userId}`;
    const returnPath = sanitizeAdminReturnPath(
      req.body?.returnTo,
      fallbackReturnPath,
    );

    if (!nextStatus) {
      return res.redirect(
        303,
        appendQueryFlagToPath(returnPath, "error", "1"),
      );
    }

    try {
      const currentUser = await userModel.getAdminUserById(userId);
      if (!currentUser) {
        return res.redirect(
          303,
          appendQueryFlagToPath(returnPath, "error", "1"),
        );
      }

      const currentStatus = normalizeText(currentUser.status, 40).toLowerCase();
      if (currentStatus === nextStatus) {
        return res.redirect(
          303,
          appendQueryFlagToPath(returnPath, "updated", "1"),
        );
      }

      const updated = await userModel.updateAdminUserStatus({
        userId,
        status: nextStatus,
      });

      if (!updated) {
        return res.redirect(
          303,
          appendQueryFlagToPath(returnPath, "error", "1"),
        );
      }

      emitAdminRealtimeEvent(req, "admin:users:updated", {
        userId,
        status: nextStatus,
      });

      return res.redirect(
        303,
        appendQueryFlagToPath(returnPath, "updated", "1"),
      );
    } catch (error) {
      console.error("[ADMIN USERS] updateUserStatus error:", error);
      return res.redirect(
        303,
        appendQueryFlagToPath(returnPath, "error", "1"),
      );
    }
  },
  showLoginPage: async (req, res) => {
    if (req.adminAuth) {
      return res.redirect(302, "/admin/dashboard");
    }

    return renderAdminLoginPage({ res });
  },
  login: async (req, res) => {
    try {
      await adminAuthModel.ensureAdminAuthSchemaReady();
      const payload = parseAdminLoginBody(req.body);

      const adminUser = await resolveAdminByAccessKey(payload.key);
      if (!adminUser) {
        clearAdminAuthCookies(res);
        return renderAdminLoginPage({
          res,
          status: 401,
        });
      }

      await adminAuthModel.updateAdminLastLoginAt(adminUser.id);
      await issueAdminSession(res, adminUser);

      emitAdminRealtimeEvent(req, "admin:auth:login", {
        adminId: String(adminUser.uuid),
        email: String(adminUser.email || ""),
      });

      return res.redirect(303, "/admin/dashboard");
    } catch (error) {
      console.error("[ADMIN AUTH] login error:", error);
      clearAdminAuthCookies(res);
      return renderAdminLoginPage({
        res,
        status: 500,
      });
    }
  },
  logout: async (req, res) => {
    try {
      const adminAuth = req.adminAuth || null;
      const refreshToken = normalizeText(
        req.cookies?.[ADMIN_REFRESH_COOKIE_NAME],
        4000,
      );

      if (refreshToken) {
        await adminAuthModel.revokeAdminRefreshTokenByHash(hashToken(refreshToken));
      }

      clearAdminAuthCookies(res);

      if (adminAuth?.id) {
        emitAdminRealtimeEvent(req, "admin:auth:logout", {
          adminId: String(adminAuth.id),
          email: String(adminAuth.email || ""),
        });
      }

      return res.redirect(303, "/admin/login");
    } catch (error) {
      console.error("[ADMIN AUTH] logout error:", error);
      clearAdminAuthCookies(res);
      return res.redirect(303, "/admin/login");
    }
  },
  getDashboardStats: async (_req, res) => {
    try {
      const snapshot = await dashboardModel.getRealtimeDashboardSnapshot();
      return res.status(200).json({
        ok: true,
        snapshot,
      });
    } catch (error) {
      console.error("[ADMIN DASHBOARD] getDashboardStats error:", error);
      return res.status(200).json({
        ok: true,
        snapshot: dashboardModel.buildFallbackDashboardSnapshot(),
      });
    }
  },
  showProductsPage: async (req, res) => {
    const pageContext = resolveAdminPageContext(req, null);
    const filters = parseAdminProductsFilters(req.query);

    let adminProductsOverview = {
      filters,
      products: [],
      summary: {
        totalProducts: 0,
        activeProducts: 0,
        lowStockProducts: 0,
        outOfStockProducts: 0,
        watchProducts: 0,
        filteredProducts: 0,
      },
      generatedAt: "",
      generatedLabel: "",
    };

    try {
      adminProductsOverview = await buildAdminProductsOverview(filters);
    } catch (error) {
      console.error("[ADMIN PRODUCTS] showProductsPage error:", error);
    }

    return res.render("pages/admins/produits", {
      layout: "layouts/admin",
      pageTitle: "Admin Produits | Rose&Bleu",
      pageStylesheet: "/css/pages/admin.css",
      currentAdminPath: pageContext.currentAdminPath,
      adminPageTitle: "Produits",
      adminPageLead: "Gere le catalogue, le stock et les actions rapides.",
      adminIdentity: pageContext.adminIdentity,
      formData: {},
      adminProductsOverview,
    });
  },
  getProductsOverview: async (req, res) => {
    try {
      const filters = parseAdminProductsFilters(req.query);
      const payload = await buildAdminProductsOverview(filters);
      return res.status(200).json({
        ok: true,
        payload,
      });
    } catch (error) {
      console.error("[ADMIN PRODUCTS] getProductsOverview error:", error);
      return res.status(500).json({
        ok: false,
        message: "Impossible de charger les produits pour le moment.",
      });
    }
  },
  getOrdersOverview: async (req, res) => {
    try {
      const filters = parseAdminOrdersFilters(req.query);
      const payload = await buildAdminOrdersOverview(filters);
      return res.status(200).json({
        ok: true,
        payload,
      });
    } catch (error) {
      console.error("[ADMIN ORDERS] getOrdersOverview error:", error);
      return res.status(500).json({
        ok: false,
        message: "Impossible de charger les commandes pour le moment.",
      });
    }
  },
  getUsersOverview: async (req, res) => {
    try {
      const filters = parseAdminUsersFilters(req.query);
      const payload = await buildAdminUsersOverview(filters);
      return res.status(200).json({
        ok: true,
        payload,
      });
    } catch (error) {
      console.error("[ADMIN USERS] getUsersOverview error:", error);
      return res.status(500).json({
        ok: false,
        message: "Impossible de charger les utilisateurs pour le moment.",
      });
    }
  },
};

export default adminControllers;
