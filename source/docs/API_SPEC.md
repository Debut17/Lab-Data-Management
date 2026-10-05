# API Specification

All responses use JSON. Protected endpoints use the signed `lab_session` HTTP-only cookie. On every protected request the backend reloads the user from MySQL, so a role change or deactivation applies immediately to existing sessions; an inactive or missing user receives `401 UNAUTHENTICATED`.

Roles are `SYSTEM_ADMIN`, `LAB_STAFF`, and `LAB_MEMBER`.

Error responses have this shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Resource data is invalid.",
    "details": [{ "field": "name", "message": "This field is required." }]
  }
}
```

## GET /api/resources

Returns available, non-archived resources that can be selected in the booking form.

Authentication: required. Roles: any authenticated user.

Responses:

- `200` - response `data` is an array ordered by resource name.
- `401 UNAUTHENTICATED` - valid session missing.
- `500 INTERNAL_ERROR` - resources could not be loaded.

## GET /api/bookings/mine

Returns the signed-in member's own bookings and requests in every status (US-5), latest booking period first.

Authentication: required. Role: `LAB_MEMBER`.

The requester is always taken from the session; query parameters cannot select another user. The reviewing administrator's identity (`reviewedBy`) is not returned.

```json
{
  "success": true,
  "data": {
    "bookings": [
      {
        "id": "20000000-0000-4000-8000-000000000001",
        "resourceId": "10000000-0000-4000-8000-000000000001",
        "resourceName": "BX53 Upright Microscope",
        "requesterId": "00000000-0000-4000-8000-000000000002",
        "requesterName": "Local Lab Member",
        "requesterEmail": "member@local.test",
        "startTime": "2026-10-10T02:00:00.000Z",
        "endTime": "2026-10-10T04:00:00.000Z",
        "status": "REJECTED",
        "rejectionReason": "Required training has not been completed.",
        "reviewedAt": "2026-10-05T09:00:00.000Z",
        "createdAt": "2026-10-04T12:00:00.000Z",
        "updatedAt": "2026-10-05T09:00:00.000Z"
      }
    ]
  }
}
```

Responses:

- `200` - bookings returned; the array may be empty.
- `401 UNAUTHENTICATED` - valid session missing.
- `403 FORBIDDEN` - signed-in user is not a Lab Member.
- `500 INTERNAL_ERROR` - bookings could not be loaded; internal details are not exposed.

## POST /api/bookings

Creates a booking request and its audit entry in one MySQL transaction.

Authentication: required. Role: `LAB_MEMBER`.

Content-Type: `application/json`

```json
{
  "resourceId": "10000000-0000-4000-8000-000000000001",
  "startTime": "2026-10-10T02:00:00.000Z",
  "endTime": "2026-10-10T04:00:00.000Z"
}
```

The resource, start time, and end time are required. Times must be valid ISO 8601 values and the end must be after the start. Requester identity and the initial `PENDING` status come only from the authenticated session and server. The conflict check uses approved bookings and the overlap rule `existing.start < requested.end AND existing.end > requested.start`, so adjacent periods are allowed.

Responses:

- `201` - request created; response `data` contains the saved booking with `PENDING` status.
- `401 UNAUTHENTICATED` - valid session missing.
- `403 FORBIDDEN` - signed-in user is not a Lab Member.
- `404 RESOURCE_NOT_FOUND` - selected resource does not exist.
- `409 RESOURCE_UNAVAILABLE` - selected resource is archived or unavailable.
- `409 BOOKING_CONFLICT` - requested period overlaps an approved booking.
- `422 VALIDATION_ERROR` - required fields or the requested time period are invalid.
- `500 INTERNAL_ERROR` - database transaction failed; internal details are not exposed.

## POST /api/resources

Creates a resource record and its audit entry in one MySQL transaction.

Authentication: required. Role: `SYSTEM_ADMIN`.

Content-Type: `application/json`

```json
{
  "name": "BX53 Upright Microscope",
  "category": "Microscope",
  "location": "Lab A, Room 201",
  "description": "Upright microscope for laboratory observation.",
  "responsiblePerson": "Dr. Example",
  "availabilityStatus": "AVAILABLE",
  "currentStatus": "OPERATIONAL",
  "specifications": "LED illumination; brightfield observation"
}
```

`name`, `category`, and `location` are required. Optional text values may be omitted, empty, or `null`. Allowed availability values are `AVAILABLE` and `UNAVAILABLE`; allowed current-status values are `OPERATIONAL`, `MAINTENANCE`, and `OUT_OF_SERVICE`.

Responses:

- `201` - record created; response `data` contains the saved resource.
- `401 UNAUTHENTICATED` - valid session missing.
- `403 FORBIDDEN` - user is not a System Administrator.
- `413 PAYLOAD_TOO_LARGE` - JSON body exceeds 32 KB.
- `422 VALIDATION_ERROR` - fields are missing or invalid.
- `500 INTERNAL_ERROR` - database transaction failed; internal details are not exposed.

## POST /api/resources/extract

Extracts editable resource suggestions from one PDF. It does not persist a resource or write an audit event.

Authentication: required. Role: `SYSTEM_ADMIN`.

Content-Type: `multipart/form-data`; the only field is `file`. The file must use the `.pdf` extension, the `application/pdf` media type, a valid PDF signature, and be no larger than 5 MiB.

Example success response:

```json
{
  "success": true,
  "data": {
    "name": "BX53 Upright Microscope",
    "category": "Microscope",
    "location": "Lab A, Room 201",
    "description": null,
    "responsiblePerson": null,
    "availabilityStatus": "AVAILABLE",
    "currentStatus": "OPERATIONAL",
    "specifications": "Manufacturer: Olympus; Model: BX53"
  }
}
```

Missing or uncertain information is returned as `null`. The frontend applies non-null suggestions only to fields the administrator has not edited. The administrator must explicitly use `POST /api/resources` to save the reviewed record.

Responses:

- `200` - suggestions returned; no record is created.
- `400 PDF_REQUIRED` or `INVALID_UPLOAD` - upload is missing or malformed.
- `401 UNAUTHENTICATED` - valid session missing.
- `403 FORBIDDEN` - user is not a System Administrator.
- `413 PDF_TOO_LARGE` - PDF exceeds 5 MiB.
- `415 UNSUPPORTED_FILE_TYPE` or `INVALID_PDF` - file metadata or signature is invalid.
- `422 PDF_UNREADABLE`, `PDF_TEXT_INVALID`, or `OCR_EMPTY` - the document cannot produce usable text.
- `502 AI_RESPONSE_INVALID` - structured provider output is invalid.
- `503 AI_ASSISTANCE_UNAVAILABLE` - AI is not configured or the gateway/provider is unavailable; manual entry remains available.

The backend first attempts local embedded-text extraction. OCR is invoked only when the extracted text is empty or too short to be useful.

## GET /api/admin/bookings?status=PENDING

Returns pending booking requests in oldest-first order for administrator review.

Authentication: required. Role: `SYSTEM_ADMIN`.

Example success response:

```json
{
  "success": true,
  "data": {
    "bookings": [
      {
        "id": "20000000-0000-4000-8000-000000000001",
        "resourceId": "10000000-0000-4000-8000-000000000001",
        "resourceName": "Confocal Microscope",
        "requesterId": "00000000-0000-4000-8000-000000000002",
        "requesterName": "Local Lab Member",
        "requesterEmail": "member@local.test",
        "startTime": "2026-10-06T12:00:00.000Z",
        "endTime": "2026-10-06T14:00:00.000Z",
        "status": "PENDING",
        "rejectionReason": null,
        "reviewedBy": null,
        "reviewedAt": null,
        "createdAt": "2026-10-04T12:00:00.000Z",
        "updatedAt": "2026-10-04T12:00:00.000Z"
      }
    ]
  }
}
```

Responses:

- `200` - pending requests returned; the array may be empty.
- `401 UNAUTHENTICATED` - valid session missing.
- `403 FORBIDDEN` - user is not a System Administrator.
- `422 VALIDATION_ERROR` - an unsupported status or query field was supplied.
- `500 INTERNAL_ERROR` - requests could not be loaded; internal details are not exposed.

## PATCH /api/admin/bookings/{id}

Applies an administrator decision to a request that is still pending.

Authentication: required. Role: `SYSTEM_ADMIN`.

Approve:

```json
{ "decision": "APPROVE" }
```

Decline:

```json
{
  "decision": "REJECT",
  "reason": "Required training has not been completed."
}
```

The UI calls the second action **Decline**; the API and stored status use `REJECT` and `REJECTED`. A decline comment is required and normalized to 1-1000 characters. The acting administrator is always taken from the signed session rather than the request body.

Approval locks the booking and resource, confirms the request is still pending, and rechecks resource availability, operational status, and approved overlaps. The booking update, `BOOKING_APPROVED` or `BOOKING_REJECTED` audit event, and requester notification are committed in one transaction.

Responses:

- `200` - decision saved; response `data` contains the updated booking.
- `401 UNAUTHENTICATED` - valid session missing.
- `403 FORBIDDEN` - user is not a System Administrator.
- `404 BOOKING_NOT_FOUND` - the booking does not exist.
- `409 BOOKING_ALREADY_DECIDED` - another decision was already saved.
- `409 BOOKING_CONFLICT` - approval is unsafe because availability changed or an approved period overlaps.
- `422 VALIDATION_ERROR` - identifier, decision, or decline comment is invalid.
- `500 INTERNAL_ERROR` - the transaction failed and was rolled back.

## GET /api/admin/users

Lists all users and their current roles, ordered by display name.

Authentication: required. Role: `SYSTEM_ADMIN`.

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "00000000-0000-4000-8000-000000000002",
        "email": "member@local.test",
        "displayName": "Local Lab Member",
        "role": "LAB_MEMBER",
        "isActive": true,
        "createdAt": "2026-10-04T12:00:00.000Z"
      }
    ]
  }
}
```

Responses:

- `200` - users returned.
- `401 UNAUTHENTICATED` - valid session missing.
- `403 FORBIDDEN` - user is not a System Administrator.
- `500 INTERNAL_ERROR` - users could not be loaded.

## PATCH /api/admin/users/{id}/role

Assigns or revokes a user role (US-14).

Authentication: required. Role: `SYSTEM_ADMIN`.

```json
{ "role": "LAB_STAFF" }
```

Each user has one role. Assigning `SYSTEM_ADMIN` or `LAB_STAFF` grants that role; revoking a role returns the user to the base `LAB_MEMBER` role. The role update and its `ROLE_ASSIGNED` or `ROLE_REVOKED` audit entry (entity type `USER`) are committed in one transaction. The acting administrator is taken from the signed session. Administrators cannot change their own role, so at least one administrator always remains.

Responses:

- `200` - role saved; response `data` contains the updated user. The new permissions apply to the user's next request.
- `401 UNAUTHENTICATED` - valid session missing.
- `403 FORBIDDEN` - user is not a System Administrator.
- `404 USER_NOT_FOUND` - the user does not exist.
- `409 SELF_ROLE_CHANGE` - the administrator tried to change their own role.
- `409 ROLE_UNCHANGED` - the user already has the requested role.
- `422 VALIDATION_ERROR` - identifier or role is invalid, or extra fields were supplied.
- `500 INTERNAL_ERROR` - the transaction failed and was rolled back.

## AI gateway routes

The Cloudflare Worker exposes `POST /ocr-resource-document` and `POST /extract-resource`. These are backend integration routes, not browser APIs. Model selection, provider credentials, request limits, output normalization, and provider-error redaction stay in the Worker.

A private/local deployment may require `Authorization: Bearer <AI_GATEWAY_TOKEN>`. A public review deployment omits that token and must have the configured Cloudflare rate-limit binding. The Worker refuses to operate without either backend authentication or the rate limiter.

## Local review authentication

These endpoints exist to exercise role authorization in the clone-and-run environment. `POST /api/auth/dev-login` is unavailable unless `ALLOW_DEV_LOGIN=true`.

### POST /api/auth/dev-login

```json
{ "email": "admin@local.test" }
```

Returns the user and sets an HTTP-only, SameSite=Strict session cookie. It does not return the session token to JavaScript.

### GET /api/auth/session

Returns the currently authenticated user or `401`.

### POST /api/auth/logout

Clears the session cookie.
