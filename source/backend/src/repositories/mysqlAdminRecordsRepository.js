const BOOKING_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const USER_ROLES = ['SYSTEM_ADMIN', 'LAB_STAFF', 'LAB_MEMBER'];
const BOOKING_LIST_LIMIT = 200;

function toIsoString(value) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function countBy(rows, key, keys) {
  const counts = Object.fromEntries(keys.map((name) => [name, 0]));
  for (const row of rows) {
    counts[row[key]] = Number(row.total);
  }
  return counts;
}

export function createMySqlAdminRecordsRepository(pool) {
  // Issue reports are owned by US-7. Until that table exists the summary
  // reports them as unavailable instead of failing the whole page.
  async function issueReportCounts() {
    const [tables] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'issue_reports'`,
    );
    if (Number(tables[0]?.total ?? 0) === 0) {
      return null;
    }
    try {
      const [rows] = await pool.execute(
        'SELECT status, COUNT(*) AS total FROM issue_reports GROUP BY status',
      );
      const byStatus = Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
      const total = rows.reduce((sum, row) => sum + Number(row.total), 0);
      return { total, byStatus };
    } catch {
      return null;
    }
  }

  return {
    async summary(now = new Date()) {
      const [[resourceRows], [bookingRows], [userRows], [auditRows]] = await Promise.all([
        pool.execute(
          `SELECT
             COUNT(*) AS total,
             SUM(archived = FALSE) AS active,
             SUM(archived = TRUE) AS archived,
             SUM(archived = FALSE AND availability_status = 'UNAVAILABLE') AS unavailable
           FROM resources`,
        ),
        pool.execute('SELECT status, COUNT(*) AS total FROM bookings GROUP BY status'),
        pool.execute(
          `SELECT role, COUNT(*) AS total
           FROM users
           WHERE is_active = TRUE
           GROUP BY role`,
        ),
        pool.execute(
          `SELECT COUNT(*) AS total, SUM(created_at >= ?) AS lastSevenDays
           FROM audit_logs`,
          [new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)],
        ),
      ]);
      const resources = resourceRows[0] ?? {};
      const bookingsByStatus = countBy(bookingRows, 'status', BOOKING_STATUSES);
      const usersByRole = countBy(userRows, 'role', USER_ROLES);

      return {
        resources: {
          total: Number(resources.total ?? 0),
          active: Number(resources.active ?? 0),
          archived: Number(resources.archived ?? 0),
          unavailable: Number(resources.unavailable ?? 0),
        },
        bookings: {
          total: Object.values(bookingsByStatus).reduce((sum, value) => sum + value, 0),
          byStatus: bookingsByStatus,
        },
        users: {
          total: Object.values(usersByRole).reduce((sum, value) => sum + value, 0),
          byRole: usersByRole,
        },
        issueReports: await issueReportCounts(),
        auditLogs: {
          total: Number(auditRows[0]?.total ?? 0),
          lastSevenDays: Number(auditRows[0]?.lastSevenDays ?? 0),
        },
      };
    },

    async listBookings({ status }) {
      const filter = status === 'ALL' ? '' : 'WHERE b.status = ?';
      const [rows] = await pool.execute(
        `SELECT
           b.id,
           r.name AS resourceName,
           r.archived AS resourceArchived,
           u.display_name AS requesterName,
           u.email AS requesterEmail,
           b.start_time AS startTime,
           b.end_time AS endTime,
           b.status,
           b.rejection_reason AS rejectionReason,
           reviewer.display_name AS reviewerName,
           b.reviewed_at AS reviewedAt,
           b.created_at AS createdAt
         FROM bookings b
         INNER JOIN resources r ON r.id = b.resource_id
         INNER JOIN users u ON u.id = b.requester_id
         LEFT JOIN users reviewer ON reviewer.id = b.reviewed_by
         ${filter}
         ORDER BY b.created_at DESC, b.id DESC
         LIMIT ${BOOKING_LIST_LIMIT}`,
        status === 'ALL' ? [] : [status],
      );
      return rows.map((row) => ({
        id: row.id,
        resourceName: row.resourceName,
        resourceArchived: Boolean(row.resourceArchived),
        requesterName: row.requesterName,
        requesterEmail: row.requesterEmail,
        startTime: toIsoString(row.startTime),
        endTime: toIsoString(row.endTime),
        status: row.status,
        rejectionReason: row.rejectionReason ?? null,
        reviewerName: row.reviewerName ?? null,
        reviewedAt: toIsoString(row.reviewedAt),
        createdAt: toIsoString(row.createdAt),
      }));
    },
  };
}
