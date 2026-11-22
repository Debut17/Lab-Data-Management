import crypto from 'node:crypto';

export const BASE_ROLE = 'LAB_MEMBER';
const DISPLAY_NAME_MAX = 150;

const userRoleErrors = {
  USER_NOT_FOUND: {
    status: 404,
    message: 'The user was not found.',
  },
  ROLE_UNCHANGED: {
    status: 409,
    message: 'The user already has this role.',
  },
};

export class UserRoleError extends Error {
  constructor(code) {
    const definition = userRoleErrors[code];
    if (!definition) {
      throw new TypeError(`Unknown user role error code: ${code}`);
    }
    super(definition.message);
    this.name = 'UserRoleError';
    this.code = code;
    this.status = definition.status;
  }
}

function toIsoString(value) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    isActive: Boolean(row.isActive),
    createdAt: toIsoString(row.createdAt),
  };
}

const userSelect = `
  SELECT id, email, display_name AS displayName, role,
         is_active AS isActive, created_at AS createdAt
  FROM users`;

export function createMySqlUserRepository(pool) {
  return {
    async findByEmail(email) {
      const [rows] = await pool.execute(
        `SELECT id, email, display_name AS displayName, role
         FROM users
         WHERE email = ? AND is_active = TRUE
         LIMIT 1`,
        [email],
      );
      return rows[0] ?? null;
    },

    async findActiveById(id) {
      const [rows] = await pool.execute(
        `SELECT id, email, display_name AS displayName, role
         FROM users
         WHERE id = ? AND is_active = TRUE
         LIMIT 1`,
        [id],
      );
      return rows[0] ?? null;
    },

    async list() {
      const [rows] = await pool.execute(
        `${userSelect}
         ORDER BY display_name ASC, email ASC`,
      );
      return rows.map(mapUser);
    },

    async updateRole(id, role, actorId) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
          `${userSelect}
           WHERE id = ?
           LIMIT 1
           FOR UPDATE`,
          [id],
        );
        const target = rows[0];
        if (!target) {
          throw new UserRoleError('USER_NOT_FOUND');
        }
        if (target.role === role) {
          throw new UserRoleError('ROLE_UNCHANGED');
        }

        const changedAt = new Date();
        const action = role === BASE_ROLE ? 'ROLE_REVOKED' : 'ROLE_ASSIGNED';
        await connection.execute(
          'UPDATE users SET role = ? WHERE id = ?',
          [role, id],
        );
        await connection.execute(
          `INSERT INTO audit_logs (
             acting_user_id, action, entity_type, affected_record_id, changes_json, created_at
           ) VALUES (?, ?, 'USER', ?, ?, ?)`,
          [actorId, action, id, JSON.stringify({
            role: { before: target.role, after: role },
          }), changedAt],
        );
        await connection.commit();

        return mapUser({ ...target, role });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    // US-16: a first Google sign-in creates the account with the base role;
    // administrators grant other roles later. Deactivated accounts get null.
    async findOrCreateGoogleUser({ email, displayName }) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
          `${userSelect}
           WHERE email = ?
           LIMIT 1
           FOR UPDATE`,
          [email],
        );
        const existing = rows[0];
        if (existing) {
          await connection.commit();
          if (!existing.isActive) return null;
          return {
            id: existing.id,
            email: existing.email,
            displayName: existing.displayName,
            role: existing.role,
          };
        }

        const id = crypto.randomUUID();
        const createdAt = new Date();
        const name = (displayName || email).slice(0, DISPLAY_NAME_MAX);
        await connection.execute(
          `INSERT INTO users (id, email, display_name, role, is_active, created_at)
           VALUES (?, ?, ?, ?, TRUE, ?)`,
          [id, email, name, BASE_ROLE, createdAt],
        );
        await connection.execute(
          `INSERT INTO audit_logs (
             acting_user_id, action, entity_type, affected_record_id, changes_json, created_at
           ) VALUES (?, 'USER_CREATED', 'USER', ?, ?, ?)`,
          [id, id, JSON.stringify({
            email: { before: null, after: email },
            role: { before: null, after: BASE_ROLE },
          }), createdAt],
        );
        await connection.commit();

        return { id, email, displayName: name, role: BASE_ROLE };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
  };
}
