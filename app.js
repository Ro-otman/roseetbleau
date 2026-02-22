import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import expressLayouts from "express-ejs-layouts";
import helmet from "helmet";
import hpp from "hpp";
import jwt from "jsonwebtoken";
import config, { logDbConnectionStatus } from "./config/config.js";
import authModel from "./models/users/authModel.js";
import adminsRouter from "./routes/admins/adminsRoutes.js";
import usersRouter from "./routes/users/usersRoutes.js";

const app = express();
const PORT = config.port;
const ACCESS_COOKIE_NAME = "rb_access_token";
const REFRESH_COOKIE_NAME = "rb_refresh_token";
const ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";
const COOKIE_SECURE =
  process.env.COOKIE_SECURE != null
    ? process.env.COOKIE_SECURE === "true"
    : config.env === "production";
const JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ||
  process.env.JWT_SECRET ||
  "change-me-access-secret";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  process.env.JWT_SECRET ||
  "change-me-refresh-secret";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("layout", "layouts/main");
app.use(expressLayouts);

app.use(helmet());
app.use(hpp());
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const baseCookieOptions = () => ({
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: "strict",
  path: "/",
});

const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie(ACCESS_COOKIE_NAME, accessToken, {
    ...baseCookieOptions(),
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...baseCookieOptions(),
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie(ACCESS_COOKIE_NAME, baseCookieOptions());
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieOptions());
};

const buildAccessToken = (user) => {
  const firstName =
    typeof user.first_name === "string"
      ? user.first_name
      : typeof user.firstName === "string"
        ? user.firstName
        : "";

  return jwt.sign(
    {
      sub: String(user.uuid),
      email: user.email,
      firstName,
      role: user.role,
      type: "access",
    },
    JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );
};

const buildRefreshToken = (user, tokenId) => {
  return jwt.sign(
    {
      sub: String(user.uuid),
      tokenId,
      type: "refresh",
    },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL },
  );
};

const toAuthUser = ({ sub, firstName, email }) => {
  const rawFirstName = typeof firstName === "string" ? firstName.trim() : "";
  const fallbackName =
    typeof email === "string" ? email.split("@")[0]?.trim() || "Compte" : "Compte";

  return {
    id: String(sub),
    firstName: (rawFirstName || fallbackName).slice(0, 100),
  };
};

const issueSessionFromRefresh = async (res, user, storedTokenId) => {
  await authModel.revokeRefreshTokenById(storedTokenId);

  const refreshTokenId = authModel.createUuid();
  const accessToken = buildAccessToken(user);
  const refreshToken = buildRefreshToken(user, refreshTokenId);

  await authModel.createRefreshToken({
    tokenId: refreshTokenId,
    userId: user.id,
    tokenHash: hashToken(refreshToken),
  });

  setAuthCookies(res, accessToken, refreshToken);
};

const tryRefreshAuthUser = async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!refreshToken) {
    return null;
  }

  let refreshPayload;
  try {
    refreshPayload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
  } catch (_error) {
    await authModel.revokeRefreshTokenByHash(hashToken(refreshToken));
    clearAuthCookies(res);
    return null;
  }

  if (refreshPayload?.type !== "refresh" || !refreshPayload?.sub) {
    await authModel.revokeRefreshTokenByHash(hashToken(refreshToken));
    clearAuthCookies(res);
    return null;
  }

  const user = await authModel.getUserByUuid(String(refreshPayload.sub));
  if (!user || user.status !== "active") {
    await authModel.revokeRefreshTokenByHash(hashToken(refreshToken));
    clearAuthCookies(res);
    return null;
  }

  const storedToken = await authModel.getActiveRefreshTokenByHash(
    hashToken(refreshToken),
  );
  if (!storedToken || String(storedToken.user_id) !== String(user.id)) {
    // Token absent here can happen if another concurrent request already rotated it.
    // Avoid clearing cookies to prevent race-condition logout.
    return null;
  }

  await issueSessionFromRefresh(res, user, storedToken.id);

  return toAuthUser({
    sub: user.uuid,
    firstName: user.first_name,
    email: user.email,
  });
};

app.use(async (req, res, next) => {
  res.locals.authUser = null;
  req.authUser = null;

  const accessToken = req.cookies?.[ACCESS_COOKIE_NAME];
  if (accessToken) {
    try {
      const payload = jwt.verify(accessToken, JWT_ACCESS_SECRET);
      if (payload?.type === "access" && payload?.sub) {
        const authUser = toAuthUser(payload);
        req.authUser = authUser;
        res.locals.authUser = authUser;
        return next();
      }
    } catch (_error) {
      // Access token invalid/expired: attempt silent refresh below.
    }
  }

  try {
    await authModel.ensureAuthSchemaReady();
    const authUser = await tryRefreshAuthUser(req, res);

    if (authUser) {
      req.authUser = authUser;
      res.locals.authUser = authUser;
    }
  } catch (error) {
    console.error("[AUTH] auto-refresh middleware error:", error);
  }

  return next();
});

app.get("/favicon.ico", (_req, res) => {
  res.redirect(301, "/images/favicon.svg");
});

app.use("/", usersRouter);
app.use("/admin", adminsRouter);

app.use((req, res) => {
  res
    .status(404)
    .json({ error: `Route introuvable: ${req.method} ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Erreur interne du serveur." });
});

app.listen(PORT, async () => {
  console.log(`Rose&Bleu demarre sur http://localhost:${PORT}`);
  await logDbConnectionStatus();
});
