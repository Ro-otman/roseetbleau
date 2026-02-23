import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import config from "../../config/config.js";

const REFRESH_TOKENS_TABLE = "auth_refresh_tokens";

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
});

let ensureAdminAuthSchemaPromise;

const createUuid = () => randomUUID();

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

const ensureAdminAuthSchemaReady = async () => {
  if (!ensureAdminAuthSchemaPromise) {
    ensureAdminAuthSchemaPromise = (async () => {
      await ensureRefreshTokensTable();
    })();
  }

  await ensureAdminAuthSchemaPromise;
};

const listActiveAdminsWithAccessKeyHash = async () => {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        uuid,
        first_name,
        last_name,
        email,
        admin_access_key_hash
      FROM users
      WHERE role = 'admin'
        AND status = 'active'
        AND admin_access_key_hash IS NOT NULL
    `,
  );

  return rows;
};

const getActiveAdminByUuid = async (uuid) => {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        uuid,
        first_name,
        last_name,
        email,
        role,
        status,
        last_login_at
      FROM users
      WHERE uuid = ?
        AND role = 'admin'
        AND status = 'active'
      LIMIT 1
    `,
    [uuid],
  );

  return rows[0] ?? null;
};

const updateAdminLastLoginAt = async (adminId) => {
  await pool.query(
    `
      UPDATE users
      SET last_login_at = UTC_TIMESTAMP()
      WHERE id = ?
        AND role = 'admin'
      LIMIT 1
    `,
    [adminId],
  );
};

const createAdminRefreshToken = async ({ tokenId, userId, tokenHash }) => {
  await pool.query(
    `
      INSERT INTO ${REFRESH_TOKENS_TABLE} (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY))
    `,
    [tokenId, userId, tokenHash],
  );
};

const getActiveAdminRefreshTokenByHash = async (tokenHash) => {
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

const revokeAdminRefreshTokenByHash = async (tokenHash) => {
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

const revokeAdminRefreshTokenById = async (tokenId) => {
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

const adminAuthModel = {
  createUuid,
  ensureAdminAuthSchemaReady,
  listActiveAdminsWithAccessKeyHash,
  getActiveAdminByUuid,
  updateAdminLastLoginAt,
  createAdminRefreshToken,
  getActiveAdminRefreshTokenByHash,
  revokeAdminRefreshTokenByHash,
  revokeAdminRefreshTokenById,
};

export default adminAuthModel;
