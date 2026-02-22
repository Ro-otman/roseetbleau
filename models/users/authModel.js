import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import config from "../../config/config.js";

const REFRESH_TOKENS_TABLE = "auth_refresh_tokens";

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
});

let ensureAuthSchemaPromise;

const createUuid = () => randomUUID();

const hasColumn = async (tableName, columnName) => {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName],
  );

  return rows.length > 0;
};

const hasIndex = async (tableName, indexName) => {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1
    `,
    [tableName, indexName],
  );

  return rows.length > 0;
};

const ensureUsersUuidColumn = async () => {
  const uuidColumnExists = await hasColumn("users", "uuid");
  if (!uuidColumnExists) {
    await pool.query("ALTER TABLE users ADD COLUMN uuid CHAR(36) NULL AFTER id");
  }

  await pool.query("UPDATE users SET uuid = UUID() WHERE uuid IS NULL OR uuid = ''");

  const uuidIndexExists = await hasIndex("users", "uq_users_uuid");
  if (!uuidIndexExists) {
    await pool.query("ALTER TABLE users ADD UNIQUE INDEX uq_users_uuid (uuid)");
  }

  await pool.query("ALTER TABLE users MODIFY uuid CHAR(36) NOT NULL");
};

const ensureRefreshTokensTable = async () => {
  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS ${REFRESH_TOKENS_TABLE} (
        id CHAR(36) PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_auth_refresh_tokens_hash (token_hash),
        KEY idx_auth_refresh_tokens_user (user_id),
        KEY idx_auth_refresh_tokens_expires (expires_at),
        CONSTRAINT fk_auth_refresh_tokens_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  );
};

const ensureAuthSchemaReady = async () => {
  if (!ensureAuthSchemaPromise) {
    ensureAuthSchemaPromise = (async () => {
      await ensureUsersUuidColumn();
      await ensureRefreshTokensTable();
    })();
  }

  await ensureAuthSchemaPromise;
};

const getUserByEmail = async (email) => {
  const [rows] = await pool.query(
    `
      SELECT id, uuid, first_name, last_name, email, password_hash, role, status
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [email],
  );

  return rows[0] ?? null;
};

const getUserById = async (userId) => {
  const [rows] = await pool.query(
    `
      SELECT id, uuid, first_name, last_name, email, password_hash, role, status
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId],
  );

  return rows[0] ?? null;
};

const getUserByUuid = async (userUuid) => {
  const [rows] = await pool.query(
    `
      SELECT id, uuid, first_name, last_name, email, password_hash, role, status
      FROM users
      WHERE uuid = ?
      LIMIT 1
    `,
    [userUuid],
  );

  return rows[0] ?? null;
};

const createUser = async ({
  userUuid,
  firstName,
  lastName,
  email,
  phone,
  passwordHash,
}) => {
  const [insertResult] = await pool.query(
    `
      INSERT INTO users
        (uuid, first_name, last_name, email, phone, password_hash, role, status)
      VALUES (?, ?, ?, ?, ?, ?, 'customer', 'active')
    `,
    [userUuid, firstName, lastName, email, phone, passwordHash],
  );

  return insertResult.insertId;
};

const updateUserLastLoginAt = async (userId) => {
  await pool.query("UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?", [
    userId,
  ]);
};

const createRefreshToken = async ({ tokenId, userId, tokenHash }) => {
  await pool.query(
    `
      INSERT INTO ${REFRESH_TOKENS_TABLE} (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY))
    `,
    [tokenId, userId, tokenHash],
  );
};

const getActiveRefreshTokenByHash = async (tokenHash) => {
  const [rows] = await pool.query(
    `
      SELECT id, user_id
      FROM ${REFRESH_TOKENS_TABLE}
      WHERE token_hash = ?
        AND revoked_at IS NULL
        AND expires_at > UTC_TIMESTAMP()
      LIMIT 1
    `,
    [tokenHash],
  );

  return rows[0] ?? null;
};

const revokeRefreshTokenByHash = async (tokenHash) => {
  await pool.query(
    `
      UPDATE ${REFRESH_TOKENS_TABLE}
      SET revoked_at = UTC_TIMESTAMP()
      WHERE token_hash = ?
        AND revoked_at IS NULL
    `,
    [tokenHash],
  );
};

const revokeRefreshTokenById = async (tokenId) => {
  await pool.query(
    `
      UPDATE ${REFRESH_TOKENS_TABLE}
      SET revoked_at = UTC_TIMESTAMP()
      WHERE id = ?
        AND revoked_at IS NULL
    `,
    [tokenId],
  );
};

const authModel = {
  createUuid,
  ensureAuthSchemaReady,
  getUserByEmail,
  getUserById,
  getUserByUuid,
  createUser,
  updateUserLastLoginAt,
  createRefreshToken,
  getActiveRefreshTokenByHash,
  revokeRefreshTokenByHash,
  revokeRefreshTokenById,
};

export default authModel;
