import mysql from "mysql2/promise";
import config from "../../config/config.js";

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
});

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

const productModel = {
  getCategoryBySlug,
  hasProductSku,
  hasProductSlug,
  createProductWithAssets,
};

export default productModel;
