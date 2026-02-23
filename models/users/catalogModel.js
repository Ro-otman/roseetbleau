import mysql from "mysql2/promise";
import config from "../../config/config.js";

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
});

const RETRYABLE_DB_ERROR_CODES = new Set([
  "ECONNRESET",
  "PROTOCOL_CONNECTION_LOST",
  "ETIMEDOUT",
  "EPIPE",
  "ECONNREFUSED",
]);

const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableDbError = (error) => {
  const code = String(error?.code ?? "");
  if (RETRYABLE_DB_ERROR_CODES.has(code)) {
    return true;
  }

  const message = String(error?.message ?? "");
  return (
    message.includes("ECONNRESET") ||
    message.includes("PROTOCOL_CONNECTION_LOST")
  );
};

const queryWithRetry = async (
  sql,
  params = [],
  { retries = 2, delayMs = 120 } = {},
) => {
  let attempt = 0;

  while (true) {
    try {
      return await pool.query(sql, params);
    } catch (error) {
      if (!isRetryableDbError(error) || attempt >= retries) {
        throw error;
      }

      attempt += 1;
      await waitMs(delayMs * attempt);
    }
  }
};

const ORDER_BY_SQL = {
  popular: "p.created_at DESC, p.id DESC",
  new: "p.created_at DESC, p.id DESC",
  "price-low": "display_price ASC, p.created_at DESC, p.id DESC",
  "price-high": "display_price DESC, p.created_at DESC, p.id DESC",
};

const FAVORITES_ORDER_BY_SQL = {
  popular: "wi.added_at DESC, wi.id DESC",
  new: "wi.added_at DESC, wi.id DESC",
  "price-low": "display_price ASC, wi.added_at DESC, wi.id DESC",
  "price-high": "display_price DESC, wi.added_at DESC, wi.id DESC",
};

const normalizeSort = (sortValue) => {
  const candidate = String(sortValue ?? "").trim().toLowerCase();
  return ORDER_BY_SQL[candidate] ? candidate : "popular";
};

const normalizeFavoritesSort = (sortValue) => {
  const candidate = String(sortValue ?? "").trim().toLowerCase();
  return FAVORITES_ORDER_BY_SQL[candidate] ? candidate : "new";
};

const listPublicProducts = async ({
  limit = null,
  offset = 0,
  searchTerm = "",
  categorySlug = "",
  promoOnly = false,
  sizeFilter = "",
  priceMin = null,
  priceMax = null,
  sort = "popular",
} = {}) => {
  const where = ["p.status = 'active'", "p.visibility = 'public'"];
  const params = [];
  const normalizedSearchTerm = String(searchTerm ?? "").trim().slice(0, 120);

  if (normalizedSearchTerm) {
    const searchValue = `%${normalizedSearchTerm}%`;
    where.push(
      `
      (
        p.name LIKE ?
        OR p.slug LIKE ?
        OR p.sku LIKE ?
        OR COALESCE(p.short_description, '') LIKE ?
        OR COALESCE(c.name, '') LIKE ?
      )
      `,
    );
    params.push(searchValue, searchValue, searchValue, searchValue, searchValue);
  }

  if (categorySlug) {
    where.push("c.slug = ?");
    params.push(categorySlug);
  }

  if (promoOnly) {
    where.push(
      "p.compare_at_price IS NOT NULL AND p.compare_at_price > COALESCE(v.price_min, p.base_price)",
    );
  }

  if (sizeFilter) {
    where.push(
      `
      EXISTS (
        SELECT 1
        FROM product_variants pvf
        WHERE pvf.product_id = p.id
          AND pvf.is_active = 1
          AND pvf.size_label LIKE ?
      )
      `,
    );
    params.push(`%${sizeFilter}%`);
  }

  if (Number.isFinite(priceMin)) {
    where.push("COALESCE(v.price_min, p.base_price) >= ?");
    params.push(priceMin);
  }

  if (Number.isFinite(priceMax)) {
    where.push("COALESCE(v.price_min, p.base_price) <= ?");
    params.push(priceMax);
  }

  const sortKey = normalizeSort(sort);
  const orderByClause = ORDER_BY_SQL[sortKey];

  let sql = `
    SELECT
      p.id,
      p.name,
      p.slug,
      p.sku,
      p.base_price,
      p.compare_at_price,
      p.created_at,
      p.age_min_months,
      p.age_max_months,
      COALESCE(c.name, 'Collection') AS category_name,
      COALESCE(c.slug, '') AS category_slug,
      COALESCE(v.price_min, p.base_price) AS display_price,
      COALESCE(v.stock_total, 0) AS stock_total,
      pi.image_url,
      rv.avg_rating
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN (
      SELECT
        product_id,
        MIN(price) AS price_min,
        SUM(stock_qty) AS stock_total
      FROM product_variants
      WHERE is_active = 1
      GROUP BY product_id
    ) v ON v.product_id = p.id
    LEFT JOIN product_images pi ON pi.id = (
      SELECT pi2.id
      FROM product_images pi2
      WHERE pi2.product_id = p.id
      ORDER BY pi2.is_primary DESC, pi2.sort_order ASC, pi2.id ASC
      LIMIT 1
    )
    LEFT JOIN (
      SELECT
        product_id,
        ROUND(AVG(rating), 1) AS avg_rating
      FROM product_reviews
      WHERE status = 'approved'
      GROUP BY product_id
    ) rv ON rv.product_id = p.id
    WHERE ${where.join("\n      AND ")}
    ORDER BY ${orderByClause}
  `;

  if (Number.isInteger(limit) && limit > 0) {
    sql += "\n    LIMIT ?";
    params.push(limit);

    if (Number.isInteger(offset) && offset > 0) {
      sql += " OFFSET ?";
      params.push(offset);
    }
  }

  const [rows] = await queryWithRetry(sql, params);
  return rows;
};

const getUserIdByUuid = async (userUuid) => {
  const [rows] = await pool.query(
    `
      SELECT id
      FROM users
      WHERE uuid = ?
      LIMIT 1
    `,
    [userUuid],
  );

  const user = rows[0] ?? null;
  return user ? Number(user.id) : null;
};

const getActiveCartByUserId = async (userId) => {
  const [rows] = await pool.query(
    `
      SELECT id, user_id, session_token
      FROM carts
      WHERE user_id = ?
        AND status = 'active'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [userId],
  );

  return rows[0] ?? null;
};

const getActiveCartBySessionToken = async (sessionToken) => {
  const [rows] = await pool.query(
    `
      SELECT id, user_id, session_token
      FROM carts
      WHERE session_token = ?
        AND status = 'active'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [sessionToken],
  );

  return rows[0] ?? null;
};

const createActiveCart = async ({ userId = null, sessionToken = null } = {}) => {
  const [insertResult] = await pool.query(
    `
      INSERT INTO carts (user_id, session_token, status, currency, expires_at)
      VALUES (?, ?, 'active', 'EUR', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))
    `,
    [userId, sessionToken],
  );

  return Number(insertResult.insertId);
};

const touchCart = async (cartId) => {
  await pool.query(
    `
      UPDATE carts
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      LIMIT 1
    `,
    [cartId],
  );
};

const mergeCartItems = async ({ sourceCartId, targetCartId }) => {
  if (!sourceCartId || !targetCartId || Number(sourceCartId) === Number(targetCartId)) {
    return;
  }

  await pool.query(
    `
      UPDATE cart_items AS target
      INNER JOIN cart_items AS source
        ON source.cart_id = ?
       AND target.cart_id = ?
       AND source.product_variant_id = target.product_variant_id
      SET
        target.quantity = target.quantity + source.quantity,
        target.unit_price = source.unit_price,
        target.updated_at = CURRENT_TIMESTAMP
    `,
    [sourceCartId, targetCartId],
  );

  await pool.query(
    `
      INSERT INTO cart_items (cart_id, product_variant_id, quantity, unit_price)
      SELECT
        ? AS cart_id,
        source.product_variant_id,
        source.quantity,
        source.unit_price
      FROM cart_items AS source
      LEFT JOIN cart_items AS target
        ON target.cart_id = ?
       AND target.product_variant_id = source.product_variant_id
      WHERE source.cart_id = ?
        AND target.id IS NULL
    `,
    [targetCartId, targetCartId, sourceCartId],
  );

  await pool.query(
    `
      DELETE FROM cart_items
      WHERE cart_id = ?
    `,
    [sourceCartId],
  );
};

const normalizeSessionToken = (sessionToken) => {
  return String(sessionToken ?? "").trim().slice(0, 120);
};

const ensureActiveCartId = async ({
  userUuid = "",
  sessionToken = "",
  createIfMissing = true,
} = {}) => {
  const normalizedSessionToken = normalizeSessionToken(sessionToken);
  const userId = userUuid ? await getUserIdByUuid(userUuid) : null;

  let userCart = userId ? await getActiveCartByUserId(userId) : null;
  let guestCart = normalizedSessionToken
    ? await getActiveCartBySessionToken(normalizedSessionToken)
    : null;

  if (userId) {
    if (
      userCart &&
      guestCart &&
      Number(userCart.id) !== Number(guestCart.id) &&
      !guestCart.user_id
    ) {
      await mergeCartItems({
        sourceCartId: Number(guestCart.id),
        targetCartId: Number(userCart.id),
      });

      await pool.query(
        `
          UPDATE carts
          SET status = 'abandoned',
              session_token = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
          LIMIT 1
        `,
        [guestCart.id],
      );

      guestCart = null;
      await touchCart(Number(userCart.id));
    }

    if (!userCart && guestCart && !guestCart.user_id) {
      await pool.query(
        `
          UPDATE carts
          SET user_id = ?,
              session_token = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
          LIMIT 1
        `,
        [userId, guestCart.id],
      );

      userCart = {
        id: Number(guestCart.id),
        user_id: Number(userId),
        session_token: null,
      };
      guestCart = null;
    }

    if (!userCart && createIfMissing) {
      const createdCartId = await createActiveCart({ userId: Number(userId) });
      userCart = {
        id: createdCartId,
        user_id: Number(userId),
        session_token: null,
      };
    }

    return {
      cartId: userCart ? Number(userCart.id) : null,
      userId: Number(userId),
    };
  }

  if (guestCart) {
    return {
      cartId: Number(guestCart.id),
      userId: null,
    };
  }

  if (!createIfMissing || !normalizedSessionToken) {
    return {
      cartId: null,
      userId: null,
    };
  }

  const createdCartId = await createActiveCart({ sessionToken: normalizedSessionToken });
  return {
    cartId: createdCartId,
    userId: null,
  };
};

const getCartCountByCartId = async (cartId) => {
  const [rows] = await pool.query(
    `
      SELECT COALESCE(SUM(quantity), 0) AS total_items
      FROM cart_items
      WHERE cart_id = ?
    `,
    [cartId],
  );

  return Number(rows[0]?.total_items) || 0;
};

const getPublicVariantByProductSlug = async ({
  productSlug,
  sizeLabel = "",
  colorLabel = "",
} = {}) => {
  const [rows] = await pool.query(
    `
      SELECT
        p.id AS product_id,
        p.slug AS product_slug,
        pv.id AS variant_id,
        pv.sku AS variant_sku,
        pv.price AS variant_price,
        pv.stock_qty,
        COALESCE(pv.size_label, '') AS size_label,
        COALESCE(pv.color_label, '') AS color_label
      FROM products p
      INNER JOIN product_variants pv ON pv.product_id = p.id
      WHERE p.slug = ?
        AND p.status = 'active'
        AND p.visibility = 'public'
        AND pv.is_active = 1
      ORDER BY
        CASE
          WHEN ? <> '' AND LOWER(COALESCE(pv.size_label, '')) = LOWER(?) THEN 0
          ELSE 1
        END,
        CASE
          WHEN ? <> '' AND LOWER(COALESCE(pv.color_label, '')) = LOWER(?) THEN 0
          ELSE 1
        END,
        pv.is_default DESC,
        pv.stock_qty DESC,
        pv.id ASC
      LIMIT 1
    `,
    [productSlug, sizeLabel, sizeLabel, colorLabel, colorLabel],
  );

  return rows[0] ?? null;
};

const listCartRowsByContext = async ({ userUuid = "", sessionToken = "" } = {}) => {
  const { cartId } = await ensureActiveCartId({
    userUuid,
    sessionToken,
    createIfMissing: false,
  });

  if (!cartId) {
    return [];
  }

  const [rows] = await pool.query(
    `
      SELECT
        ci.id AS cart_item_id,
        ci.cart_id,
        ci.quantity,
        ci.unit_price,
        pv.id AS variant_id,
        pv.sku AS variant_sku,
        COALESCE(pv.size_label, '') AS size_label,
        COALESCE(pv.color_label, '') AS color_label,
        COALESCE(pv.stock_qty, 0) AS stock_qty,
        p.id AS product_id,
        p.slug AS product_slug,
        p.name AS product_name,
        p.sku AS product_sku,
        p.created_at AS product_created_at,
        COALESCE(c.name, 'Collection') AS category_name,
        COALESCE(c.slug, '') AS category_slug,
        COALESCE(pv.compare_at_price, p.compare_at_price) AS compare_at_price,
        pi.image_url
      FROM cart_items ci
      INNER JOIN product_variants pv ON pv.id = ci.product_variant_id
      INNER JOIN products p ON p.id = pv.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_images pi ON pi.id = (
        SELECT pi2.id
        FROM product_images pi2
        WHERE pi2.product_id = p.id
        ORDER BY pi2.is_primary DESC, pi2.sort_order ASC, pi2.id ASC
        LIMIT 1
      )
      WHERE ci.cart_id = ?
      ORDER BY ci.created_at DESC, ci.id DESC
    `,
    [cartId],
  );

  return rows;
};

const getCartCountByContext = async ({ userUuid = "", sessionToken = "" } = {}) => {
  const { cartId } = await ensureActiveCartId({
    userUuid,
    sessionToken,
    createIfMissing: false,
  });

  if (!cartId) {
    return 0;
  }

  return getCartCountByCartId(cartId);
};

const addProductToCartByContext = async ({
  userUuid = "",
  sessionToken = "",
  productSlug = "",
  quantity = 1,
  sizeLabel = "",
  colorLabel = "",
} = {}) => {
  const requestedSlug = String(productSlug ?? "").trim();
  const requestedQty = Number.parseInt(quantity, 10);

  if (!requestedSlug) {
    return { ok: false, reason: "product_not_found" };
  }

  if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
    return { ok: false, reason: "invalid_quantity" };
  }

  const variant = await getPublicVariantByProductSlug({
    productSlug: requestedSlug,
    sizeLabel: String(sizeLabel ?? "").trim().slice(0, 40),
    colorLabel: String(colorLabel ?? "").trim().slice(0, 60),
  });
  if (!variant) {
    return { ok: false, reason: "product_not_found" };
  }

  const stockQty = Number(variant.stock_qty);
  if (Number.isFinite(stockQty) && stockQty <= 0) {
    return { ok: false, reason: "out_of_stock" };
  }

  const { cartId } = await ensureActiveCartId({
    userUuid,
    sessionToken,
    createIfMissing: true,
  });

  if (!cartId) {
    return { ok: false, reason: "cart_not_found" };
  }

  const [existingRows] = await pool.query(
    `
      SELECT id, quantity
      FROM cart_items
      WHERE cart_id = ?
        AND product_variant_id = ?
      LIMIT 1
    `,
    [cartId, variant.variant_id],
  );

  const existingItem = existingRows[0] ?? null;
  const currentQty = existingItem ? Number(existingItem.quantity) || 0 : 0;
  const nextQty = currentQty + requestedQty;

  if (Number.isFinite(stockQty) && stockQty > 0 && nextQty > stockQty) {
    return {
      ok: false,
      reason: "stock_exceeded",
      available: stockQty,
      currentQty,
    };
  }

  if (existingItem) {
    await pool.query(
      `
        UPDATE cart_items
        SET quantity = ?,
            unit_price = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        LIMIT 1
      `,
      [nextQty, variant.variant_price, existingItem.id],
    );
  } else {
    await pool.query(
      `
        INSERT INTO cart_items (cart_id, product_variant_id, quantity, unit_price)
        VALUES (?, ?, ?, ?)
      `,
      [cartId, variant.variant_id, requestedQty, variant.variant_price],
    );
  }

  await touchCart(cartId);
  const cartCount = await getCartCountByCartId(cartId);

  return {
    ok: true,
    cartId,
    cartCount,
    productSlug: variant.product_slug,
    variantId: Number(variant.variant_id),
  };
};

const updateCartItemQuantityByContext = async ({
  userUuid = "",
  sessionToken = "",
  cartItemId,
  quantity,
} = {}) => {
  const requestedItemId = Number.parseInt(cartItemId, 10);
  const requestedQty = Number.parseInt(quantity, 10);

  if (!Number.isInteger(requestedItemId) || requestedItemId <= 0) {
    return { ok: false, reason: "invalid_item" };
  }

  if (!Number.isInteger(requestedQty)) {
    return { ok: false, reason: "invalid_quantity" };
  }

  const { cartId } = await ensureActiveCartId({
    userUuid,
    sessionToken,
    createIfMissing: false,
  });

  if (!cartId) {
    return { ok: false, reason: "cart_not_found" };
  }

  const [rows] = await pool.query(
    `
      SELECT
        ci.id,
        ci.quantity,
        COALESCE(pv.stock_qty, 0) AS stock_qty
      FROM cart_items ci
      INNER JOIN product_variants pv ON pv.id = ci.product_variant_id
      WHERE ci.id = ?
        AND ci.cart_id = ?
      LIMIT 1
    `,
    [requestedItemId, cartId],
  );

  const item = rows[0] ?? null;
  if (!item) {
    return { ok: false, reason: "item_not_found" };
  }

  if (requestedQty <= 0) {
    await pool.query(
      `
        DELETE FROM cart_items
        WHERE id = ?
        LIMIT 1
      `,
      [requestedItemId],
    );

    await touchCart(cartId);
    const cartCount = await getCartCountByCartId(cartId);
    return { ok: true, removed: true, cartCount };
  }

  const stockQty = Number(item.stock_qty);
  if (stockQty <= 0 && requestedQty > 0) {
    return { ok: false, reason: "out_of_stock", available: 0 };
  }

  if (Number.isFinite(stockQty) && stockQty > 0 && requestedQty > stockQty) {
    return { ok: false, reason: "stock_exceeded", available: stockQty };
  }

  await pool.query(
    `
      UPDATE cart_items
      SET quantity = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      LIMIT 1
    `,
    [requestedQty, requestedItemId],
  );

  await touchCart(cartId);
  const cartCount = await getCartCountByCartId(cartId);
  return { ok: true, removed: false, cartCount };
};

const removeCartItemByContext = async ({
  userUuid = "",
  sessionToken = "",
  cartItemId,
} = {}) => {
  const requestedItemId = Number.parseInt(cartItemId, 10);
  if (!Number.isInteger(requestedItemId) || requestedItemId <= 0) {
    return { ok: false, reason: "invalid_item" };
  }

  const { cartId } = await ensureActiveCartId({
    userUuid,
    sessionToken,
    createIfMissing: false,
  });

  if (!cartId) {
    return { ok: false, reason: "cart_not_found" };
  }

  const [result] = await pool.query(
    `
      DELETE FROM cart_items
      WHERE id = ?
        AND cart_id = ?
      LIMIT 1
    `,
    [requestedItemId, cartId],
  );

  if (Number(result.affectedRows) <= 0) {
    return { ok: false, reason: "item_not_found" };
  }

  await touchCart(cartId);
  const cartCount = await getCartCountByCartId(cartId);
  return { ok: true, cartCount };
};

const clearCartByContext = async ({ userUuid = "", sessionToken = "" } = {}) => {
  const { cartId } = await ensureActiveCartId({
    userUuid,
    sessionToken,
    createIfMissing: false,
  });

  if (!cartId) {
    return { ok: true, cartCount: 0 };
  }

  await pool.query(
    `
      DELETE FROM cart_items
      WHERE cart_id = ?
    `,
    [cartId],
  );

  await touchCart(cartId);
  return { ok: true, cartCount: 0 };
};

const getWishlistIdByUserId = async (userId) => {
  const [rows] = await pool.query(
    `
      SELECT id
      FROM wishlists
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId],
  );

  const wishlist = rows[0] ?? null;
  return wishlist ? Number(wishlist.id) : null;
};

const ensureWishlistIdByUserId = async (userId) => {
  const existingWishlistId = await getWishlistIdByUserId(userId);
  if (existingWishlistId) {
    return existingWishlistId;
  }

  try {
    const [insertResult] = await pool.query(
      `
        INSERT INTO wishlists (user_id)
        VALUES (?)
      `,
      [userId],
    );

    return Number(insertResult.insertId);
  } catch (error) {
    if (error?.code !== "ER_DUP_ENTRY") {
      throw error;
    }

    return getWishlistIdByUserId(userId);
  }
};

const getPublicProductBySlugBasic = async (slug) => {
  const [rows] = await pool.query(
    `
      SELECT id, slug
      FROM products
      WHERE slug = ?
        AND status = 'active'
        AND visibility = 'public'
      LIMIT 1
    `,
    [slug],
  );

  return rows[0] ?? null;
};

const listFavoriteProductIdsByUserUuid = async (userUuid) => {
  const userId = await getUserIdByUuid(userUuid);
  if (!userId) {
    return [];
  }

  const wishlistId = await getWishlistIdByUserId(userId);
  if (!wishlistId) {
    return [];
  }

  const [rows] = await pool.query(
    `
      SELECT product_id
      FROM wishlist_items
      WHERE wishlist_id = ?
    `,
    [wishlistId],
  );

  return rows;
};

const toggleFavoriteByUserUuid = async (userUuid, productSlug) => {
  const userId = await getUserIdByUuid(userUuid);
  if (!userId) {
    return { ok: false, reason: "user_not_found" };
  }

  const product = await getPublicProductBySlugBasic(productSlug);
  if (!product) {
    return { ok: false, reason: "product_not_found" };
  }

  const wishlistId = await ensureWishlistIdByUserId(userId);

  const [rows] = await pool.query(
    `
      SELECT id
      FROM wishlist_items
      WHERE wishlist_id = ?
        AND product_id = ?
      LIMIT 1
    `,
    [wishlistId, product.id],
  );

  const existingItem = rows[0] ?? null;
  if (existingItem) {
    await pool.query(
      `
        DELETE FROM wishlist_items
        WHERE id = ?
      `,
      [existingItem.id],
    );

    return {
      ok: true,
      isFavorite: false,
      productId: Number(product.id),
      slug: product.slug,
    };
  }

  await pool.query(
    `
      INSERT INTO wishlist_items (wishlist_id, product_id)
      VALUES (?, ?)
    `,
    [wishlistId, product.id],
  );

  return {
    ok: true,
    isFavorite: true,
    productId: Number(product.id),
    slug: product.slug,
  };
};

const listFavoriteProductsByUserUuid = async ({
  userUuid,
  categorySlug = "",
  promoOnly = false,
  sort = "new",
} = {}) => {
  const userId = await getUserIdByUuid(userUuid);
  if (!userId) {
    return [];
  }

  const wishlistId = await getWishlistIdByUserId(userId);
  if (!wishlistId) {
    return [];
  }

  const where = [
    "wi.wishlist_id = ?",
    "p.status = 'active'",
    "p.visibility = 'public'",
  ];
  const params = [wishlistId];

  if (categorySlug) {
    where.push("c.slug = ?");
    params.push(categorySlug);
  }

  if (promoOnly) {
    where.push(
      "p.compare_at_price IS NOT NULL AND p.compare_at_price > COALESCE(v.price_min, p.base_price)",
    );
  }

  const orderByClause = FAVORITES_ORDER_BY_SQL[normalizeFavoritesSort(sort)];

  const [rows] = await queryWithRetry(
    `
      SELECT
        p.id,
        p.name,
        p.slug,
        p.sku,
        p.base_price,
        p.compare_at_price,
        p.created_at,
        p.age_min_months,
        p.age_max_months,
        COALESCE(c.name, 'Collection') AS category_name,
        COALESCE(c.slug, '') AS category_slug,
        COALESCE(v.price_min, p.base_price) AS display_price,
        COALESCE(v.stock_total, 0) AS stock_total,
        pi.image_url,
        rv.avg_rating,
        wi.added_at AS favorited_at
      FROM wishlist_items wi
      INNER JOIN products p ON p.id = wi.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN (
        SELECT
          product_id,
          MIN(price) AS price_min,
          SUM(stock_qty) AS stock_total
        FROM product_variants
        WHERE is_active = 1
        GROUP BY product_id
      ) v ON v.product_id = p.id
      LEFT JOIN product_images pi ON pi.id = (
        SELECT pi2.id
        FROM product_images pi2
        WHERE pi2.product_id = p.id
        ORDER BY pi2.is_primary DESC, pi2.sort_order ASC, pi2.id ASC
        LIMIT 1
      )
      LEFT JOIN (
        SELECT
          product_id,
          ROUND(AVG(rating), 1) AS avg_rating
        FROM product_reviews
        WHERE status = 'approved'
        GROUP BY product_id
      ) rv ON rv.product_id = p.id
      WHERE ${where.join("\n        AND ")}
      ORDER BY ${orderByClause}
    `,
    params,
  );

  return rows;
};

const getPublicProductBySlug = async (slug) => {
  const [rows] = await queryWithRetry(
    `
      SELECT
        p.id,
        p.name,
        p.slug,
        p.sku,
        p.description,
        p.short_description,
        p.base_price,
        p.compare_at_price,
        p.created_at,
        p.age_min_months,
        p.age_max_months,
        COALESCE(c.name, 'Collection') AS category_name,
        COALESCE(c.slug, '') AS category_slug,
        COALESCE(v.price_min, p.base_price) AS display_price,
        COALESCE(v.stock_total, 0) AS stock_total,
        COALESCE(rv.avg_rating, 0) AS avg_rating,
        COALESCE(rv.review_count, 0) AS review_count
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN (
        SELECT
          product_id,
          MIN(price) AS price_min,
          SUM(stock_qty) AS stock_total
        FROM product_variants
        WHERE is_active = 1
        GROUP BY product_id
      ) v ON v.product_id = p.id
      LEFT JOIN (
        SELECT
          product_id,
          ROUND(AVG(rating), 1) AS avg_rating,
          COUNT(*) AS review_count
        FROM product_reviews
        WHERE status = 'approved'
        GROUP BY product_id
      ) rv ON rv.product_id = p.id
      WHERE p.status = 'active'
        AND p.visibility = 'public'
        AND p.slug = ?
      LIMIT 1
    `,
    [slug],
  );

  return rows[0] ?? null;
};

const getLatestPublicProduct = async () => {
  const [rows] = await queryWithRetry(
    `
      SELECT
        p.id,
        p.name,
        p.slug,
        p.sku,
        p.description,
        p.short_description,
        p.base_price,
        p.compare_at_price,
        p.created_at,
        p.age_min_months,
        p.age_max_months,
        COALESCE(c.name, 'Collection') AS category_name,
        COALESCE(c.slug, '') AS category_slug,
        COALESCE(v.price_min, p.base_price) AS display_price,
        COALESCE(v.stock_total, 0) AS stock_total,
        COALESCE(rv.avg_rating, 0) AS avg_rating,
        COALESCE(rv.review_count, 0) AS review_count
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN (
        SELECT
          product_id,
          MIN(price) AS price_min,
          SUM(stock_qty) AS stock_total
        FROM product_variants
        WHERE is_active = 1
        GROUP BY product_id
      ) v ON v.product_id = p.id
      LEFT JOIN (
        SELECT
          product_id,
          ROUND(AVG(rating), 1) AS avg_rating,
          COUNT(*) AS review_count
        FROM product_reviews
        WHERE status = 'approved'
        GROUP BY product_id
      ) rv ON rv.product_id = p.id
      WHERE p.status = 'active'
        AND p.visibility = 'public'
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT 1
    `,
  );

  return rows[0] ?? null;
};

const listPublicProductImages = async (productId) => {
  const [rows] = await queryWithRetry(
    `
      SELECT
        id,
        image_url,
        alt_text,
        is_primary,
        sort_order
      FROM product_images
      WHERE product_id = ?
      ORDER BY is_primary DESC, sort_order ASC, id ASC
    `,
    [productId],
  );

  return rows;
};

const listPublicProductVariants = async (productId) => {
  const [rows] = await queryWithRetry(
    `
      SELECT
        id,
        sku,
        size_label,
        color_label,
        price,
        compare_at_price,
        stock_qty,
        is_default
      FROM product_variants
      WHERE product_id = ?
        AND is_active = 1
      ORDER BY is_default DESC, stock_qty DESC, id ASC
    `,
    [productId],
  );

  return rows;
};

const listPublicProductReviews = async (productId, { limit = 6 } = {}) => {
  const safeLimit =
    Number.isInteger(limit) && limit > 0 && limit <= 50 ? limit : 6;

  const [rows] = await queryWithRetry(
    `
      SELECT
        id,
        rating,
        title,
        comment,
        created_at
      FROM product_reviews
      WHERE product_id = ?
        AND status = 'approved'
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `,
    [productId, safeLimit],
  );

  return rows;
};

const listPublicCategoryCounts = async () => {
  const [rows] = await pool.query(
    `
      SELECT
        COALESCE(c.name, 'Collection') AS name,
        COALESCE(c.slug, '') AS slug,
        COUNT(*) AS product_count
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'active'
        AND p.visibility = 'public'
      GROUP BY c.id, c.name, c.slug
      ORDER BY product_count DESC, name ASC
    `,
  );

  return rows;
};

const getShopSummary = async () => {
  const [rows] = await pool.query(
    `
      SELECT
        COUNT(*) AS total_products,
        COUNT(DISTINCT category_id) AS total_categories
      FROM products
      WHERE status = 'active'
        AND visibility = 'public'
    `,
  );

  return rows[0] ?? { total_products: 0, total_categories: 0 };
};

const catalogModel = {
  listPublicProducts,
  listFavoriteProductsByUserUuid,
  listFavoriteProductIdsByUserUuid,
  toggleFavoriteByUserUuid,
  listCartRowsByContext,
  getCartCountByContext,
  addProductToCartByContext,
  updateCartItemQuantityByContext,
  removeCartItemByContext,
  clearCartByContext,
  getPublicProductBySlug,
  getLatestPublicProduct,
  listPublicProductImages,
  listPublicProductVariants,
  listPublicProductReviews,
  listPublicCategoryCounts,
  getShopSummary,
};

export default catalogModel;
