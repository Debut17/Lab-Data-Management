import crypto from 'node:crypto';

export class ResourceReportError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'ResourceReportError';
    this.code = code;
    this.status = status;
  }
}

export function createMySqlResourceReportRepository(pool) {
  return {
    async create(report, reporterId) {
      const connection = await pool.getConnection();
      const id = crypto.randomUUID();
      const submittedAt = new Date();

      try {
        await connection.beginTransaction();
        const [resources] = await connection.execute(
          'SELECT id, name, archived FROM resources WHERE id = ? FOR UPDATE',
          [report.resourceId],
        );
        const resource = resources[0];
        if (!resource) {
          throw new ResourceReportError('RESOURCE_NOT_FOUND', 404,
            'The selected resource does not exist.');
        }
        if (resource.archived) {
          throw new ResourceReportError('RESOURCE_ARCHIVED', 409,
            'The selected resource has been archived. Refresh the resource list.');
        }

        const [reporters] = await connection.execute(
          'SELECT display_name AS displayName FROM users WHERE id = ?',
          [reporterId],
        );
        const reporterName = reporters[0].displayName;

        await connection.execute(
          `INSERT INTO resource_reports
             (id, resource_id, problem_type, description, reporter_id, submitted_at, status)
           VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
          [id, report.resourceId, report.problemType, report.description, reporterId, submittedAt],
        );

        // Each active administrator receives a personal, persistent notification.
        const [notificationResult] = await connection.execute(
          `INSERT INTO notifications
             (recipient_user_id, event_type, entity_type, entity_id, message, created_at)
           SELECT id, 'RESOURCE_PROBLEM_REPORTED', 'RESOURCE_REPORT', ?, ?, ?
           FROM users WHERE role = 'SYSTEM_ADMIN' AND is_active = TRUE`,
          [id, `A resource problem was reported for ${resource.name}.`, submittedAt],
        );
        if (notificationResult.affectedRows === 0) {
          throw new ResourceReportError('ADMINISTRATOR_UNAVAILABLE', 503,
            'No active administrator can be notified. Please try again later.');
        }

        await connection.execute(
          `INSERT INTO audit_logs
             (acting_user_id, action, entity_type, affected_record_id, changes_json, created_at)
           VALUES (?, 'RESOURCE_PROBLEM_REPORTED', 'RESOURCE_REPORT', ?, ?, ?)`,
          [reporterId, id, JSON.stringify({
            resourceId: { before: null, after: report.resourceId },
            problemType: { before: null, after: report.problemType },
            description: { before: null, after: report.description },
            status: { before: null, after: 'PENDING' },
          }), submittedAt],
        );
        await connection.commit();

        return {
          id,
          resourceId: report.resourceId,
          resourceName: resource.name,
          problemType: report.problemType,
          description: report.description,
          reporterId,
          reporterName,
          submittedAt: submittedAt.toISOString(),
          status: 'PENDING',
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

    async listNotifications(recipientId) {
      const [rows] = await pool.execute(
        `SELECT n.id, n.message, n.is_read AS isRead, n.created_at AS createdAt,
                p.id AS reportId, p.resource_id AS resourceId, r.name AS resourceName,
                p.problem_type AS problemType, p.description, p.reporter_id AS reporterId,
                u.display_name AS reporterName, u.email AS reporterEmail,
                p.submitted_at AS submittedAt, p.status
         FROM notifications n
         JOIN resource_reports p ON p.id = n.entity_id
         JOIN resources r ON r.id = p.resource_id
         JOIN users u ON u.id = p.reporter_id
         WHERE n.recipient_user_id = ? AND n.event_type = 'RESOURCE_PROBLEM_REPORTED'
           AND n.entity_type = 'RESOURCE_REPORT'
         ORDER BY n.is_read ASC, n.created_at DESC, n.id DESC
         LIMIT 100`,
        [recipientId],
      );
      return rows.map((row) => ({
        ...row,
        id: String(row.id),
        isRead: Boolean(row.isRead),
        createdAt: new Date(row.createdAt).toISOString(),
        submittedAt: new Date(row.submittedAt).toISOString(),
      }));
    },

    async markNotificationRead(id, recipientId) {
      // Ownership and event type prevent access to another user's notifications.
      const [result] = await pool.execute(
        `UPDATE notifications SET is_read = TRUE
         WHERE id = ? AND recipient_user_id = ?
           AND event_type = 'RESOURCE_PROBLEM_REPORTED' AND entity_type = 'RESOURCE_REPORT'`,
        [id, recipientId],
      );
      if (result.affectedRows === 0) {
        throw new ResourceReportError('NOTIFICATION_NOT_FOUND', 404,
          'The resource problem notification was not found.');
      }
      return { id, isRead: true };
    },
  };
}
