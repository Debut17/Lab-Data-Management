import crypto from 'node:crypto';

const bookingDecisionErrors = {
  BOOKING_NOT_FOUND: {
    status: 404,
    message: 'The booking request was not found.',
  },
  BOOKING_ALREADY_DECIDED: {
    status: 409,
    message: 'This booking request has already been reviewed.',
  },
  BOOKING_CONFLICT: {
    status: 409,
    message: 'This booking can no longer be approved because the resource is unavailable or the requested period conflicts with an approved booking.',
  },
};

export class BookingRepositoryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BookingRepositoryError';
    this.code = code;
  }
}

export class BookingDecisionError extends Error {
  constructor(code) {
    const definition = bookingDecisionErrors[code];
    if (!definition) {
      throw new TypeError(`Unknown booking decision error code: ${code}`);
    }
    super(definition.message);
    this.name = 'BookingDecisionError';
    this.code = code;
    this.status = definition.status;
  }
}

function toIsoString(value) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapBooking(row) {
  return {
    id: row.id,
    resourceId: row.resourceId,
    resourceName: row.resourceName,
    requesterId: row.requesterId,
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    startTime: toIsoString(row.startTime),
    endTime: toIsoString(row.endTime),
    status: row.status,
    rejectionReason: row.rejectionReason ?? null,
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: toIsoString(row.reviewedAt),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

const bookingSelect = `
  SELECT
    b.id,
    b.resource_id AS resourceId,
    r.name AS resourceName,
    b.requester_id AS requesterId,
    u.display_name AS requesterName,
    u.email AS requesterEmail,
    b.start_time AS startTime,
    b.end_time AS endTime,
    b.status,
    b.rejection_reason AS rejectionReason,
    b.reviewed_by AS reviewedBy,
    b.reviewed_at AS reviewedAt,
    b.created_at AS createdAt,
    b.updated_at AS updatedAt
  FROM bookings b
  INNER JOIN resources r ON r.id = b.resource_id
  INNER JOIN users u ON u.id = b.requester_id`;

function notificationMessage(target, decision) {
  if (decision.decision === 'APPROVE') {
    return `Your booking request for ${target.resourceName} was approved.`;
  }
  return `Your booking request for ${target.resourceName} was rejected. Reason: ${decision.reason}`;
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

    async listPending() {
      const [rows] = await pool.execute(
        `${bookingSelect}
         WHERE b.status = 'PENDING'
         ORDER BY b.created_at ASC`,
      );
      return rows.map(mapBooking);
    },

    async decide(id, decision, reviewerId) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [bookingRows] = await connection.execute(
          `${bookingSelect}
           WHERE b.id = ?
           LIMIT 1
           FOR UPDATE`,
          [id],
        );
        const target = bookingRows[0];
        if (!target) {
          throw new BookingDecisionError('BOOKING_NOT_FOUND');
        }
        if (target.status !== 'PENDING') {
          throw new BookingDecisionError('BOOKING_ALREADY_DECIDED');
        }

        if (decision.decision === 'APPROVE') {
          const [resourceRows] = await connection.execute(
            `SELECT availability_status AS availabilityStatus,
                    current_status AS currentStatus,
                    archived
             FROM resources
             WHERE id = ?
             LIMIT 1
             FOR UPDATE`,
            [target.resourceId],
          );
          const resource = resourceRows[0];
          if (
            !resource
            || Boolean(resource.archived)
            || resource.availabilityStatus !== 'AVAILABLE'
            || resource.currentStatus !== 'OPERATIONAL'
          ) {
            throw new BookingDecisionError('BOOKING_CONFLICT');
          }

          const [overlaps] = await connection.execute(
            `SELECT id
             FROM bookings
             WHERE resource_id = ?
               AND status = 'APPROVED'
               AND id <> ?
               AND start_time < ?
               AND end_time > ?
             LIMIT 1
             FOR UPDATE`,
            [target.resourceId, id, target.endTime, target.startTime],
          );
          if (overlaps.length > 0) {
            throw new BookingDecisionError('BOOKING_CONFLICT');
          }
        }

        const reviewedAt = new Date();
        const status = decision.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        await connection.execute(
          `UPDATE bookings
           SET status = ?, rejection_reason = ?, reviewed_by = ?,
               reviewed_at = ?, updated_at = ?
           WHERE id = ? AND status = 'PENDING'`,
          [status, decision.reason, reviewerId, reviewedAt, reviewedAt, id],
        );
        await connection.execute(
          `INSERT INTO audit_logs (
             acting_user_id, action, entity_type, affected_record_id, created_at
           ) VALUES (?, ?, 'BOOKING', ?, ?)`,
          [reviewerId, `BOOKING_${status}`, id, reviewedAt],
        );
        await connection.execute(
          `INSERT INTO notifications (
             recipient_user_id, event_type, entity_type, entity_id, message,
             created_at
           ) VALUES (?, 'BOOKING_STATUS_CHANGED', 'BOOKING', ?, ?, ?)`,
          [target.requesterId, id, notificationMessage(target, decision), reviewedAt],
        );
        await connection.commit();

        return mapBooking({
          ...target,
          status,
          rejectionReason: decision.reason,
          reviewedBy: reviewerId,
          reviewedAt,
          updatedAt: reviewedAt,
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
  };
}
