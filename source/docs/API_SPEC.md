# API Specification

All responses use JSON. Protected endpoints use the signed `lab_session` HTTP-only cookie. Error responses have this shape:

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
