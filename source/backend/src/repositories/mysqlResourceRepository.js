import crypto from 'node:crypto';

export function createMySqlResourceRepository(pool) {
  return {
    async create(resource, actorId) {
      const connection = await pool.getConnection();
      const id = crypto.randomUUID();
      const createdAt = new Date();

      try {
        await connection.beginTransaction();
        await connection.execute(
          `INSERT INTO resources (
             id, name, category, location, description, responsible_person,
             availability_status, current_status, specifications, archived,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, ?, ?)`,
          [
            id,
            resource.name,
            resource.category,
            resource.location,
            resource.description,
            resource.responsiblePerson,
            resource.availabilityStatus,
            resource.currentStatus,
            resource.specifications,
            createdAt,
            createdAt,
          ],
        );
        await connection.execute(
          `INSERT INTO audit_logs (
             acting_user_id, action, entity_type, affected_record_id, created_at
           ) VALUES (?, 'RESOURCE_CREATED', 'RESOURCE', ?, ?)`,
          [actorId, id, createdAt],
        );
        await connection.commit();

        return {
          id,
          ...resource,
          archived: false,
          createdAt: createdAt.toISOString(),
          updatedAt: createdAt.toISOString(),
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
  };
}
