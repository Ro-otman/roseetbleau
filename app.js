import path from "node:path";
import { fileURLToPath } from "node:url";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import expressLayouts from "express-ejs-layouts";
import helmet from "helmet";
import hpp from "hpp";
import jwt from "jsonwebtoken";
import config, { logDbConnectionStatus } from "./config/config.js";
import adminsRouter from "./routes/admins/adminsRoutes.js";
import usersRouter from "./routes/users/usersRoutes.js";

const app = express();
const PORT = config.port;
const ACCESS_COOKIE_NAME = "rb_access_token";
const JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ||
  process.env.JWT_SECRET ||
  "change-me-access-secret";

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

app.use((req, res, next) => {
  res.locals.authUser = null;
  req.authUser = null;

  const accessToken = req.cookies?.[ACCESS_COOKIE_NAME];
  if (!accessToken) {
    return next();
  }

  try {
    const payload = jwt.verify(accessToken, JWT_ACCESS_SECRET);
    if (payload?.type !== "access" || !payload?.sub) {
      return next();
    }

    const rawFirstName =
      typeof payload.firstName === "string" ? payload.firstName.trim() : "";
    const fallbackName =
      typeof payload.email === "string"
        ? payload.email.split("@")[0]?.trim() || "Compte"
        : "Compte";

    const authUser = {
      id: String(payload.sub),
      firstName: (rawFirstName || fallbackName).slice(0, 100),
    };

    req.authUser = authUser;
    res.locals.authUser = authUser;
  } catch (_error) {
    // Invalid or expired token: expose no connected user to the views.
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
