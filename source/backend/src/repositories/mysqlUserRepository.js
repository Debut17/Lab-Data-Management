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
  };
}
