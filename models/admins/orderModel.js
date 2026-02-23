import mysql from "mysql2/promise";
import config from "../../config/config.js";

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
});

const ORDER_STATUS_FILTER_VALUES = new Set([
  "all",
  "review",
  "processing",
  "shipped",
]);
const ORDER_STATUS_VALUES = new Set([
  "pending",
  "confirmed",
  "processing",
  "ready_to_ship",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);

const normalizeAdminOrderSearch = (value) => {
  return String(value ?? "")
    .trim()
    .slice(0, 120);
};

const normalizeAdminOrderStatusFilter = (value) => {
  const candidate = String(value ?? "")
    .trim()
    .toLowerCase();

  return ORDER_STATUS_FILTER_VALUES.has(candidate) ? candidate : "all";
};

const normalizeAdminOrderStatusValue = (value) => {
  const candidate = String(value ?? "")
    .trim()
    .toLowerCase();

  return ORDER_STATUS_VALUES.has(candidate) ? candidate : "";
};

const buildAdminOrderWhere = ({ search, statusFilter }) => {
  const where = ["1 = 1"];
  const params = [];

  if (search) {
    const like = `%${search}%`;
    where.push(
      `
      (
        o.order_number LIKE ?
        OR o.customer_email LIKE ?
        OR COALESCE(u.email, '') LIKE ?
        OR COALESCE(u.phone, '') LIKE ?
        OR COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
          ''
        ) LIKE ?
      )
      `,
    );
    params.push(like, like, like, like, like);
  }

  if (statusFilter === "review") {
    where.push("(o.status IN ('pending', 'confirmed') OR o.payment_status = 'failed')");
  } else if (statusFilter === "processing") {
    where.push("o.status IN ('processing', 'ready_to_ship')");
  } else if (statusFilter === "shipped") {
    where.push("o.status IN ('shipped', 'delivered')");
  }

  return { where, params };
};

const listAdminOrders = async ({
  search = "",
  status = "all",
  limit = 180,
} = {}) => {
  const normalizedSearch = normalizeAdminOrderSearch(search);
  const normalizedStatus = normalizeAdminOrderStatusFilter(status);
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 180;
  const whereData = buildAdminOrderWhere({
    search: normalizedSearch,
    statusFilter: normalizedStatus,
  });

  const [rows] = await pool.query(
    `
      SELECT
        o.id,
        o.order_number,
        o.status,
        o.payment_status,
        o.payment_method,
        o.currency,
        o.grand_total,
        o.customer_email,
        o.placed_at,
        o.updated_at,
        NULLIF(
          TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))),
          ''
        ) AS customer_name
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE ${whereData.where.join("\n        AND ")}
      ORDER BY o.placed_at DESC, o.id DESC
      LIMIT ?
    `,
    [...whereData.params, safeLimit],
  );

  return rows;
};

const getAdminOrdersSummary = async () => {
  const [rows] = await pool.query(
    `
      SELECT
        COUNT(*) AS total_orders,
        SUM(
          CASE
            WHEN o.status IN ('pending', 'confirmed')
              OR o.payment_status = 'failed'
              THEN 1
            ELSE 0
          END
        ) AS review_orders,
        SUM(
          CASE
            WHEN o.status IN ('processing', 'ready_to_ship')
              THEN 1
            ELSE 0
          END
        ) AS processing_orders,
        SUM(
          CASE
            WHEN o.status IN ('shipped', 'delivered')
              THEN 1
            ELSE 0
          END
        ) AS shipped_orders
      FROM orders o
    `,
  );

  return rows[0] ?? {
    total_orders: 0,
    review_orders: 0,
    processing_orders: 0,
    shipped_orders: 0,
  };
};

const getAdminOrderById = async (orderId) => {
  const [rows] = await pool.query(
    `
      SELECT
        o.id,
        o.order_number,
        o.status,
        o.payment_status,
        o.payment_method,
        o.currency,
        o.subtotal,
        o.discount_total,
        o.shipping_total,
        o.tax_total,
        o.grand_total,
        o.customer_email,
        o.customer_phone,
        o.note,
        o.placed_at,
        o.shipped_at,
        o.delivered_at,
        o.updated_at,
        o.user_id,
        u.uuid AS user_uuid,
        u.first_name AS user_first_name,
        u.last_name AS user_last_name,
        u.email AS user_email
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.id = ?
      LIMIT 1
    `,
    [orderId],
  );

  return rows[0] ?? null;
};

const listAdminOrderItems = async (orderId) => {
  const [rows] = await pool.query(
    `
      SELECT
        oi.id,
        oi.product_id,
        oi.product_variant_id,
        oi.product_name,
        oi.sku,
        oi.size_label,
        oi.color_label,
        oi.unit_price,
        oi.quantity,
        oi.line_total,
        p.slug AS product_slug
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
      ORDER BY oi.id ASC
    `,
    [orderId],
  );

  return rows;
};

const updateAdminOrderStatus = async ({ orderId, status }) => {
  const [result] = await pool.query(
    `
      UPDATE orders
      SET
        status = ?,
        shipped_at = CASE
          WHEN ? IN ('shipped', 'delivered') THEN COALESCE(shipped_at, UTC_TIMESTAMP())
          ELSE shipped_at
        END,
        delivered_at = CASE
          WHEN ? = 'delivered' THEN COALESCE(delivered_at, UTC_TIMESTAMP())
          ELSE delivered_at
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      LIMIT 1
    `,
    [status, status, status, orderId],
  );

  return Number(result?.affectedRows) === 1;
};

const orderModel = {
  normalizeAdminOrderSearch,
  normalizeAdminOrderStatusFilter,
  normalizeAdminOrderStatusValue,
  listAdminOrders,
  getAdminOrdersSummary,
  getAdminOrderById,
  listAdminOrderItems,
  updateAdminOrderStatus,
};

export default orderModel;
