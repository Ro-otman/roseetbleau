import bcrypt from "bcrypt";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import config from "../../config/config.js";
import authModel from "../../models/users/authModel.js";

const ACCESS_COOKIE_NAME = "rb_access_token";
const REFRESH_COOKIE_NAME = "rb_refresh_token";
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";
const ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
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

const normalizeText = (value, maxLength = 255) => {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
};

const normalizeEmail = (value) => {
  return normalizeText(value, 190);
};

const asBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").toLowerCase();
  return normalized === "on" || normalized === "true" || normalized === "1";
};

const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const isStrongPassword = (password) => {
  if (typeof password !== "string" || password.length < 8) {
    return false;
  }

  return /[a-z]/i.test(password) && /\d/.test(password);
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

const storeRefreshToken = async (tokenId, userId, refreshToken) => {
  await authModel.createRefreshToken({
    tokenId,
    userId,
    tokenHash: hashToken(refreshToken),
  });
};

const revokeRefreshToken = async (refreshToken) => {
  if (!refreshToken) {
    return;
  }

  await authModel.revokeRefreshTokenByHash(hashToken(refreshToken));
};

const issueSession = async (res, user) => {
  const refreshTokenId = authModel.createUuid();
  const accessToken = buildAccessToken(user);
  const refreshToken = buildRefreshToken(user, refreshTokenId);

  await storeRefreshToken(refreshTokenId, user.id, refreshToken);
  setAuthCookies(res, accessToken, refreshToken);
};

const renderLoginPage = ({
  res,
  status = 200,
  feedback = null,
  formData = {},
}) => {
  return res.status(status).render("pages/users/login", {
    pageTitle: "Connexion | Rose&Bleu",
    pageStylesheet: "/css/pages/login.css",
    currentPath: "/login",
    authFeedback: feedback,
    formData,
  });
};

const renderSignupPage = ({
  res,
  status = 200,
  feedback = null,
  formData = {},
}) => {
  return res.status(status).render("pages/users/signup", {
    pageTitle: "Inscription | Rose&Bleu",
    pageStylesheet: "/css/pages/signup.css",
    currentPath: "/signup",
    authFeedback: feedback,
    formData,
  });
};

const parseSignupBody = (body = {}) => {
  return {
    firstName: normalizeText(body.firstName ?? body.firstname, 100),
    lastName: normalizeText(body.lastName ?? body.lastname, 100),
    email: normalizeEmail(body.email),
    phone: normalizeText(body.phone, 30),
    password: String(body.password ?? ""),
    confirmPassword: String(body.confirmPassword ?? ""),
  };
};

const parseLoginBody = (body = {}) => {
  return {
    email: normalizeEmail(body.email),
    password: String(body.password ?? ""),
    remember: asBoolean(body.remember),
  };
};

const asSignupFormData = (payload) => ({
  firstname: payload.firstName,
  lastname: payload.lastName,
  email: payload.email,
  phone: payload.phone ?? "",
});

const asLoginFormData = (payload) => ({
  email: payload.email,
  remember: payload.remember,
});

const authControllers = {
  signup: async (req, res) => {
    try {
      await authModel.ensureAuthSchemaReady();
      const payload = parseSignupBody(req.body);
      const formData = asSignupFormData(payload);

      if (
        !payload.firstName ||
        !payload.lastName ||
        !payload.email ||
        !payload.phone
      ) {
        return renderSignupPage({
          res,
          status: 400,
          feedback: {
            tone: "error",
            title: "Inscription impossible",
            message:
              "Prenom, nom, email et numero de telephone sont obligatoires.",
          },
          formData,
        });
      }

      if (!isStrongPassword(payload.password)) {
        return renderSignupPage({
          res,
          status: 400,
          feedback: {
            tone: "error",
            title: "Mot de passe trop faible",
            message:
              "Le mot de passe doit contenir au moins 8 caracteres, une lettre et un chiffre.",
          },
          formData,
        });
      }

      if (payload.password !== payload.confirmPassword) {
        return renderSignupPage({
          res,
          status: 400,
          feedback: {
            tone: "error",
            title: "Confirmation incorrecte",
            message: "La confirmation du mot de passe ne correspond pas.",
          },
          formData,
        });
      }

      const existingUser = await authModel.getUserByEmail(payload.email);
      if (existingUser) {
        return renderSignupPage({
          res,
          status: 409,
          feedback: {
            tone: "error",
            title: "Email deja utilise",
            message: "Un compte existe deja avec cette adresse email.",
          },
          formData,
        });
      }

      const passwordHash = await bcrypt.hash(
        payload.password,
        BCRYPT_SALT_ROUNDS,
      );

      const createdUserId = await authModel.createUser({
        userUuid: authModel.createUuid(),
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        passwordHash,
      });

      const createdUser = await authModel.getUserById(createdUserId);
      if (!createdUser) {
        throw new Error("Unable to load created user");
      }

      await issueSession(res, createdUser);

      return res.redirect(302, "/");
    } catch (error) {
      console.error("[AUTH] signup error:", error);
      return renderSignupPage({
        res,
        status: 500,
        feedback: {
          tone: "error",
          title: "Erreur serveur",
          message: "Une erreur est survenue pendant l inscription.",
        },
        formData: asSignupFormData(parseSignupBody(req.body)),
      });
    }
  },

  login: async (req, res) => {
    try {
      await authModel.ensureAuthSchemaReady();
      const payload = parseLoginBody(req.body);
      const formData = asLoginFormData(payload);

      if (!payload.email || !payload.password) {
        return renderLoginPage({
          res,
          status: 400,
          feedback: {
            tone: "error",
            title: "Connexion impossible",
            message: "Email et mot de passe sont obligatoires.",
          },
          formData,
        });
      }

      const user = await authModel.getUserByEmail(payload.email);
      if (!user) {
        return renderLoginPage({
          res,
          status: 401,
          feedback: {
            tone: "error",
            title: "Identifiants invalides",
            message: "Adresse email ou mot de passe incorrect.",
          },
          formData,
        });
      }

      if (user.status !== "active") {
        return renderLoginPage({
          res,
          status: 403,
          feedback: {
            tone: "error",
            title: "Compte indisponible",
            message: "Ton compte n'est pas actif pour le moment.",
          },
          formData,
        });
      }

      const validPassword = await bcrypt.compare(
        payload.password,
        user.password_hash,
      );
      if (!validPassword) {
        return renderLoginPage({
          res,
          status: 401,
          feedback: {
            tone: "error",
            title: "Identifiants invalides",
            message: "Adresse email ou mot de passe incorrect.",
          },
          formData,
        });
      }

      await authModel.updateUserLastLoginAt(user.id);
      await issueSession(res, user);

      return res.redirect(302, "/");
    } catch (error) {
      console.error("[AUTH] login error:", error);
      return renderLoginPage({
        res,
        status: 500,
        feedback: {
          tone: "error",
          title: "Erreur serveur",
          message: "Une erreur est survenue pendant la connexion.",
        },
        formData: asLoginFormData(parseLoginBody(req.body)),
      });
    }
  },

  refresh: async (req, res) => {
    try {
      await authModel.ensureAuthSchemaReady();
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

      if (!refreshToken) {
        clearAuthCookies(res);
        return renderLoginPage({
          res,
          status: 401,
          feedback: {
            tone: "error",
            title: "Session expiree",
            message: "Aucun refresh token valide n a ete trouve.",
          },
          formData: {},
        });
      }

      let payload;
      try {
        payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
      } catch (_error) {
        await revokeRefreshToken(refreshToken);
        clearAuthCookies(res);
        return renderLoginPage({
          res,
          status: 401,
          feedback: {
            tone: "error",
            title: "Session invalide",
            message: "Le refresh token est invalide ou expire.",
          },
          formData: {},
        });
      }

      if (payload.type !== "refresh" || !payload.sub) {
        await revokeRefreshToken(refreshToken);
        clearAuthCookies(res);
        return renderLoginPage({
          res,
          status: 401,
          feedback: {
            tone: "error",
            title: "Session invalide",
            message: "Le refresh token recu est invalide.",
          },
          formData: {},
        });
      }

      const user = await authModel.getUserByUuid(String(payload.sub));
      if (!user || user.status !== "active") {
        await revokeRefreshToken(refreshToken);
        clearAuthCookies(res);
        return renderLoginPage({
          res,
          status: 403,
          feedback: {
            tone: "error",
            title: "Compte indisponible",
            message: "Impossible de renouveler la session pour ce compte.",
          },
          formData: {},
        });
      }

      const tokenHash = hashToken(refreshToken);
      const storedToken =
        await authModel.getActiveRefreshTokenByHash(tokenHash);
      if (!storedToken || String(storedToken.user_id) !== String(user.id)) {
        clearAuthCookies(res);
        return renderLoginPage({
          res,
          status: 401,
          feedback: {
            tone: "error",
            title: "Session invalide",
            message: "Ce refresh token n est plus autorise.",
          },
          formData: {},
        });
      }

      await authModel.revokeRefreshTokenById(storedToken.id);
      await issueSession(res, user);

      return renderLoginPage({
        res,
        status: 200,
        feedback: {
          tone: "success",
          title: "Session renouvelee",
          message:
            "Un nouveau token 15 min et un nouveau refresh token 7 jours ont ete emis.",
        },
        formData: {},
      });
    } catch (error) {
      console.error("[AUTH] refresh error:", error);
      clearAuthCookies(res);
      return renderLoginPage({
        res,
        status: 500,
        feedback: {
          tone: "error",
          title: "Erreur serveur",
          message: "Impossible de renouveler la session pour le moment.",
        },
        formData: {},
      });
    }
  },

  logout: async (req, res) => {
    try {
      await authModel.ensureAuthSchemaReady();
      await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE_NAME]);
      clearAuthCookies(res);

      return renderLoginPage({
        res,
        status: 200,
        feedback: {
          tone: "success",
          title: "Deconnexion reussie",
          message: "Ta session a bien ete fermee sur ce navigateur.",
        },
        formData: {},
      });
    } catch (error) {
      console.error("[AUTH] logout error:", error);
      clearAuthCookies(res);
      return renderLoginPage({
        res,
        status: 500,
        feedback: {
          tone: "error",
          title: "Erreur serveur",
          message: "Une erreur est survenue pendant la deconnexion.",
        },
        formData: {},
      });
    }
  },
};

export default authControllers;
