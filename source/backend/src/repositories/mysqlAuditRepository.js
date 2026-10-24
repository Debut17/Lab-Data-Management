function mapAuditLog(row) {
  return {
    id: String(row.id),
    actorId: row.actorId,
    actorName: row.actorName,
    action: row.action,
    entityType: row.entityType,
    affectedRecordId: row.affectedRecordId,
    changes: typeof row.changesJson === 'string'
      ? JSON.parse(row.changesJson)
      : row.changesJson ?? null,
    createdAt: row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : new Date(row.createdAt).toISOString(),
  };
}

export function createMySqlAuditRepository(pool) {
  return {
    async list({ page, limit }) {
      const [rows] = await pool.execute(
        `SELECT
           a.id,
           a.acting_user_id AS actorId,
           u.display_name AS actorName,
           a.action,
           a.entity_type AS entityType,
           a.affected_record_id AS affectedRecordId,
           a.changes_json AS changesJson,
           a.created_at AS createdAt
         FROM audit_logs a
         JOIN users u ON u.id = a.acting_user_id
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ? OFFSET ?`,
        [limit + 1, (page - 1) * limit],
      );
      return {
        auditLogs: rows.slice(0, limit).map(mapAuditLog),
        hasMore: rows.length > limit,
      };
    },
  };
}
