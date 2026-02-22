import dotenv from "dotenv";
import mysql from "mysql2/promise";

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

export const logDbConnectionStatus = async () => {
  try {
    const connection = await mysql.createConnection(config.db);
    await connection.ping();
    console.log(
      `[DB] Base de donnees connectee: ${config.db.database}@${config.db.host}:${config.db.port}`,
    );
    await connection.end();
  } catch (error) {
    console.error(
      `[DB] Echec connexion (${config.db.host}:${config.db.port}): ${error.message}`,
    );
  }
};

export default config;
