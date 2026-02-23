import mysql from "mysql2/promise";
import config from "../../config/config.js";

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
});

const ACTIVE_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "ready_to_ship",
  "shipped",
  "delivered",
];
const ACTIVE_ORDER_STATUS_PLACEHOLDERS = ACTIVE_ORDER_STATUSES
  .map(() => "?")
  .join(", ");

const ORDER_STATUS_META = {
  pending: { label: "A verifier", tone: "warn" },
  confirmed: { label: "Confirmee", tone: "warn" },
  processing: { label: "En preparation", tone: "warn" },
  ready_to_ship: { label: "Prete a expedier", tone: "warn" },
  shipped: { label: "Expediee", tone: "ok" },
  delivered: { label: "Livree", tone: "ok" },
  cancelled: { label: "Annulee", tone: "danger" },
  refunded: { label: "Remboursee", tone: "danger" },
};

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  timeZone: "UTC",
});

const numberFormatter = new Intl.NumberFormat("fr-FR");
const moneyFormatter0 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const moneyFormatter1 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const moneyFormatter2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const updatedAtFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const normalizeText = (value, maxLength = 120) => {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
};

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatInteger = (value) => {
  return numberFormatter.format(Math.max(0, Math.round(toFiniteNumber(value, 0))));
};

const formatMoney = (value, decimals = 0) => {
  const amount = toFiniteNumber(value, 0);
  const formatter =
    decimals === 2 ? moneyFormatter2 : decimals === 1 ? moneyFormatter1 : moneyFormatter0;
  return `${formatter.format(amount)} EUR`;
};

const buildTrend = (currentValue, previousValue) => {
  const current = toFiniteNumber(currentValue, 0);
  const previous = toFiniteNumber(previousValue, 0);

  if (previous === 0) {
    if (current === 0) {
      return { text: "0%", tone: "up", icon: "bx-trending-up" };
    }

    return { text: "+100%", tone: "up", icon: "bx-trending-up" };
  }

  const deltaPercent = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(deltaPercent);
  const sign = rounded > 0 ? "+" : "";
  const tone = rounded < 0 ? "down" : "up";
  const icon = rounded < 0 ? "bx-trending-down" : "bx-trending-up";

  return {
    text: `${sign}${rounded}%`,
    tone,
    icon,
  };
};

const startOfUtcDay = (date) => {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
};

const addDaysUtc = (date, days) => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const toSqlDateTime = (date) => {
  return date.toISOString().slice(0, 19).replace("T", " ");
};

const toDayKey = (date) => {
  return date.toISOString().slice(0, 10);
};

const formatDayLabel = (date) => {
  const raw = dayFormatter.format(date).replace(".", "").toLowerCase();
  if (!raw) {
    return "";
  }

  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const resolveCustomerLabel = (row) => {
  const fullName = normalizeText(row?.customer_name, 140);
  if (fullName) {
    return fullName;
  }

  const email = normalizeText(row?.customer_email, 190);
  if (!email.includes("@")) {
    return email || "Client";
  }

  return normalizeText(email.split("@")[0], 80) || "Client";
};

const getOrderWindowStats = async ({ fromDate, toDate }) => {
  const [rows] = await pool.query(
    `
      SELECT
        COALESCE(SUM(o.grand_total), 0) AS revenue_total,
        COUNT(*) AS orders_count,
        COALESCE(AVG(o.grand_total), 0) AS avg_ticket
      FROM orders o
      WHERE o.status IN (${ACTIVE_ORDER_STATUS_PLACEHOLDERS})
        AND o.placed_at >= ?
        AND o.placed_at < ?
    `,
    [
      ...ACTIVE_ORDER_STATUSES,
      toSqlDateTime(fromDate),
      toSqlDateTime(toDate),
    ],
  );

  return rows[0] ?? { revenue_total: 0, orders_count: 0, avg_ticket: 0 };
};

const getNewCustomersCount = async ({ fromDate, toDate }) => {
  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS total
      FROM users
      WHERE role = 'customer'
        AND created_at >= ?
        AND created_at < ?
    `,
    [toSqlDateTime(fromDate), toSqlDateTime(toDate)],
  );

  return toFiniteNumber(rows[0]?.total, 0);
};

const getWeeklyRevenueRows = async ({ fromDate, toDate }) => {
  const [rows] = await pool.query(
    `
      SELECT
        DATE_FORMAT(o.placed_at, '%Y-%m-%d') AS day_key,
        COALESCE(SUM(o.grand_total), 0) AS revenue_total
      FROM orders o
      WHERE o.status IN (${ACTIVE_ORDER_STATUS_PLACEHOLDERS})
        AND o.placed_at >= ?
        AND o.placed_at < ?
      GROUP BY day_key
      ORDER BY day_key ASC
    `,
    [
      ...ACTIVE_ORDER_STATUSES,
      toSqlDateTime(fromDate),
      toSqlDateTime(toDate),
    ],
  );

  return rows;
};

const getCategoryDistributionRows = async () => {
  const [rows] = await pool.query(
    `
      SELECT
        COALESCE(c.name, 'Collection') AS name,
        COUNT(*) AS total
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'active'
        AND p.visibility = 'public'
      GROUP BY c.id, c.name
      ORDER BY total DESC, name ASC
      LIMIT 5
    `,
  );

  return rows;
};

const getRecentOrdersRows = async () => {
  const [rows] = await pool.query(
    `
      SELECT
        o.order_number,
        o.grand_total,
        o.status,
        o.placed_at,
        o.customer_email,
        NULLIF(
          TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))),
          ''
        ) AS customer_name
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      ORDER BY o.placed_at DESC, o.id DESC
      LIMIT 6
    `,
  );

  return rows;
};

const buildFallbackDashboardSnapshot = () => {
  const now = new Date();

  return {
    generatedAt: now.toISOString(),
    generatedLabel: updatedAtFormatter.format(now),
    stats: [
      {
        id: "revenueToday",
        label: "Chiffre du jour",
        value: "0 EUR",
        trend: "0%",
        trendTone: "up",
        trendIcon: "bx-trending-up",
      },
      {
        id: "ordersToday",
        label: "Commandes",
        value: "0",
        trend: "0%",
        trendTone: "up",
        trendIcon: "bx-trending-up",
      },
      {
        id: "newCustomersToday",
        label: "Nouveaux clients",
        value: "0",
        trend: "0%",
        trendTone: "up",
        trendIcon: "bx-trending-up",
      },
      {
        id: "avgCartToday",
        label: "Panier moyen",
        value: "0,0 EUR",
        trend: "0%",
        trendTone: "up",
        trendIcon: "bx-trending-up",
      },
    ],
    weeklyPerformance: new Array(7).fill(null).map((_, index) => ({
      key: `fallback-${index}`,
      label: `Jour ${index + 1}`,
      value: 0,
      valueLabel: "0 EUR",
      height: 18,
    })),
    categoryDistribution: [],
    recentOrders: [],
  };
};

const getRealtimeDashboardSnapshot = async () => {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const tomorrowStart = addDaysUtc(todayStart, 1);
  const yesterdayStart = addDaysUtc(todayStart, -1);
  const last7DaysStart = addDaysUtc(todayStart, -6);

  const [
    todayStats,
    yesterdayStats,
    newCustomersToday,
    newCustomersYesterday,
    weeklyRows,
    categoryRows,
    recentOrdersRows,
  ] = await Promise.all([
    getOrderWindowStats({ fromDate: todayStart, toDate: tomorrowStart }),
    getOrderWindowStats({ fromDate: yesterdayStart, toDate: todayStart }),
    getNewCustomersCount({ fromDate: todayStart, toDate: tomorrowStart }),
    getNewCustomersCount({ fromDate: yesterdayStart, toDate: todayStart }),
    getWeeklyRevenueRows({ fromDate: last7DaysStart, toDate: tomorrowStart }),
    getCategoryDistributionRows(),
    getRecentOrdersRows(),
  ]);

  const trendRevenue = buildTrend(todayStats.revenue_total, yesterdayStats.revenue_total);
  const trendOrders = buildTrend(todayStats.orders_count, yesterdayStats.orders_count);
  const trendCustomers = buildTrend(newCustomersToday, newCustomersYesterday);
  const trendAvgCart = buildTrend(todayStats.avg_ticket, yesterdayStats.avg_ticket);

  const stats = [
    {
      id: "revenueToday",
      label: "Chiffre du jour",
      value: formatMoney(todayStats.revenue_total, 0),
      trend: trendRevenue.text,
      trendTone: trendRevenue.tone,
      trendIcon: trendRevenue.icon,
    },
    {
      id: "ordersToday",
      label: "Commandes",
      value: formatInteger(todayStats.orders_count),
      trend: trendOrders.text,
      trendTone: trendOrders.tone,
      trendIcon: trendOrders.icon,
    },
    {
      id: "newCustomersToday",
      label: "Nouveaux clients",
      value: formatInteger(newCustomersToday),
      trend: trendCustomers.text,
      trendTone: trendCustomers.tone,
      trendIcon: trendCustomers.icon,
    },
    {
      id: "avgCartToday",
      label: "Panier moyen",
      value: formatMoney(todayStats.avg_ticket, 1),
      trend: trendAvgCart.text,
      trendTone: trendAvgCart.tone,
      trendIcon: trendAvgCart.icon,
    },
  ];

  const weeklyByKey = new Map(
    weeklyRows.map((row) => [
      normalizeText(row.day_key, 10),
      toFiniteNumber(row.revenue_total, 0),
    ]),
  );

  const weeklyRaw = [];
  for (let index = 0; index < 7; index += 1) {
    const dayDate = addDaysUtc(last7DaysStart, index);
    const dayKey = toDayKey(dayDate);
    const revenue = weeklyByKey.get(dayKey) ?? 0;

    weeklyRaw.push({
      key: dayKey,
      label: formatDayLabel(dayDate),
      value: revenue,
      valueLabel: formatMoney(revenue, 0),
    });
  }

  const maxWeeklyRevenue = Math.max(
    ...weeklyRaw.map((item) => toFiniteNumber(item.value, 0)),
    0,
  );

  const weeklyPerformance = weeklyRaw.map((item) => {
    const height =
      maxWeeklyRevenue > 0
        ? Math.max(18, Math.round((toFiniteNumber(item.value, 0) / maxWeeklyRevenue) * 92))
        : 18;

    return {
      ...item,
      height,
    };
  });

  const totalCategoryProducts = categoryRows.reduce(
    (sum, row) => sum + toFiniteNumber(row.total, 0),
    0,
  );

  const categoryDistribution = categoryRows.map((row) => {
    const count = toFiniteNumber(row.total, 0);
    const percent =
      totalCategoryProducts > 0
        ? Math.round((count / totalCategoryProducts) * 100)
        : 0;

    return {
      name: normalizeText(row.name, 120) || "Collection",
      count,
      percent,
    };
  });

  const recentOrders = recentOrdersRows.map((row) => {
    const statusKey = normalizeText(row.status, 40).toLowerCase();
    const statusMeta = ORDER_STATUS_META[statusKey] || {
      label: "A verifier",
      tone: "warn",
    };
    const placedAtDate = row.placed_at ? new Date(row.placed_at) : null;
    const placedAtIso =
      placedAtDate && !Number.isNaN(placedAtDate.getTime())
        ? placedAtDate.toISOString()
        : "";

    return {
      id: normalizeText(row.order_number, 40) || "-",
      client: resolveCustomerLabel(row),
      amount: formatMoney(row.grand_total, 2),
      status: statusMeta.label,
      tone: statusMeta.tone,
      placedAt: placedAtIso,
    };
  });

  return {
    generatedAt: now.toISOString(),
    generatedLabel: updatedAtFormatter.format(now),
    stats,
    weeklyPerformance,
    categoryDistribution,
    recentOrders,
  };
};

const dashboardModel = {
  getRealtimeDashboardSnapshot,
  buildFallbackDashboardSnapshot,
};

export default dashboardModel;
