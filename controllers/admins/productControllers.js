import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import sharp from "sharp";
import productModel from "../../models/admins/productModel.js";

const MAX_IMAGE_FILES = 6;
const MAX_IMAGE_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_VARIANTS = 24;
const PRODUCT_IMAGE_MAX_WIDTH = 1400;
const PRODUCT_IMAGE_MAX_HEIGHT = 1400;
const PRODUCT_IMAGE_WEBP_QUALITY = 78;

const ACCEPTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRODUCT_UPLOAD_DIR = path.resolve(__dirname, "../../public/uploads/products");
const PRODUCT_STATUSES = new Set(["draft", "active", "archived"]);
const PRODUCT_VISIBILITIES = new Set(["public", "private"]);
const DEFAULT_CATEGORY_OPTIONS = [
  { slug: "bebes", name: "Bebes" },
  { slug: "filles", name: "Filles" },
  { slug: "garcons", name: "Garcons" },
  { slug: "chaussures", name: "Chaussures" },
  { slug: "accessoires", name: "Accessoires" },
];

const buildAdminIdentity = (adminAuth) => {
  if (!adminAuth) {
    return null;
  }

  return {
    name: normalizeText(adminAuth.fullName || adminAuth.firstName, 180),
    email: normalizeText(adminAuth.email, 190),
  };
};

const renderAddProductPage = ({
  req = null,
  res,
  status = 200,
  feedback = null,
  formData = {},
  categoryOptions = DEFAULT_CATEGORY_OPTIONS,
}) => {
  return res.status(status).render("pages/admins/ajoutproduit", {
    layout: "layouts/admin",
    pageTitle: "Admin Ajout Produit | Rose&Bleu",
    pageStylesheet: "/css/pages/admin.css",
    currentAdminPath: "/admin/ajoutproduit",
    adminPageTitle: "Ajouter un produit",
    adminPageLead: "Cree une nouvelle fiche produit complete.",
    adminIdentity: buildAdminIdentity(req?.adminAuth),
    productFeedback: feedback,
    formData,
    categoryOptions,
  });
};

const renderEditProductPage = ({
  req = null,
  res,
  productId,
  status = 200,
  feedback = null,
  formData = {},
  categoryOptions = DEFAULT_CATEGORY_OPTIONS,
}) => {
  return res.status(status).render("pages/admins/editproduit", {
    layout: "layouts/admin",
    pageTitle: "Admin Modifier Produit | Rose&Bleu",
    pageStylesheet: "/css/pages/admin.css",
    currentAdminPath: "/admin/produits",
    adminPageTitle: "Modifier un produit",
    adminPageLead: "Mets a jour les informations produit rapidement.",
    adminIdentity: buildAdminIdentity(req?.adminAuth),
    productFeedback: feedback,
    formData,
    categoryOptions,
    productId: Number(productId),
  });
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

const normalizeText = (value, maxLength = 255) => {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
};

const normalizeSku = (value) => {
  return normalizeText(value, 80);
};

const normalizeDecimal = (value) => {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : Number.NaN;
};

const normalizeInteger = (value) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
};

const normalizeProductStatus = (value) => {
  const candidate = normalizeText(value, 20).toLowerCase();
  return PRODUCT_STATUSES.has(candidate) ? candidate : "active";
};

const normalizeProductVisibility = (value) => {
  const candidate = normalizeText(value, 20).toLowerCase();
  return PRODUCT_VISIBILITIES.has(candidate) ? candidate : "public";
};

const normalizeProductId = (value) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
};

const parseList = (value, maxItemLength = 60) => {
  const rawValues = String(value ?? "")
    .split(",")
    .map((item) => normalizeText(item, maxItemLength))
    .filter(Boolean);

  return [...new Set(rawValues)];
};

const slugify = (value) => {
  const baseSlug = normalizeText(value, 180)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return baseSlug || `produit-${Date.now()}`;
};

const appendSlugSuffix = (baseSlug, suffixNumber) => {
  const suffix = `-${suffixNumber}`;
  const trimmedBase = baseSlug.slice(0, 220 - suffix.length).replace(/-+$/g, "");
  return `${trimmedBase}${suffix}`;
};

const ensureUniqueSlug = async (baseSlug) => {
  let candidate = baseSlug.slice(0, 220);
  let counter = 1;

  while (await productModel.hasProductSlug(candidate)) {
    candidate = appendSlugSuffix(baseSlug, counter);
    counter += 1;
  }

  return candidate;
};

const toFormData = (body = {}) => {
  return {
    name: normalizeText(body.name, 180),
    sku: normalizeSku(body.sku),
    category: normalizeText(body.category, 140),
    price: normalizeText(body.price, 20),
    stock: normalizeText(body.stock, 20),
    sizes: normalizeText(body.sizes, 300),
    colors: normalizeText(body.colors, 300),
    description: normalizeText(body.description, 4000),
  };
};

const toEditFormData = (body = {}) => {
  return {
    name: normalizeText(body.name, 180),
    sku: normalizeSku(body.sku),
    category: normalizeText(body.category, 140),
    price: normalizeText(body.price, 20),
    stock: normalizeText(body.stock, 20),
    description: normalizeText(body.description, 4000),
    status: normalizeProductStatus(body.status),
    visibility: normalizeProductVisibility(body.visibility),
  };
};

const toEditFormDataFromProduct = (productRow = {}) => {
  const basePrice = Number(productRow.base_price);
  const stockTotal = Number(productRow.stock_total);

  return {
    name: normalizeText(productRow.name, 180),
    sku: normalizeSku(productRow.sku),
    category: normalizeText(productRow.category_slug, 140),
    price: Number.isFinite(basePrice) ? String(basePrice) : "",
    stock: Number.isFinite(stockTotal) ? String(Math.max(0, Math.floor(stockTotal))) : "0",
    description: normalizeText(productRow.description, 4000),
    status: normalizeProductStatus(productRow.status),
    visibility: normalizeProductVisibility(productRow.visibility),
  };
};

const toCategoryOptions = (rows = []) => {
  const mapped = rows
    .map((row) => ({
      slug: normalizeText(row.slug, 140),
      name: normalizeText(row.name, 120),
    }))
    .filter((row) => row.slug && row.name);

  if (mapped.length) {
    return mapped;
  }

  return DEFAULT_CATEGORY_OPTIONS;
};

const loadCategoryOptions = async () => {
  const rows = await productModel.listAdminCategories({
    includeInactive: true,
  });

  return toCategoryOptions(rows);
};

const buildVariants = ({ sku, price, stock, sizes, colors }) => {
  const sizeValues = sizes.length ? sizes : [""];
  const colorValues = colors.length ? colors : [""];

  const combinations = [];
  for (const sizeLabel of sizeValues) {
    for (const colorLabel of colorValues) {
      combinations.push({ sizeLabel, colorLabel });
    }
  }

  if (!combinations.length) {
    combinations.push({ sizeLabel: "", colorLabel: "" });
  }

  if (combinations.length > MAX_VARIANTS) {
    throw new Error(
      `Trop de variantes generees (${combinations.length}). Maximum autorise: ${MAX_VARIANTS}.`,
    );
  }

  const baseStock = Math.floor(stock / combinations.length);
  const stockRemainder = stock % combinations.length;

  return combinations.map((combination, index) => {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const baseLimit = index === 0 ? 80 : Math.max(1, 80 - suffix.length);
    const baseSku = sku.slice(0, baseLimit).replace(/-+$/g, "");
    const variantSku = `${baseSku}${suffix}`;

    return {
      sku: variantSku,
      sizeLabel: combination.sizeLabel,
      colorLabel: combination.colorLabel,
      price,
      stockQty: baseStock + (index === 0 ? stockRemainder : 0),
      isDefault: index === 0 ? 1 : 0,
    };
  });
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_IMAGE_FILES,
    fileSize: MAX_IMAGE_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, callback) => {
    if (!ACCEPTED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      return callback(
        new Error(
          "Format image non supporte. Utilise JPG, PNG, WEBP ou AVIF.",
        ),
      );
    }

    return callback(null, true);
  },
});

const cleanupFiles = async (absolutePaths) => {
  if (!absolutePaths.length) {
    return;
  }

  await Promise.allSettled(absolutePaths.map((filePath) => fs.unlink(filePath)));
};

const toLocalProductImagePath = (imageUrl) => {
  const normalizedUrl = normalizeText(imageUrl, 800);
  if (!normalizedUrl.startsWith("/uploads/products/")) {
    return null;
  }

  const relativePath = normalizedUrl.replace(/^\/+/, "");
  const absolutePath = path.resolve(__dirname, "../../public", relativePath);
  if (!absolutePath.startsWith(PRODUCT_UPLOAD_DIR)) {
    return null;
  }

  return absolutePath;
};

const processAndSaveImages = async (files, productSlug, productName) => {
  await fs.mkdir(PRODUCT_UPLOAD_DIR, { recursive: true });

  const processedImages = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const filename = `${productSlug.slice(0, 40)}-${Date.now()}-${
        index + 1
      }-${randomUUID().slice(0, 8)}.webp`;
      const absolutePath = path.join(PRODUCT_UPLOAD_DIR, filename);
      const publicImageUrl = `/uploads/products/${filename}`;

      const processedBuffer = await sharp(file.buffer)
        .rotate()
        .resize(PRODUCT_IMAGE_MAX_WIDTH, PRODUCT_IMAGE_MAX_HEIGHT, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({
          quality: PRODUCT_IMAGE_WEBP_QUALITY,
          effort: 6,
        })
        .toBuffer();

      await fs.writeFile(absolutePath, processedBuffer);

      processedImages.push({
        absolutePath,
        imageUrl: publicImageUrl,
        altText: normalizeText(`${productName} - visuel ${index + 1}`, 180),
        isPrimary: index === 0 ? 1 : 0,
        sortOrder: index,
      });
    }
  } catch (error) {
    await cleanupFiles(processedImages.map((image) => image.absolutePath));
    throw error;
  }

  return processedImages;
};

const uploadProductImages = (req, res, next) => {
  const uploadHandler = upload.array("images", MAX_IMAGE_FILES);

  uploadHandler(req, res, (error) => {
    if (!error) {
      return next();
    }

    let message = "Le televersement des images a echoue.";
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        message = "Une image depasse la limite de 8MB.";
      } else if (error.code === "LIMIT_FILE_COUNT") {
        message = `Maximum ${MAX_IMAGE_FILES} images par produit.`;
      } else {
        message = "Erreur de televersement, merci de verifier les images.";
      }
    } else if (error?.message) {
      message = error.message;
    }

    return renderAddProductPage({
      req,
      res,
      status: 400,
      feedback: {
        tone: "error",
        title: "Import image invalide",
        message,
      },
      formData: toFormData(req.body),
    });
  });
};

const createProduct = async (req, res) => {
  const formData = toFormData(req.body);
  let categoryOptions = DEFAULT_CATEGORY_OPTIONS;

  try {
    categoryOptions = await loadCategoryOptions();
  } catch (_error) {
    categoryOptions = DEFAULT_CATEGORY_OPTIONS;
  }

  try {
    const name = formData.name;
    const sku = formData.sku;
    const categorySlug = formData.category;
    const description = formData.description || null;
    const price = normalizeDecimal(formData.price);
    const stock = normalizeInteger(formData.stock);
    const sizes = parseList(formData.sizes);
    const colors = parseList(formData.colors);

    if (!name || !sku || !categorySlug) {
      return renderAddProductPage({
        req,
        res,
        status: 400,
        feedback: {
          tone: "error",
          title: "Champs obligatoires manquants",
          message: "Nom, SKU et categorie sont obligatoires.",
        },
        formData,
        categoryOptions,
      });
    }

    if (!Number.isFinite(price) || price <= 0) {
      return renderAddProductPage({
        req,
        res,
        status: 400,
        feedback: {
          tone: "error",
          title: "Prix invalide",
          message: "Le prix doit etre un nombre superieur a 0.",
        },
        formData,
        categoryOptions,
      });
    }

    if (!Number.isInteger(stock) || stock < 0) {
      return renderAddProductPage({
        req,
        res,
        status: 400,
        feedback: {
          tone: "error",
          title: "Stock invalide",
          message: "Le stock doit etre un nombre entier positif ou nul.",
        },
        formData,
        categoryOptions,
      });
    }

    if (!Array.isArray(req.files) || req.files.length === 0) {
      return renderAddProductPage({
        req,
        res,
        status: 400,
        feedback: {
          tone: "error",
          title: "Image obligatoire",
          message: "Ajoute au moins une image produit.",
        },
        formData,
        categoryOptions,
      });
    }

    const category = await productModel.getCategoryBySlug(categorySlug);
    if (!category) {
      return renderAddProductPage({
        req,
        res,
        status: 400,
        feedback: {
          tone: "error",
          title: "Categorie inconnue",
          message: "La categorie selectionnee n existe pas en base.",
        },
        formData,
        categoryOptions,
      });
    }

    const skuExists = await productModel.hasProductSku(sku);
    if (skuExists) {
      return renderAddProductPage({
        req,
        res,
        status: 409,
        feedback: {
          tone: "error",
          title: "SKU deja utilise",
          message: "Ce SKU existe deja. Utilise une autre reference.",
        },
        formData,
        categoryOptions,
      });
    }

    const uniqueSlug = await ensureUniqueSlug(slugify(name));
    const variants = buildVariants({
      sku,
      price,
      stock,
      sizes,
      colors,
    });

    const processedImages = await processAndSaveImages(req.files, uniqueSlug, name);
    const imageRecords = processedImages.map((image) => ({
      imageUrl: image.imageUrl,
      altText: image.altText,
      isPrimary: image.isPrimary,
      sortOrder: image.sortOrder,
    }));

    try {
      const createdProductId = await productModel.createProductWithAssets({
        product: {
          categoryId: category.id,
          name,
          slug: uniqueSlug,
          sku,
          description,
          price,
        },
        variants,
        images: imageRecords,
      });

      emitAdminRealtimeEvent(req, "admin:products:created", {
        productId: Number(createdProductId),
        slug: uniqueSlug,
        name,
      });

      return renderAddProductPage({
        req,
        res,
        status: 201,
        feedback: {
          tone: "success",
          title: "Produit enregistre",
          message: `Produit #${createdProductId} ajoute avec ${processedImages.length} image(s) optimisee(s) en WebP.`,
        },
        formData: {},
        categoryOptions,
      });
    } catch (error) {
      await cleanupFiles(processedImages.map((image) => image.absolutePath));
      throw error;
    }
  } catch (error) {
    console.error("[ADMIN PRODUCTS] createProduct error:", error);
    return renderAddProductPage({
      req,
      res,
      status: 500,
      feedback: {
        tone: "error",
        title: "Erreur serveur",
        message: "Impossible d ajouter le produit pour le moment.",
      },
      formData,
      categoryOptions,
    });
  }
};

const showAddProductPage = async (req, res) => {
  let categoryOptions = DEFAULT_CATEGORY_OPTIONS;
  try {
    categoryOptions = await loadCategoryOptions();
  } catch (_error) {
    categoryOptions = DEFAULT_CATEGORY_OPTIONS;
  }

  return renderAddProductPage({
    req,
    res,
    status: 200,
    feedback: null,
    formData: {},
    categoryOptions,
  });
};

const showEditProductPage = async (req, res) => {
  const productId = normalizeProductId(req.params.productId);
  if (!Number.isInteger(productId)) {
    return res.redirect(303, "/admin/produits");
  }

  let categoryOptions = DEFAULT_CATEGORY_OPTIONS;
  try {
    categoryOptions = await loadCategoryOptions();
  } catch (_error) {
    categoryOptions = DEFAULT_CATEGORY_OPTIONS;
  }

  try {
    const product = await productModel.getAdminProductById(productId);
    if (!product) {
      return res.redirect(303, "/admin/produits");
    }

    return renderEditProductPage({
      req,
      res,
      productId,
      status: 200,
      feedback: null,
      formData: toEditFormDataFromProduct(product),
      categoryOptions,
    });
  } catch (error) {
    console.error("[ADMIN PRODUCTS] showEditProductPage error:", error);
    return renderEditProductPage({
      req,
      res,
      productId,
      status: 500,
      feedback: {
        tone: "error",
        title: "Erreur serveur",
        message: "Impossible de charger ce produit pour le moment.",
      },
      formData: {},
      categoryOptions,
    });
  }
};

const updateProduct = async (req, res) => {
  const productId = normalizeProductId(req.params.productId);
  if (!Number.isInteger(productId)) {
    return res.redirect(303, "/admin/produits");
  }

  const formData = toEditFormData(req.body);
  let categoryOptions = DEFAULT_CATEGORY_OPTIONS;

  try {
    categoryOptions = await loadCategoryOptions();
  } catch (_error) {
    categoryOptions = DEFAULT_CATEGORY_OPTIONS;
  }

  try {
    const name = formData.name;
    const sku = formData.sku;
    const categorySlug = formData.category;
    const description = formData.description || null;
    const status = normalizeProductStatus(formData.status);
    const visibility = normalizeProductVisibility(formData.visibility);
    const price = normalizeDecimal(formData.price);
    const stock = normalizeInteger(formData.stock);

    if (!name || !sku || !categorySlug) {
      return renderEditProductPage({
        req,
        res,
        productId,
        status: 400,
        feedback: {
          tone: "error",
          title: "Champs obligatoires manquants",
          message: "Nom, SKU et categorie sont obligatoires.",
        },
        formData,
        categoryOptions,
      });
    }

    if (!Number.isFinite(price) || price <= 0) {
      return renderEditProductPage({
        req,
        res,
        productId,
        status: 400,
        feedback: {
          tone: "error",
          title: "Prix invalide",
          message: "Le prix doit etre un nombre superieur a 0.",
        },
        formData,
        categoryOptions,
      });
    }

    if (!Number.isInteger(stock) || stock < 0) {
      return renderEditProductPage({
        req,
        res,
        productId,
        status: 400,
        feedback: {
          tone: "error",
          title: "Stock invalide",
          message: "Le stock doit etre un nombre entier positif ou nul.",
        },
        formData,
        categoryOptions,
      });
    }

    const product = await productModel.getAdminProductById(productId);
    if (!product) {
      return res.redirect(303, "/admin/produits");
    }

    const category = await productModel.getCategoryBySlug(categorySlug);
    if (!category) {
      return renderEditProductPage({
        req,
        res,
        productId,
        status: 400,
        feedback: {
          tone: "error",
          title: "Categorie inconnue",
          message: "La categorie selectionnee n existe pas en base.",
        },
        formData,
        categoryOptions,
      });
    }

    const skuExists = await productModel.hasProductSkuForOtherProduct({
      sku,
      productId,
    });
    if (skuExists) {
      return renderEditProductPage({
        req,
        res,
        productId,
        status: 409,
        feedback: {
          tone: "error",
          title: "SKU deja utilise",
          message: "Ce SKU existe deja. Utilise une autre reference.",
        },
        formData,
        categoryOptions,
      });
    }

    const updateResult = await productModel.updateAdminProductById({
      productId,
      categoryId: Number(category.id),
      name,
      sku,
      description,
      status,
      visibility,
      basePrice: price,
      stockTotal: stock,
    });

    if (!updateResult.updated) {
      return res.redirect(303, "/admin/produits");
    }

    emitAdminRealtimeEvent(req, "admin:products:updated", {
      productId,
      name,
    });

    return renderEditProductPage({
      req,
      res,
      productId,
      status: 200,
      feedback: {
        tone: "success",
        title: "Produit mis a jour",
        message: "Les modifications ont ete enregistrees.",
      },
      formData,
      categoryOptions,
    });
  } catch (error) {
    console.error("[ADMIN PRODUCTS] updateProduct error:", error);
    return renderEditProductPage({
      req,
      res,
      productId,
      status: 500,
      feedback: {
        tone: "error",
        title: "Erreur serveur",
        message: "Impossible de mettre a jour ce produit pour le moment.",
      },
      formData,
      categoryOptions,
    });
  }
};

const deleteProduct = async (req, res) => {
  const productId = normalizeProductId(req.params.productId);
  if (!Number.isInteger(productId)) {
    return res.redirect(303, "/admin/produits");
  }

  const acceptsJson = String(req.get("accept") || "")
    .toLowerCase()
    .includes("application/json");

  try {
    const deletedData = await productModel.deleteAdminProductById(productId);
    if (!deletedData.deleted) {
      if (acceptsJson) {
        return res.status(404).json({
          ok: false,
          message: "Produit introuvable.",
        });
      }
      return res.redirect(303, "/admin/produits");
    }

    const imagePaths = deletedData.imageUrls
      .map((imageUrl) => toLocalProductImagePath(imageUrl))
      .filter(Boolean);
    await cleanupFiles(imagePaths);

    emitAdminRealtimeEvent(req, "admin:products:deleted", {
      productId,
      name: deletedData.name,
    });

    if (acceptsJson) {
      return res.status(200).json({ ok: true });
    }

    return res.redirect(303, "/admin/produits");
  } catch (error) {
    console.error("[ADMIN PRODUCTS] deleteProduct error:", error);
    if (acceptsJson) {
      return res.status(500).json({
        ok: false,
        message: "Impossible de supprimer ce produit pour le moment.",
      });
    }

    return res.redirect(303, "/admin/produits");
  }
};

const productControllers = {
  showAddProductPage,
  showEditProductPage,
  uploadProductImages,
  createProduct,
  updateProduct,
  deleteProduct,
};

export default productControllers;
