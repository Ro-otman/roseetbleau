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

const renderAddProductPage = ({
  res,
  status = 200,
  feedback = null,
  formData = {},
}) => {
  return res.status(status).render("pages/admins/ajoutproduit", {
    layout: "layouts/admin",
    pageTitle: "Admin Ajout Produit | Rose&Bleu",
    pageStylesheet: "/css/pages/admin.css",
    currentAdminPath: "/admin/ajoutproduit",
    adminPageTitle: "Ajouter un produit",
    adminPageLead: "Cree une nouvelle fiche produit complete.",
    adminIdentity: null,
    productFeedback: feedback,
    formData,
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
        res,
        status: 400,
        feedback: {
          tone: "error",
          title: "Champs obligatoires manquants",
          message: "Nom, SKU et categorie sont obligatoires.",
        },
        formData,
      });
    }

    if (!Number.isFinite(price) || price <= 0) {
      return renderAddProductPage({
        res,
        status: 400,
        feedback: {
          tone: "error",
          title: "Prix invalide",
          message: "Le prix doit etre un nombre superieur a 0.",
        },
        formData,
      });
    }

    if (!Number.isInteger(stock) || stock < 0) {
      return renderAddProductPage({
        res,
        status: 400,
        feedback: {
          tone: "error",
          title: "Stock invalide",
          message: "Le stock doit etre un nombre entier positif ou nul.",
        },
        formData,
      });
    }

    if (!Array.isArray(req.files) || req.files.length === 0) {
      return renderAddProductPage({
        res,
        status: 400,
        feedback: {
          tone: "error",
          title: "Image obligatoire",
          message: "Ajoute au moins une image produit.",
        },
        formData,
      });
    }

    const category = await productModel.getCategoryBySlug(categorySlug);
    if (!category) {
      return renderAddProductPage({
        res,
        status: 400,
        feedback: {
          tone: "error",
          title: "Categorie inconnue",
          message: "La categorie selectionnee n existe pas en base.",
        },
        formData,
      });
    }

    const skuExists = await productModel.hasProductSku(sku);
    if (skuExists) {
      return renderAddProductPage({
        res,
        status: 409,
        feedback: {
          tone: "error",
          title: "SKU deja utilise",
          message: "Ce SKU existe deja. Utilise une autre reference.",
        },
        formData,
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

      return renderAddProductPage({
        res,
        status: 201,
        feedback: {
          tone: "success",
          title: "Produit enregistre",
          message: `Produit #${createdProductId} ajoute avec ${processedImages.length} image(s) optimisee(s) en WebP.`,
        },
        formData: {},
      });
    } catch (error) {
      await cleanupFiles(processedImages.map((image) => image.absolutePath));
      throw error;
    }
  } catch (error) {
    console.error("[ADMIN PRODUCTS] createProduct error:", error);
    return renderAddProductPage({
      res,
      status: 500,
      feedback: {
        tone: "error",
        title: "Erreur serveur",
        message: "Impossible d ajouter le produit pour le moment.",
      },
      formData,
    });
  }
};

const showAddProductPage = (_req, res) => {
  return renderAddProductPage({
    res,
    status: 200,
    feedback: null,
    formData: {},
  });
};

const productControllers = {
  showAddProductPage,
  uploadProductImages,
  createProduct,
};

export default productControllers;
