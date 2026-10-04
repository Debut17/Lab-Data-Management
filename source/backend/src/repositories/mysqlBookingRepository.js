import crypto from 'node:crypto';

export class BookingRepositoryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BookingRepositoryError';
    this.code = code;
  }
}

export function createMySqlBookingRepository(pool) {
  return {
    async create(booking, requesterId) {
      const connection = await pool.getConnection();
      const id = crypto.randomUUID();
      const startTime = new Date(booking.startTime);
      const endTime = new Date(booking.endTime);
      const createdAt = new Date();

      try {
        await connection.beginTransaction();

        const [resources] = await connection.execute(
          `SELECT id, name, availability_status AS availabilityStatus, archived
           FROM resources
           WHERE id = ?
           FOR UPDATE`,
          [booking.resourceId],
        );
        const resource = resources[0];

        if (!resource) {
          throw new BookingRepositoryError(
            'RESOURCE_NOT_FOUND',
            'The selected resource does not exist.',
          );
        }
        if (Boolean(resource.archived) || resource.availabilityStatus !== 'AVAILABLE') {
          throw new BookingRepositoryError(
            'RESOURCE_UNAVAILABLE',
            'The selected resource is currently unavailable.',
          );
        }

        const [conflicts] = await connection.execute(
          `SELECT id
           FROM bookings
           WHERE resource_id = ?
             AND status = 'APPROVED'
             AND start_time < ?
             AND end_time > ?
           LIMIT 1`,
          [booking.resourceId, endTime, startTime],
        );

        if (conflicts.length > 0) {
          throw new BookingRepositoryError(
            'BOOKING_CONFLICT',
            'The resource already has an approved booking during that time.',
          );
        }

        await connection.execute(
          `INSERT INTO bookings (
             id, resource_id, requester_id, start_time, end_time, status,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
          [id, booking.resourceId, requesterId, startTime, endTime, createdAt, createdAt],
        );
        await connection.execute(
          `INSERT INTO audit_logs (
             acting_user_id, action, entity_type, affected_record_id, created_at
           ) VALUES (?, 'BOOKING_REQUESTED', 'BOOKING', ?, ?)`,
          [requesterId, id, createdAt],
        );
        await connection.commit();

        return {
          id,
          resourceId: booking.resourceId,
          resourceName: resource.name,
          requesterId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          status: 'PENDING',
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
