import mysql from "mysql2/promise";
import config from "../../config/config.js";

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
});
const LOW_STOCK_THRESHOLD = Number(process.env.ADMIN_LOW_STOCK_THRESHOLD) || 5;

const getCategoryBySlug = async (slug) => {
  const [rows] = await pool.query(
    `
      SELECT id, name, slug
      FROM categories
      WHERE slug = ?
      LIMIT 1
    `,
    [slug],
  );

  return rows[0] ?? null;
};

const listAdminCategories = async ({ includeInactive = true } = {}) => {
  const whereClause = includeInactive ? "" : "WHERE is_active = 1";

  const [rows] = await pool.query(
    `
      SELECT id, name, slug, is_active, sort_order
      FROM categories
      ${whereClause}
      ORDER BY is_active DESC, sort_order ASC, name ASC
    `,
  );

  return rows;
};

const hasProductSku = async (sku) => {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM products
      WHERE sku = ?
      LIMIT 1
    `,
    [sku],
  );

  return rows.length > 0;
};

const hasProductSlug = async (slug) => {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM products
      WHERE slug = ?
      LIMIT 1
    `,
    [slug],
  );

  return rows.length > 0;
};

const hasProductSkuForOtherProduct = async ({ sku, productId }) => {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM products
      WHERE sku = ?
        AND id <> ?
      LIMIT 1
    `,
    [sku, productId],
  );

  return rows.length > 0;
};

const createProductWithAssets = async ({ product, variants, images }) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [productInsertResult] = await connection.query(
      `
        INSERT INTO products (
          category_id,
          name,
          slug,
          sku,
          description,
          status,
          visibility,
          base_price,
          currency,
          published_at
        )
        VALUES (?, ?, ?, ?, ?, 'active', 'public', ?, 'EUR', UTC_TIMESTAMP())
      `,
      [
        product.categoryId,
        product.name,
        product.slug,
        product.sku,
        product.description,
        product.price,
      ],
    );

    const productId = productInsertResult.insertId;

    for (const variant of variants) {
      await connection.query(
        `
          INSERT INTO product_variants (
            product_id,
            sku,
            size_label,
            color_label,
            price,
            stock_qty,
            is_default,
            is_active
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `,
        [
          productId,
          variant.sku,
          variant.sizeLabel,
          variant.colorLabel,
          variant.price,
          variant.stockQty,
          variant.isDefault,
        ],
      );
    }

    for (const image of images) {
      await connection.query(
        `
          INSERT INTO product_images (
            product_id,
            image_url,
            alt_text,
            is_primary,
            sort_order
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          productId,
          image.imageUrl,
          image.altText,
          image.isPrimary,
          image.sortOrder,
        ],
      );
    }

    await connection.commit();
    return productId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const normalizeAdminProductSearch = (value) => {
  return String(value ?? "")
    .trim()
    .slice(0, 120);
};

const normalizeAdminProductStockFilter = (value) => {
  const candidate = String(value ?? "")
    .trim()
    .toLowerCase();

  if (candidate === "active" || candidate === "low" || candidate === "out") {
    return candidate;
  }

  return "all";
};

const buildAdminProductWhere = ({ search, stockFilter }) => {
  const where = ["1 = 1"];
  const params = [];

  if (search) {
    const like = `%${search}%`;
    where.push(
      `
      (
        p.name LIKE ?
        OR p.sku LIKE ?
        OR p.slug LIKE ?
        OR COALESCE(c.name, '') LIKE ?
      )
      `,
    );
    params.push(like, like, like, like);
  }

  if (stockFilter === "active") {
    where.push("p.status = 'active'");
    where.push("COALESCE(v.stock_total, 0) > ?");
    params.push(LOW_STOCK_THRESHOLD);
  } else if (stockFilter === "low") {
    where.push("COALESCE(v.stock_total, 0) > 0");
    where.push("COALESCE(v.stock_total, 0) <= ?");
    params.push(LOW_STOCK_THRESHOLD);
  } else if (stockFilter === "out") {
    where.push("COALESCE(v.stock_total, 0) = 0");
  }

  return { where, params };
};

const listAdminProducts = async ({
  search = "",
  stock = "all",
  limit = 180,
} = {}) => {
  const normalizedSearch = normalizeAdminProductSearch(search);
  const normalizedStock = normalizeAdminProductStockFilter(stock);
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 180;
  const whereData = buildAdminProductWhere({
    search: normalizedSearch,
    stockFilter: normalizedStock,
  });

  const [rows] = await pool.query(
    `
      SELECT
        p.id,
        p.name,
        p.slug,
        p.sku,
        p.status AS product_status,
        p.base_price,
        p.compare_at_price,
        p.updated_at,
        COALESCE(c.name, 'Collection') AS category_name,
        COALESCE(v.stock_total, 0) AS stock_total,
        COALESCE(v.price_min, p.base_price) AS display_price,
        pi.image_url
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
      WHERE ${whereData.where.join("\n        AND ")}
      ORDER BY p.updated_at DESC, p.id DESC
      LIMIT ?
    `,
    [...whereData.params, safeLimit],
  );

  return rows;
};

const getAdminProductSummary = async () => {
  const [rows] = await pool.query(
    `
      SELECT
        COUNT(*) AS total_products,
        SUM(
          CASE
            WHEN p.status = 'active' AND COALESCE(v.stock_total, 0) > ?
              THEN 1
            ELSE 0
          END
        ) AS active_products,
        SUM(
          CASE
            WHEN COALESCE(v.stock_total, 0) > 0
              AND COALESCE(v.stock_total, 0) <= ?
              THEN 1
            ELSE 0
          END
        ) AS low_stock_products,
        SUM(
          CASE
            WHEN COALESCE(v.stock_total, 0) = 0
              THEN 1
            ELSE 0
          END
        ) AS out_of_stock_products
      FROM products p
      LEFT JOIN (
        SELECT
          product_id,
          SUM(stock_qty) AS stock_total
        FROM product_variants
        WHERE is_active = 1
        GROUP BY product_id
      ) v ON v.product_id = p.id
    `,
    [LOW_STOCK_THRESHOLD, LOW_STOCK_THRESHOLD],
  );

  return rows[0] ?? {
    total_products: 0,
    active_products: 0,
    low_stock_products: 0,
    out_of_stock_products: 0,
  };
};

const getAdminProductById = async (productId) => {
  const [rows] = await pool.query(
    `
      SELECT
        p.id,
        p.name,
        p.slug,
        p.sku,
        p.description,
        p.status,
        p.visibility,
        p.base_price,
        p.compare_at_price,
        p.category_id,
        p.updated_at,
        COALESCE(c.name, '') AS category_name,
        COALESCE(c.slug, '') AS category_slug,
        COALESCE(v.stock_total, 0) AS stock_total
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN (
        SELECT
          product_id,
          SUM(stock_qty) AS stock_total
        FROM product_variants
        WHERE is_active = 1
        GROUP BY product_id
      ) v ON v.product_id = p.id
      WHERE p.id = ?
      LIMIT 1
    `,
    [productId],
  );

  return rows[0] ?? null;
};

const setProductVariantsStockTotal = async (connection, productId, totalStock) => {
  const safeStock = Math.max(0, Math.floor(Number(totalStock) || 0));

  const [variantRows] = await connection.query(
    `
      SELECT id
      FROM product_variants
      WHERE product_id = ?
        AND is_active = 1
      ORDER BY is_default DESC, id ASC
    `,
    [productId],
  );

  if (!variantRows.length) {
    await connection.query(
      `
        INSERT INTO product_variants (
          product_id,
          sku,
          size_label,
          color_label,
          price,
          stock_qty,
          is_default,
          is_active
        )
        SELECT
          p.id,
          p.sku,
          '',
          '',
          p.base_price,
          ?,
          1,
          1
        FROM products p
        WHERE p.id = ?
        LIMIT 1
      `,
      [safeStock, productId],
    );
    return;
  }

  const perVariant = Math.floor(safeStock / variantRows.length);
  const remainder = safeStock % variantRows.length;

  for (let index = 0; index < variantRows.length; index += 1) {
    const variantId = Number(variantRows[index].id);
    const nextStock = perVariant + (index === 0 ? remainder : 0);

    await connection.query(
      `
        UPDATE product_variants
        SET
          stock_qty = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        LIMIT 1
      `,
      [nextStock, variantId],
    );
  }
};

const updateAdminProductById = async ({
  productId,
  categoryId,
  name,
  sku,
  description,
  status,
  visibility,
  basePrice,
  stockTotal,
} = {}) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [targetRows] = await connection.query(
      `
        SELECT id
        FROM products
        WHERE id = ?
        LIMIT 1
      `,
      [productId],
    );
    if (!targetRows.length) {
      await connection.rollback();
      return { updated: false };
    }

    await connection.query(
      `
        UPDATE products
        SET
          category_id = ?,
          name = ?,
          sku = ?,
          description = ?,
          status = ?,
          visibility = ?,
          base_price = ?,
          published_at = CASE
            WHEN ? = 'active' THEN COALESCE(published_at, UTC_TIMESTAMP())
            ELSE published_at
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        LIMIT 1
      `,
      [
        categoryId,
        name,
        sku,
        description,
        status,
        visibility,
        basePrice,
        status,
        productId,
      ],
    );

    await connection.query(
      `
        UPDATE product_variants
        SET
          price = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE product_id = ?
          AND is_active = 1
      `,
      [basePrice, productId],
    );

    if (Number.isInteger(stockTotal) && stockTotal >= 0) {
      await setProductVariantsStockTotal(connection, productId, stockTotal);
    }

    await connection.commit();
    return { updated: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const deleteAdminProductById = async (productId) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [productRows] = await connection.query(
      `
        SELECT id, name
        FROM products
        WHERE id = ?
        LIMIT 1
      `,
      [productId],
    );
    if (!productRows.length) {
      await connection.rollback();
      return {
        deleted: false,
        name: "",
        imageUrls: [],
      };
    }

    const [imageRows] = await connection.query(
      `
        SELECT image_url
        FROM product_images
        WHERE product_id = ?
      `,
      [productId],
    );

    const [deleteResult] = await connection.query(
      `
        DELETE FROM products
        WHERE id = ?
        LIMIT 1
      `,
      [productId],
    );

    if (Number(deleteResult.affectedRows) !== 1) {
      await connection.rollback();
      return {
        deleted: false,
        name: "",
        imageUrls: [],
      };
    }

    await connection.commit();
    return {
      deleted: true,
      name: String(productRows[0].name || ""),
      imageUrls: imageRows
        .map((row) => String(row.image_url || "").trim())
        .filter(Boolean),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const productModel = {
  getCategoryBySlug,
  listAdminCategories,
  hasProductSku,
  hasProductSlug,
  hasProductSkuForOtherProduct,
  createProductWithAssets,
  normalizeAdminProductSearch,
  normalizeAdminProductStockFilter,
  listAdminProducts,
  getAdminProductSummary,
  getAdminProductById,
  updateAdminProductById,
  deleteAdminProductById,
  LOW_STOCK_THRESHOLD,
};

export default productModel;
