import crypto from "node:crypto";
import {
  ADMIN_ACCESS_COOKIE_NAME,
  ADMIN_REFRESH_COOKIE_NAME,
  buildAdminAccessToken,
  buildAdminRefreshToken,
  clearAdminAuthCookies,
  setAdminAuthCookies,
  verifyAdminAccessToken,
  verifyAdminRefreshToken,
} from "../config/adminAuth.js";
import adminAuthModel from "../models/admins/adminAuthModel.js";

const normalizeText = (value, maxLength = 255) => {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
};

const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const toAdminAuthUser = (adminRow) => {
  if (!adminRow) {
    return null;
  }

  const firstName = normalizeText(adminRow.first_name, 100) || "Admin";
  const lastName = normalizeText(adminRow.last_name, 100);

  return {
    id: String(adminRow.uuid),
    firstName,
    lastName,
    fullName: `${firstName}${lastName ? ` ${lastName}` : ""}`.trim(),
    email: normalizeText(adminRow.email, 190),
    role: "admin",
  };
};

const resolveAdminFromAccessToken = async (token) => {
  if (!token) {
    return null;
  }

  let payload;
  try {
    payload = verifyAdminAccessToken(token);
  } catch (_error) {
    return null;
  }

  if (
    payload?.type !== "admin_access" ||
    payload?.role !== "admin" ||
    !payload?.sub
  ) {
    return null;
  }

  const adminRow = await adminAuthModel.getActiveAdminByUuid(String(payload.sub));
  return toAdminAuthUser(adminRow);
};

const tryRefreshAdminAuth = async (req, res) => {
  const refreshToken = normalizeText(req.cookies?.[ADMIN_REFRESH_COOKIE_NAME], 4000);
  if (!refreshToken) {
    return null;
  }

  let payload;
  try {
    payload = verifyAdminRefreshToken(refreshToken);
  } catch (_error) {
    await adminAuthModel.revokeAdminRefreshTokenByHash(hashToken(refreshToken));
    clearAdminAuthCookies(res);
    return null;
  }

  if (
    payload?.type !== "admin_refresh" ||
    payload?.role !== "admin" ||
    !payload?.sub
  ) {
    await adminAuthModel.revokeAdminRefreshTokenByHash(hashToken(refreshToken));
    clearAdminAuthCookies(res);
    return null;
  }

  const adminRow = await adminAuthModel.getActiveAdminByUuid(String(payload.sub));
  if (!adminRow) {
    await adminAuthModel.revokeAdminRefreshTokenByHash(hashToken(refreshToken));
    clearAdminAuthCookies(res);
    return null;
  }

  const storedToken = await adminAuthModel.getActiveAdminRefreshTokenByHash(
    hashToken(refreshToken),
  );

  if (!storedToken || String(storedToken.user_id) !== String(adminRow.id)) {
    clearAdminAuthCookies(res);
    return null;
  }

  await adminAuthModel.revokeAdminRefreshTokenById(storedToken.id);

  const nextRefreshTokenId = adminAuthModel.createUuid();
  const accessToken = buildAdminAccessToken(adminRow);
  const nextRefreshToken = buildAdminRefreshToken(adminRow, nextRefreshTokenId);

  await adminAuthModel.createAdminRefreshToken({
    tokenId: nextRefreshTokenId,
    userId: adminRow.id,
    tokenHash: hashToken(nextRefreshToken),
  });

  setAdminAuthCookies(res, accessToken, nextRefreshToken);
  return toAdminAuthUser(adminRow);
};

const resolveAdminFromRequest = async (req, res) => {
  const accessToken = normalizeText(req.cookies?.[ADMIN_ACCESS_COOKIE_NAME], 4000);
  const fromAccessToken = await resolveAdminFromAccessToken(accessToken);
  if (fromAccessToken) {
    return fromAccessToken;
  }

  return tryRefreshAdminAuth(req, res);
};

const optionalAdminAuth = async (req, res, next) => {
  try {
    await adminAuthModel.ensureAdminAuthSchemaReady();
    const adminAuth = await resolveAdminFromRequest(req, res);
    req.adminAuth = adminAuth;
    res.locals.adminAuth = adminAuth;
    return next();
  } catch (error) {
    console.error("[ADMIN AUTH] optional auth middleware error:", error);
    req.adminAuth = null;
    res.locals.adminAuth = null;
    return next();
  }
};

const requireAdminAuth = async (req, res, next) => {
  try {
    const existing = req.adminAuth ?? null;
    const adminAuth = existing || (await resolveAdminFromRequest(req, res));

    if (!adminAuth) {
      clearAdminAuthCookies(res);
      if (req.headers.accept?.includes("application/json")) {
        return res.status(401).json({
          ok: false,
          message: "Acces admin requis.",
        });
      }

      return res.redirect(302, "/admin/login");
    }

    req.adminAuth = adminAuth;
    res.locals.adminAuth = adminAuth;
    return next();
  } catch (error) {
    console.error("[ADMIN AUTH] require auth middleware error:", error);
    clearAdminAuthCookies(res);
    return res.redirect(302, "/admin/login");
  }
};

const adminAuthMiddleware = {
  optionalAdminAuth,
  requireAdminAuth,
};

export default adminAuthMiddleware;
export { optionalAdminAuth, requireAdminAuth };
