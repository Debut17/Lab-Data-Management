# Shared Booking Contract - US-4 and US-12

**Status:** Implemented jointly by US-4 and US-12.

This document records the integration boundary shared by US-4 (submit a booking request) and US-12 (administrator review). Both flows use one booking table, repository, validation module, and API contract.

## Ownership and scope

- US-4 owns booking creation and the initial `PENDING` state.
- US-12 owns listing pending requests and changing a request to `APPROVED` or `REJECTED`.
- US-5/US-6 may read or cancel bookings later, but must reuse this model.
- The authenticated session supplies the requester or reviewer identity. Clients must not choose those identities or set an initial status.
- The database stores timestamps in UTC. API timestamps use ISO 8601 strings with a timezone.

## Canonical database model

This table is implemented in `source/database/schema.sql`. Keep these column and enum names stable across US-4 and US-12.

```sql
CREATE TABLE IF NOT EXISTS bookings (
  id CHAR(36) PRIMARY KEY,
  resource_id CHAR(36) NOT NULL,
  requester_id CHAR(36) NOT NULL,
  start_time DATETIME(3) NOT NULL,
  end_time DATETIME(3) NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')
    NOT NULL DEFAULT 'PENDING',
  rejection_reason VARCHAR(1000) NULL,
  reviewed_by CHAR(36) NULL,
  reviewed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_bookings_resource
    FOREIGN KEY (resource_id) REFERENCES resources(id),
  CONSTRAINT fk_bookings_requester
    FOREIGN KEY (requester_id) REFERENCES users(id),
  CONSTRAINT fk_bookings_reviewer
    FOREIGN KEY (reviewed_by) REFERENCES users(id),
  CONSTRAINT chk_bookings_period CHECK (start_time < end_time),
  INDEX idx_bookings_pending (status, created_at),
  INDEX idx_bookings_resource_period
    (resource_id, status, start_time, end_time),
  INDEX idx_bookings_requester (requester_id, created_at)
);
```

An approved booking is the reservation for its resource and period; do not create a second reservation record unless this contract is deliberately revised by the team.

## State rules

Allowed transitions are:

```text
US-4:  new request -> PENDING
US-12: PENDING -> APPROVED
US-12: PENDING -> REJECTED
US-6:  PENDING or APPROVED -> CANCELLED, subject to SRS-5 rules
```

- A final decision can be applied only while the stored status is `PENDING`.
- Rejection requires a non-blank reason, `reviewed_by`, and `reviewed_at`.
- Approval requires `reviewed_by` and `reviewed_at`; `rejection_reason` remains `NULL`.
- Repeating or racing a decision against a non-pending request returns `409 BOOKING_ALREADY_DECIDED`.
- Status comparison is case-sensitive at the application boundary and uses the uppercase values above.

## US-4 creation API

`POST /api/bookings`

Authentication: required. Role: `LAB_MEMBER`.

Request:

```json
{
  "resourceId": "UUID",
  "startTime": "2026-10-10T02:00:00.000Z",
  "endTime": "2026-10-10T04:00:00.000Z"
}
```

The server obtains `requesterId` from the authenticated session and always creates the request as `PENDING`. It rejects an invalid period, an unavailable resource, or an overlap with an existing `APPROVED` booking.

Success: `201 Created` with `{ "success": true, "data": { ...booking } }`.

## US-12 pending-list API

`GET /api/admin/bookings?status=PENDING`

Authentication: required. Role: `SYSTEM_ADMIN`.

Return pending requests in oldest-first order. Each item includes the booking ID, period, status and creation time, plus the requester identity and resource name needed for review. Do not expose unrelated user data.

Success: `200 OK` with `{ "success": true, "data": { "bookings": [] } }`.

## US-12 decision API

`PATCH /api/admin/bookings/{id}`

Authentication: required. Role: `SYSTEM_ADMIN`.

Approve request:

```json
{ "decision": "APPROVE" }
```

Reject request:

```json
{
  "decision": "REJECT",
  "reason": "Required training has not been completed."
}
```

The server obtains `reviewedBy` from the authenticated session. A rejection reason is required only for `REJECT` and must contain 1-1000 non-whitespace characters.

Success: `200 OK` with `{ "success": true, "data": { ...updatedBooking } }`.

Expected errors:

- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`
- `404 BOOKING_NOT_FOUND`
- `409 BOOKING_ALREADY_DECIDED`
- `409 BOOKING_CONFLICT` when approval is no longer safe
- `422 VALIDATION_ERROR`

## Approval concurrency rule

Approval must execute as one MySQL transaction:

1. Lock the target booking row and verify it is still `PENDING`.
2. Lock the associated resource row to serialize approvals for that resource.
3. Verify that the resource is available and operational.
4. Check for an existing `APPROVED` overlap using:

   ```sql
   existing.start_time < requested_end
   AND existing.end_time > requested_start
   ```

5. Update the booking decision and reviewer fields.
6. Insert the `BOOKING_APPROVED` or `BOOKING_REJECTED` audit entry with `entity_type = 'BOOKING'`.
7. Persist or enqueue the requester notification required by SRS-7.
8. Commit. Any failure rolls back the complete decision.

US-4 may perform an early overlap check for a friendly submission error, but US-12 must check again during approval because availability may have changed.

## Change protocol

If implementation reveals a necessary change:

1. Update this contract first.
2. Update schema, backend, frontend, tests, and API documentation in the same branch or coordinated changes.
3. Tell the owners of US-4 and US-12 what changed before merging.

Do not silently introduce aliases or a second booking table to avoid resolving a contract mismatch.
