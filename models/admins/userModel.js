import mysql from "mysql2/promise";
import config from "../../config/config.js";

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
});

const USER_STATUS_FILTER_VALUES = new Set(["all", "active", "watch", "blocked"]);
const USER_STATUS_VALUES = new Set(["active", "pending", "suspended", "blocked"]);
const SPENT_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "ready_to_ship",
  "shipped",
  "delivered",
];
const SPENT_ORDER_STATUS_PLACEHOLDERS = SPENT_ORDER_STATUSES.map(() => "?").join(", ");

const normalizeAdminUserSearch = (value) => {
  return String(value ?? "")
    .trim()
    .slice(0, 120);
};

const normalizeAdminUserStatusFilter = (value) => {
  const candidate = String(value ?? "")
    .trim()
    .toLowerCase();

  return USER_STATUS_FILTER_VALUES.has(candidate) ? candidate : "all";
};

const normalizeAdminUserStatusValue = (value) => {
  const candidate = String(value ?? "")
    .trim()
    .toLowerCase();

  return USER_STATUS_VALUES.has(candidate) ? candidate : "";
};

const buildAdminUserWhere = ({ search, statusFilter }) => {
  const where = ["u.role = 'customer'"];
  const params = [];

  if (search) {
    const like = `%${search}%`;
    where.push(
      `
      (
        u.first_name LIKE ?
        OR u.last_name LIKE ?
        OR CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) LIKE ?
        OR u.email LIKE ?
        OR COALESCE(u.phone, '') LIKE ?
      )
      `,
    );
    params.push(like, like, like, like, like);
  }

  if (statusFilter === "active") {
    where.push("u.status = 'active'");
  } else if (statusFilter === "watch") {
    where.push("u.status IN ('pending', 'suspended')");
  } else if (statusFilter === "blocked") {
    where.push("u.status = 'blocked'");
  }

  return { where, params };
};

const listAdminUsers = async ({
  search = "",
  status = "all",
  limit = 200,
} = {}) => {
  const normalizedSearch = normalizeAdminUserSearch(search);
  const normalizedStatus = normalizeAdminUserStatusFilter(status);
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 600) : 200;
  const whereData = buildAdminUserWhere({
    search: normalizedSearch,
    statusFilter: normalizedStatus,
  });

  const [rows] = await pool.query(
    `
      SELECT
        u.id,
        u.uuid,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.status,
        u.created_at,
        u.last_login_at,
        COALESCE(orders_agg.orders_count, 0) AS orders_count,
        COALESCE(orders_agg.spent_total, 0) AS spent_total
      FROM users u
      LEFT JOIN (
        SELECT
          o.user_id,
          COUNT(*) AS orders_count,
          SUM(
            CASE
              WHEN o.status IN (${SPENT_ORDER_STATUS_PLACEHOLDERS})
                THEN o.grand_total
              ELSE 0
            END
          ) AS spent_total
        FROM orders o
        WHERE o.user_id IS NOT NULL
        GROUP BY o.user_id
      ) orders_agg ON orders_agg.user_id = u.id
      WHERE ${whereData.where.join("\n        AND ")}
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT ?
    `,
    [...SPENT_ORDER_STATUSES, ...whereData.params, safeLimit],
  );

  return rows;
};

const getAdminUsersSummary = async () => {
  const [rows] = await pool.query(
    `
      SELECT
        COUNT(*) AS total_users,
        SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END) AS active_users,
        SUM(CASE WHEN u.status IN ('pending', 'suspended') THEN 1 ELSE 0 END) AS watch_users,
        SUM(CASE WHEN u.status = 'blocked' THEN 1 ELSE 0 END) AS blocked_users
      FROM users u
      WHERE u.role = 'customer'
    `,
  );

  return rows[0] ?? {
    total_users: 0,
    active_users: 0,
    watch_users: 0,
    blocked_users: 0,
  };
};

const getAdminUserById = async (userId) => {
  const [rows] = await pool.query(
    `
      SELECT
        u.id,
        u.uuid,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.status,
        u.email_verified_at,
        u.last_login_at,
        u.created_at,
        u.updated_at,
        COALESCE(orders_agg.orders_count, 0) AS orders_count,
        COALESCE(orders_agg.spent_total, 0) AS spent_total
      FROM users u
      LEFT JOIN (
        SELECT
          o.user_id,
          COUNT(*) AS orders_count,
          SUM(
            CASE
              WHEN o.status IN (${SPENT_ORDER_STATUS_PLACEHOLDERS})
                THEN o.grand_total
              ELSE 0
            END
          ) AS spent_total
        FROM orders o
        WHERE o.user_id IS NOT NULL
        GROUP BY o.user_id
      ) orders_agg ON orders_agg.user_id = u.id
      WHERE u.id = ?
        AND u.role = 'customer'
      LIMIT 1
    `,
    [...SPENT_ORDER_STATUSES, userId],
  );

  return rows[0] ?? null;
};

const listAdminUserRecentOrders = async (userId, limit = 8) => {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 8;

  const [rows] = await pool.query(
    `
      SELECT
        o.id,
        o.order_number,
        o.status,
        o.payment_status,
        o.payment_method,
        o.grand_total,
        o.currency,
        o.placed_at
      FROM orders o
      WHERE o.user_id = ?
      ORDER BY o.placed_at DESC, o.id DESC
      LIMIT ?
    `,
    [userId, safeLimit],
  );

  return rows;
};

const updateAdminUserStatus = async ({ userId, status }) => {
  const [result] = await pool.query(
    `
      UPDATE users
      SET
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND role = 'customer'
      LIMIT 1
    `,
    [status, userId],
  );

  return Number(result?.affectedRows) === 1;
};

const userModel = {
  normalizeAdminUserSearch,
  normalizeAdminUserStatusFilter,
  normalizeAdminUserStatusValue,
  listAdminUsers,
  getAdminUsersSummary,
  getAdminUserById,
  listAdminUserRecentOrders,
  updateAdminUserStatus,
};

export default userModel;
