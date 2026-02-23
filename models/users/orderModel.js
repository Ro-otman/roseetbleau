import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import config from "../../config/config.js";

const DEFAULT_SHIPPING_FLAT_AMOUNT = 4.9;
const DEFAULT_FREE_SHIPPING_THRESHOLD = 120;
const CHECKOUT_PAYMENT_METHODS = new Set([
  "card",
  "mobile_money",
  "bank_transfer",
  "cash_on_delivery",
]);

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
});

const normalizeText = (value, maxLength = 255) => {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
};

const normalizeCountryCode = (value) => {
  const normalized = normalizeText(value || "BJ", 2).toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : "BJ";
};

const normalizePaymentMethod = (value) => {
  const normalized = normalizeText(value, 40).toLowerCase();
  return CHECKOUT_PAYMENT_METHODS.has(normalized) ? normalized : "";
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositiveInteger = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const roundMoney = (value) => {
  return Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;
};

const normalizeCheckoutPayload = (payload = {}) => {
  return {
    fullName: normalizeText(payload.fullName, 160),
    email: normalizeText(payload.email, 190),
    phone: normalizeText(payload.phone, 30),
    line1: normalizeText(payload.line1, 220),
    line2: normalizeText(payload.line2, 220),
    city: normalizeText(payload.city, 120),
    stateRegion: normalizeText(payload.stateRegion, 120),
    postalCode: normalizeText(payload.postalCode, 40),
    countryCode: normalizeCountryCode(payload.countryCode),
    paymentMethod: normalizePaymentMethod(payload.paymentMethod),
    note: normalizeText(payload.note, 500),
  };
};

const toOrderNumberTimestamp = (date = new Date()) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

const buildOrderNumber = () => {
  const timestamp = toOrderNumberTimestamp();
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `RB-${timestamp}-${suffix}`;
};

const createServiceError = (reason, metadata = {}) => {
  const error = new Error(reason);
  error.reason = reason;
  error.metadata = metadata;
  return error;
};

const getUserIdByUuid = async (connection, userUuid) => {
  const normalizedUuid = normalizeText(userUuid, 36);
  if (!normalizedUuid) {
    return null;
  }

  const [rows] = await connection.query(
    `
      SELECT id
      FROM users
      WHERE uuid = ?
      LIMIT 1
    `,
    [normalizedUuid],
  );

  return rows[0] ? Number(rows[0].id) : null;
};

const getCartForUpdate = async (connection, cartId) => {
  const [rows] = await connection.query(
    `
      SELECT id, user_id, status
      FROM carts
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [cartId],
  );

  return rows[0] ?? null;
};

const listCartItemsForUpdate = async (connection, cartId) => {
  const [rows] = await connection.query(
    `
      SELECT
        ci.id AS cart_item_id,
        ci.product_variant_id,
        ci.quantity,
        ci.unit_price,
        pv.stock_qty,
        pv.sku AS variant_sku,
        COALESCE(pv.size_label, '') AS size_label,
        COALESCE(pv.color_label, '') AS color_label,
        COALESCE(pv.compare_at_price, p.compare_at_price, ci.unit_price) AS compare_at_price,
        p.id AS product_id,
        p.name AS product_name,
        p.sku AS product_sku,
        p.status AS product_status,
        p.visibility AS product_visibility
      FROM cart_items ci
      INNER JOIN product_variants pv ON pv.id = ci.product_variant_id
      INNER JOIN products p ON p.id = pv.product_id
      WHERE ci.cart_id = ?
      ORDER BY ci.id ASC
      FOR UPDATE
    `,
    [cartId],
  );

  return rows;
};

const computeOrderTotals = ({
  items,
  shippingFlatAmount = DEFAULT_SHIPPING_FLAT_AMOUNT,
  freeShippingThreshold = DEFAULT_FREE_SHIPPING_THRESHOLD,
}) => {
  const totals = (Array.isArray(items) ? items : []).reduce(
    (acc, item) => {
      const quantity = toPositiveInteger(item.quantity, 0);
      const unitPrice = toNumber(item.unit_price, 0);
      const compareAtPrice = toNumber(item.compare_at_price, unitPrice);
      const displayUnit = compareAtPrice > unitPrice ? compareAtPrice : unitPrice;

      acc.payableSubtotal += unitPrice * quantity;
      acc.displaySubtotal += displayUnit * quantity;
      return acc;
    },
    { payableSubtotal: 0, displaySubtotal: 0 },
  );

  const subtotal = roundMoney(totals.displaySubtotal);
  const payableSubtotal = roundMoney(totals.payableSubtotal);
  const discountTotal = roundMoney(
    Math.max(0, totals.displaySubtotal - totals.payableSubtotal),
  );
  const shippingTotal =
    payableSubtotal > 0 &&
    payableSubtotal < toNumber(freeShippingThreshold, DEFAULT_FREE_SHIPPING_THRESHOLD)
      ? roundMoney(toNumber(shippingFlatAmount, DEFAULT_SHIPPING_FLAT_AMOUNT))
      : 0;
  const taxTotal = 0;
  const grandTotal = roundMoney(payableSubtotal + shippingTotal + taxTotal);

  return {
    subtotal,
    payableSubtotal,
    discountTotal,
    shippingTotal,
    taxTotal,
    grandTotal,
  };
};

const insertOrderRow = async ({
  connection,
  userId,
  cartId,
  totals,
  checkout,
}) => {
  const maxAttempts = 6;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const orderNumber = buildOrderNumber();

    try {
      const [result] = await connection.query(
        `
          INSERT INTO orders (
            order_number,
            user_id,
            cart_id,
            status,
            payment_status,
            payment_method,
            currency,
            subtotal,
            discount_total,
            shipping_total,
            tax_total,
            grand_total,
            customer_email,
            customer_phone,
            note,
            placed_at
          )
          VALUES (?, ?, ?, 'pending', 'unpaid', ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
        `,
        [
          orderNumber,
          userId,
          cartId,
          checkout.paymentMethod,
          totals.subtotal,
          totals.discountTotal,
          totals.shippingTotal,
          totals.taxTotal,
          totals.grandTotal,
          checkout.email,
          checkout.phone || null,
          checkout.note || null,
        ],
      );

      return {
        id: Number(result.insertId),
        orderNumber,
      };
    } catch (error) {
      const isDuplicateOrderNumber =
        error?.code === "ER_DUP_ENTRY" &&
        String(error?.message || "").includes("uq_orders_number");

      if (!isDuplicateOrderNumber || attempt >= maxAttempts - 1) {
        throw error;
      }
    }
  }

  throw createServiceError("order_number_generation_failed");
};

const insertOrderAddresses = async ({ connection, orderId, checkout }) => {
  const addressValues = [
    checkout.fullName,
    checkout.phone || null,
    checkout.line1,
    checkout.line2 || null,
    checkout.city,
    checkout.stateRegion || null,
    checkout.postalCode || null,
    checkout.countryCode,
  ];

  await connection.query(
    `
      INSERT INTO order_addresses (
        order_id,
        address_type,
        full_name,
        phone,
        line1,
        line2,
        city,
        state_region,
        postal_code,
        country_code
      )
      VALUES (?, 'shipping', ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [orderId, ...addressValues],
  );

  await connection.query(
    `
      INSERT INTO order_addresses (
        order_id,
        address_type,
        full_name,
        phone,
        line1,
        line2,
        city,
        state_region,
        postal_code,
        country_code
      )
      VALUES (?, 'billing', ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [orderId, ...addressValues],
  );
};

const insertOrderItems = async ({ connection, orderId, items }) => {
  for (const item of items) {
    const quantity = toPositiveInteger(item.quantity, 0);
    const unitPrice = roundMoney(item.unit_price);
    const lineTotal = roundMoney(unitPrice * quantity);

    await connection.query(
      `
        INSERT INTO order_items (
          order_id,
          product_id,
          product_variant_id,
          product_name,
          sku,
          size_label,
          color_label,
          unit_price,
          quantity,
          line_total
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        orderId,
        item.product_id ? Number(item.product_id) : null,
        item.product_variant_id ? Number(item.product_variant_id) : null,
        normalizeText(item.product_name, 180) || "Produit",
        normalizeText(item.variant_sku || item.product_sku, 80) || "-",
        normalizeText(item.size_label, 40) || null,
        normalizeText(item.color_label, 60) || null,
        unitPrice,
        quantity,
        lineTotal,
      ],
    );
  }
};

const reduceVariantStock = async ({ connection, items, createdByUserId }) => {
  for (const item of items) {
    const quantity = toPositiveInteger(item.quantity, 0);
    const variantId = toPositiveInteger(item.product_variant_id, 0);
    if (!variantId || quantity <= 0) {
      throw createServiceError("invalid_variant");
    }

    const [updateResult] = await connection.query(
      `
        UPDATE product_variants
        SET stock_qty = stock_qty - ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND stock_qty >= ?
        LIMIT 1
      `,
      [quantity, variantId, quantity],
    );

    if (Number(updateResult?.affectedRows) !== 1) {
      throw createServiceError("stock_exceeded", {
        variantId,
      });
    }

    const [stockRows] = await connection.query(
      `
        SELECT stock_qty
        FROM product_variants
        WHERE id = ?
        LIMIT 1
      `,
      [variantId],
    );

    const quantityAfter = toPositiveInteger(stockRows[0]?.stock_qty, 0);
    await connection.query(
      `
        INSERT INTO inventory_movements (
          product_variant_id,
          movement_type,
          quantity_change,
          quantity_after,
          reason,
          created_by_user_id
        )
        VALUES (?, 'sale', ?, ?, ?, ?)
      `,
      [
        variantId,
        -quantity,
        quantityAfter,
        "Checkout client",
        createdByUserId || null,
      ],
    );
  }
};

const createOrderFromCart = async ({
  cartId,
  userUuid = "",
  checkout = {},
  shippingFlatAmount = DEFAULT_SHIPPING_FLAT_AMOUNT,
  freeShippingThreshold = DEFAULT_FREE_SHIPPING_THRESHOLD,
} = {}) => {
  const safeCartId = toPositiveInteger(cartId, 0);
  if (!safeCartId) {
    return { ok: false, reason: "cart_not_found" };
  }

  const normalizedCheckout = normalizeCheckoutPayload(checkout);
  if (!normalizedCheckout.paymentMethod) {
    return { ok: false, reason: "invalid_payment_method" };
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const userId = await getUserIdByUuid(connection, userUuid);
    const cart = await getCartForUpdate(connection, safeCartId);

    if (!cart || String(cart.status) !== "active") {
      throw createServiceError("cart_not_found");
    }

    if (userId && cart.user_id && Number(cart.user_id) !== Number(userId)) {
      throw createServiceError("cart_not_found");
    }

    if (userId && !cart.user_id) {
      await connection.query(
        `
          UPDATE carts
          SET user_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
          LIMIT 1
        `,
        [userId, safeCartId],
      );
    }

    const cartItems = await listCartItemsForUpdate(connection, safeCartId);
    if (!cartItems.length) {
      throw createServiceError("cart_empty");
    }

    for (const item of cartItems) {
      const productStatus = normalizeText(item.product_status, 40).toLowerCase();
      const productVisibility = normalizeText(item.product_visibility, 40).toLowerCase();
      const availableStock = toNumber(item.stock_qty, 0);
      const requestedQuantity = toPositiveInteger(item.quantity, 0);

      if (productStatus !== "active" || productVisibility !== "public") {
        throw createServiceError("product_unavailable");
      }

      if (requestedQuantity <= 0 || availableStock <= 0) {
        throw createServiceError("stock_exceeded", {
          variantId: Number(item.product_variant_id),
          available: Math.max(0, availableStock),
        });
      }

      if (requestedQuantity > availableStock) {
        throw createServiceError("stock_exceeded", {
          variantId: Number(item.product_variant_id),
          available: Math.max(0, availableStock),
          requested: requestedQuantity,
        });
      }
    }

    const totals = computeOrderTotals({
      items: cartItems,
      shippingFlatAmount,
      freeShippingThreshold,
    });

    const order = await insertOrderRow({
      connection,
      userId,
      cartId: safeCartId,
      totals,
      checkout: normalizedCheckout,
    });

    await insertOrderAddresses({
      connection,
      orderId: order.id,
      checkout: normalizedCheckout,
    });

    await insertOrderItems({
      connection,
      orderId: order.id,
      items: cartItems,
    });

    await reduceVariantStock({
      connection,
      items: cartItems,
      createdByUserId: userId,
    });

    await connection.query(
      `
        INSERT INTO order_status_history (
          order_id,
          old_status,
          new_status,
          comment,
          changed_by_user_id
        )
        VALUES (?, NULL, 'pending', ?, ?)
      `,
      [order.id, "Commande creee depuis checkout client.", userId || null],
    );

    await connection.query(
      `
        INSERT INTO payments (
          order_id,
          provider,
          provider_reference,
          method,
          status,
          amount,
          currency
        )
        VALUES (?, ?, ?, ?, 'pending', ?, 'EUR')
      `,
      [
        order.id,
        "roseetbleu",
        `${order.orderNumber}-PENDING`,
        normalizedCheckout.paymentMethod,
        totals.grandTotal,
      ],
    );

    await connection.query(
      `
        DELETE FROM cart_items
        WHERE cart_id = ?
      `,
      [safeCartId],
    );

    await connection.query(
      `
        UPDATE carts
        SET status = 'converted',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        LIMIT 1
      `,
      [safeCartId],
    );

    await connection.commit();

    return {
      ok: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      itemCount: cartItems.reduce(
        (acc, item) => acc + toPositiveInteger(item.quantity, 0),
        0,
      ),
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      shippingTotal: totals.shippingTotal,
      grandTotal: totals.grandTotal,
      currency: "EUR",
      paymentMethod: normalizedCheckout.paymentMethod,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_rollbackError) {
      // Ignore rollback error.
    }

    if (error?.reason) {
      return {
        ok: false,
        reason: error.reason,
        metadata: error.metadata || null,
      };
    }

    throw error;
  } finally {
    connection.release();
  }
};

const orderModel = {
  createOrderFromCart,
};

export default orderModel;
