import crypto from 'node:crypto';

export class ResourceAvailabilityError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'ResourceAvailabilityError';
    this.code = code;
    this.status = status;
  }
}

export class ResourceArchiveError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'ResourceArchiveError';
    this.code = code;
    this.status = status;
  }
}

export class ResourceUpdateError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'ResourceUpdateError';
    this.code = code;
    this.status = status;
  }
}

const resourceSummarySelect = `SELECT id, name, category, location,
  description, responsible_person AS responsiblePerson,
  availability_status AS availabilityStatus,
  current_status AS currentStatus,
  specifications, archived
  FROM resources`;

function mapResourceSummary(row) {
  return { ...row, archived: Boolean(row.archived) };
}

export function createMySqlResourceRepository(pool) {
  return {
    async listForAdministrator() {
      const [rows] = await pool.execute(
        `${resourceSummarySelect} ORDER BY name ASC, id ASC`,
      );
      return rows.map(mapResourceSummary);
    },

    async update(id, resource, actorId) {
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
          `${resourceSummarySelect} WHERE id = ? FOR UPDATE`,
          [id],
        );

        const target = rows[0];

        if (!target) {
          throw new ResourceUpdateError(
            'RESOURCE_NOT_FOUND',
            404,
            'The resource was not found.',
          );
        }

        if (target.archived) {
          throw new ResourceUpdateError(
            'RESOURCE_ARCHIVED',
            409,
            'Archived resources cannot be edited.',
          );
        }

        const fields = [
          'name',
          'category',
          'location',
          'description',
          'responsiblePerson',
          'availabilityStatus',
          'currentStatus',
          'specifications',
        ];

        const changes = {};

        for (const field of fields) {
          if (target[field] !== resource[field]) {
            changes[field] = {
              before: target[field],
              after: resource[field],
            };
          }
        }

        if (Object.keys(changes).length > 0) {
          const changedAt = new Date();

          await connection.execute(
            `UPDATE resources
             SET name = ?,
                 category = ?,
                 location = ?,
                 description = ?,
                 responsible_person = ?,
                 availability_status = ?,
                 current_status = ?,
                 specifications = ?,
                 updated_at = ?
             WHERE id = ?`,
            [
              resource.name,
              resource.category,
              resource.location,
              resource.description,
              resource.responsiblePerson,
              resource.availabilityStatus,
              resource.currentStatus,
              resource.specifications,
              changedAt,
              id,
            ],
          );

          await connection.execute(
            `INSERT INTO audit_logs (
              acting_user_id,
              action,
              entity_type,
              affected_record_id,
              changes_json,
              created_at
            ) VALUES (?, 'RESOURCE_UPDATED', 'RESOURCE', ?, ?, ?)`,
            [
              actorId,
              id,
              JSON.stringify(changes),
              changedAt,
            ],
          );
        }

        await connection.commit();

        return mapResourceSummary({
          ...target,
          ...resource,
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async updateAvailability(id, availabilityStatus, actorId) {
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
          `${resourceSummarySelect} WHERE id = ? FOR UPDATE`,
          [id],
        );

        const target = rows[0];

        if (!target) {
          throw new ResourceAvailabilityError(
            'RESOURCE_NOT_FOUND',
            404,
            'The resource was not found.',
          );
        }

        if (target.archived) {
          throw new ResourceAvailabilityError(
            'RESOURCE_ARCHIVED',
            409,
            'Archived resources cannot have their availability changed.',
          );
        }

        if (target.availabilityStatus !== availabilityStatus) {
          const changedAt = new Date();

          await connection.execute(
            'UPDATE resources SET availability_status = ?, updated_at = ? WHERE id = ?',
            [availabilityStatus, changedAt, id],
          );

          await connection.execute(
            `INSERT INTO audit_logs (
              acting_user_id,
              action,
              entity_type,
              affected_record_id,
              changes_json,
              created_at
            ) VALUES (?, 'RESOURCE_AVAILABILITY_CHANGED', 'RESOURCE', ?, ?, ?)`,
            [
              actorId,
              id,
              JSON.stringify({
                availabilityStatus: {
                  before: target.availabilityStatus,
                  after: availabilityStatus,
                },
              }),
              changedAt,
            ],
          );
        }

        await connection.commit();

        return mapResourceSummary({
          ...target,
          availabilityStatus,
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async archive(id, actorId) {
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
          `${resourceSummarySelect} WHERE id = ? FOR UPDATE`,
          [id],
        );

        const target = rows[0];

        if (!target) {
          throw new ResourceArchiveError(
            'RESOURCE_NOT_FOUND',
            404,
            'The resource was not found.',
          );
        }

        if (target.archived) {
          throw new ResourceArchiveError(
            'RESOURCE_ALREADY_ARCHIVED',
            409,
            'This resource is already archived.',
          );
        }

        const changedAt = new Date();

        const [activeBookings] = await connection.execute(
          `SELECT COUNT(*) AS total
           FROM bookings
           WHERE resource_id = ?
             AND status IN ('PENDING', 'APPROVED')
             AND end_time > ?`,
          [id, changedAt],
        );

        const total = Number(activeBookings[0]?.total ?? 0);

        if (total > 0) {
          throw new ResourceArchiveError(
            'RESOURCE_HAS_ACTIVE_BOOKINGS',
            409,
            `This resource has ${total} pending or upcoming booking${total === 1 ? '' : 's'}. Decline or cancel them before archiving.`,
          );
        }

        await connection.execute(
          'UPDATE resources SET archived = TRUE, updated_at = ? WHERE id = ?',
          [changedAt, id],
        );

        await connection.execute(
          `INSERT INTO audit_logs (
            acting_user_id,
            action,
            entity_type,
            affected_record_id,
            changes_json,
            created_at
          ) VALUES (?, 'RESOURCE_ARCHIVED', 'RESOURCE', ?, ?, ?)`,
          [
            actorId,
            id,
            JSON.stringify({
              archived: {
                before: false,
                after: true,
              },
            }),
            changedAt,
          ],
        );

        await connection.commit();

        return mapResourceSummary({
          ...target,
          archived: true,
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async listForMembers() {
      const [rows] = await pool.execute(
        `SELECT
          id, name, category, location,
          availability_status AS availabilityStatus,
          current_status AS currentStatus
        FROM resources
        WHERE archived = FALSE
        ORDER BY name ASC, id ASC`,
      );

      return rows;
    },

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
            acting_user_id,
            action,
            entity_type,
            affected_record_id,
            changes_json,
            created_at
          ) VALUES (?, 'RESOURCE_CREATED', 'RESOURCE', ?, ?, ?)`,
          [
            actorId,
            id,
            JSON.stringify({
              name: {
                before: null,
                after: resource.name,
              },
              category: {
                before: null,
                after: resource.category,
              },
              location: {
                before: null,
                after: resource.location,
              },
              availabilityStatus: {
                before: null,
                after: resource.availabilityStatus,
              },
              currentStatus: {
                before: null,
                after: resource.currentStatus,
              },
              archived: {
                before: null,
                after: false,
              },
            }),
            createdAt,
          ],
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