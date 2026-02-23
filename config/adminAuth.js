import jwt from "jsonwebtoken";
import config from "./config.js";

const ADMIN_ACCESS_COOKIE_NAME = "rb_admin_access_token";
const ADMIN_REFRESH_COOKIE_NAME = "rb_admin_refresh_token";
const ADMIN_ACCESS_TOKEN_TTL = process.env.ADMIN_ACCESS_TOKEN_TTL || "15m";
const ADMIN_REFRESH_TOKEN_TTL = process.env.ADMIN_REFRESH_TOKEN_TTL || "7d";
const ADMIN_ACCESS_COOKIE_MAX_AGE =
  Number(process.env.ADMIN_ACCESS_COOKIE_MAX_AGE) || 15 * 60 * 1000;
const ADMIN_REFRESH_COOKIE_MAX_AGE =
  Number(process.env.ADMIN_REFRESH_COOKIE_MAX_AGE) || 7 * 24 * 60 * 60 * 1000;
const COOKIE_SECURE =
  process.env.COOKIE_SECURE != null
    ? process.env.COOKIE_SECURE === "true"
    : config.env === "production";
const JWT_ADMIN_ACCESS_SECRET =
  process.env.JWT_ADMIN_ACCESS_SECRET || "change-me-admin-access-secret";
const JWT_ADMIN_REFRESH_SECRET =
  process.env.JWT_ADMIN_REFRESH_SECRET || "change-me-admin-refresh-secret";

const baseAdminCookieOptions = () => ({
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: "strict",
  path: "/",
});

const setAdminAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie(ADMIN_ACCESS_COOKIE_NAME, accessToken, {
    ...baseAdminCookieOptions(),
    maxAge: ADMIN_ACCESS_COOKIE_MAX_AGE,
  });

  res.cookie(ADMIN_REFRESH_COOKIE_NAME, refreshToken, {
    ...baseAdminCookieOptions(),
    maxAge: ADMIN_REFRESH_COOKIE_MAX_AGE,
  });
};

const clearAdminAuthCookies = (res) => {
  res.clearCookie(ADMIN_ACCESS_COOKIE_NAME, baseAdminCookieOptions());
  res.clearCookie(ADMIN_REFRESH_COOKIE_NAME, baseAdminCookieOptions());
};

const buildAdminAccessToken = (adminUser) => {
  const firstName =
    typeof adminUser?.first_name === "string"
      ? adminUser.first_name
      : typeof adminUser?.firstName === "string"
        ? adminUser.firstName
        : "";

  return jwt.sign(
    {
      sub: String(adminUser.uuid),
      firstName,
      email: adminUser.email,
      role: "admin",
      type: "admin_access",
    },
    JWT_ADMIN_ACCESS_SECRET,
    { expiresIn: ADMIN_ACCESS_TOKEN_TTL },
  );
};

const buildAdminRefreshToken = (adminUser, tokenId) => {
  return jwt.sign(
    {
      sub: String(adminUser.uuid),
      tokenId: String(tokenId),
      role: "admin",
      type: "admin_refresh",
    },
    JWT_ADMIN_REFRESH_SECRET,
    { expiresIn: ADMIN_REFRESH_TOKEN_TTL },
  );
};

const verifyAdminAccessToken = (token) => {
  return jwt.verify(token, JWT_ADMIN_ACCESS_SECRET);
};

const verifyAdminRefreshToken = (token) => {
  return jwt.verify(token, JWT_ADMIN_REFRESH_SECRET);
};

const adminAuthConfig = {
  ADMIN_ACCESS_COOKIE_NAME,
  ADMIN_REFRESH_COOKIE_NAME,
  ADMIN_ACCESS_TOKEN_TTL,
  ADMIN_REFRESH_TOKEN_TTL,
  ADMIN_ACCESS_COOKIE_MAX_AGE,
  ADMIN_REFRESH_COOKIE_MAX_AGE,
  baseAdminCookieOptions,
  setAdminAuthCookies,
  clearAdminAuthCookies,
  buildAdminAccessToken,
  buildAdminRefreshToken,
  verifyAdminAccessToken,
  verifyAdminRefreshToken,
};

export default adminAuthConfig;
export {
  ADMIN_ACCESS_COOKIE_NAME,
  ADMIN_REFRESH_COOKIE_NAME,
  ADMIN_ACCESS_TOKEN_TTL,
  ADMIN_REFRESH_TOKEN_TTL,
  ADMIN_ACCESS_COOKIE_MAX_AGE,
  ADMIN_REFRESH_COOKIE_MAX_AGE,
  baseAdminCookieOptions,
  setAdminAuthCookies,
  clearAdminAuthCookies,
  buildAdminAccessToken,
  buildAdminRefreshToken,
  verifyAdminAccessToken,
  verifyAdminRefreshToken,
};
