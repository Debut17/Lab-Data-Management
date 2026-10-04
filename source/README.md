# Lab Data Management - Resource and Booking Administration

## Submit a booking request (US-4)

An authenticated Lab Member can select an available, non-archived resource and submit a start and end time. The backend validates the request, rejects unavailable resources or periods that overlap an approved booking, and saves a valid request for the signed-in member with `PENDING` status. Booking creation and its audit event are committed in one MySQL transaction.

For local review, open <http://localhost:3000> and choose **Sign in as Lab Member**. The seeded microscope and centrifuge can be used to exercise the booking form.

The frontend sends times as ISO 8601 values. The backend stores them in UTC and treats booking periods as half-open intervals: a booking ending exactly when another begins does not overlap.

## Create a resource (US-8)

An authenticated System Administrator can create a laboratory resource manually or ask the system to extract suggestions from a PDF. PDF processing first reads an embedded text layer locally. If usable text is not present, the backend sends the document to the narrow Typhoon OCR route. Typhoon 30B then converts the extracted text to the supported resource fields.

AI output never creates a record. Suggested fields are visibly marked, remain editable, do not overwrite fields already edited by the administrator, and are saved only after the administrator selects **Create Resource**. The regular create API performs server validation, writes to MySQL, and records the audit event in the same transaction.

US-12 provides a separate **Booking Requests** view for System Administrators. It lists pending requests, shows the requester, resource, and requested period, and provides **Approve** and **Decline** actions. Declining requires an administrator comment. Approval locks and rechecks the resource and existing approved periods before the decision, audit entry, and requester notification are committed in one transaction.

## Run locally with Docker

Requirements: Docker Desktop with Docker Compose.

```bash
cd source
docker compose up --build
```

Open <http://localhost:3000> and choose the role needed for the flow being reviewed. Lab Members can submit booking requests. System Administrators can use the navigation button to switch between **Create Resource** and **Booking Requests**. A fresh local database contains two synthetic pending requests for review.

Manual creation is available even when AI assistance is not configured. If the PDF route is unavailable, the UI reports the failure and keeps the form usable.

The Compose setup enables a local-review login endpoint and seeds these identities:

- `admin@local.test` - System Administrator; can create resources and review pending bookings.
- `member@local.test` - Lab Member; can submit booking requests.

Local review authentication is enabled only through `ALLOW_DEV_LOGIN=true` in Compose. Disable it outside local development and connect the project's production identity provider. Browser sessions are stored in signed, HTTP-only, SameSite cookies; no access token is stored in browser JavaScript.

The default database password is for isolated local development only. Runtime `.env` files and Worker `.dev.vars` files are deliberately ignored and are not distributed to reviewers.

AI requests use the shared Worker at <https://lab-data-management-ai-gateway.triple-t-lab-data.workers.dev>. The Typhoon key remains in Cloudflare Worker Secrets and is never sent to the browser, backend container, clone, or Git repository.

## Deploy the shared review Worker

A shared Worker lets reviewers clone the repository and use AI without receiving the Typhoon key or any environment template. Deployment is a one-time maintainer action and requires access to the team's Cloudflare account:

```bash
cd source/ai-gateway
npm ci
npx wrangler login
npx wrangler secret put TYPHOON_API_KEY
npx wrangler deploy
```

Do not configure `AI_GATEWAY_TOKEN` on the public review Worker. It accepts only the two fixed routes, validates and limits inputs, fixes the Typhoon models server-side, removes provider error details, and uses the Cloudflare `AI_RATE_LIMITER` binding at 20 requests per 60 seconds for each route and connecting address.

The deployed HTTPS URL is the default `AI_GATEWAY_URL` in `docker-compose.yml`. Reviewers need only `docker compose up --build`; no Typhoon key or local AI configuration is required.

Never commit `.env`, `.dev.vars`, an environment example, or a provider key. Rotate any API key that has been exposed outside the intended Cloudflare secret store before production use.

Stop the application with:

```bash
docker compose down
```

The database initialization scripts run only when MySQL creates a new data volume. If an older local volume predates the integrated US-4/US-12 schema, recreate that disposable local volume before reviewing the booking flow.

To also remove local MySQL data, run `docker compose down --volumes` only when that data is no longer needed.

## Run automated checks

Node.js 22 or newer is required.

```bash
cd backend
npm ci
npm run test:coverage

cd ../frontend
npm ci
npm run test:coverage
npm run build

cd ../ai-gateway
npm ci
npm run test:coverage
npm run check
```

The CI workflow runs backend, frontend, and AI gateway coverage checks, then builds the frontend and performs a Worker deployment dry-run.

## US-8 architecture

```text
Admin uploads PDF
        |
        v
Backend extracts embedded PDF text
        | no usable text
        v
Typhoon OCR through the AI Worker
        |
        v
Typhoon 30B structured suggestions
        |
        v
Editable form with AI-suggested markers
        |
        v
Admin reviews and selects Create Resource
        |
        v
POST /api/resources -> authorization -> validation
        -> MySQL transaction (resource + audit log)
```

Required resource fields are `name`, `category`, and `location`, matching SRS-10. Description, responsible person, availability, operational status, and specifications are also supported.

## US-12 architecture

```text
Admin opens Booking Requests
        |
        v
GET /api/admin/bookings?status=PENDING
        -> authentication + SYSTEM_ADMIN authorization
        -> pending bookings with requester/resource details
        |
        v
Admin chooses Approve or Decline
        | Decline requires an administrator comment
        v
PATCH /api/admin/bookings/{id}
        -> validate decision and lock pending booking
        -> lock resource and recheck overlap for approval
        -> update status + audit log + requester notification
        -> commit one MySQL transaction
```

The US-4 creation flow and US-12 administrator-review flow share the repository and schema defined in [`docs/BOOKING_CONTRACT.md`](docs/BOOKING_CONTRACT.md).
