import dotenv from "dotenv";

dotenv.config();

const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT) || 3000,
  db: {
    host: process.env.DB_HOST ?? "localhost",
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "roseetbleu",
    port: Number(process.env.DB_PORT) || 3306,
  },
};

export default config;
