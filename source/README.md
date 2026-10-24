# Lab Data Management - Resource and Booking Administration

## Submit a booking request (US-4)

An authenticated Lab Member can select an available, non-archived resource and submit a start and end time. The backend validates the request, rejects unavailable resources or periods that overlap an approved booking, and saves a valid request for the signed-in member with `PENDING` status. Booking creation and its audit event are committed in one MySQL transaction.

For local review, open <http://localhost:3000> and choose **Sign in as Lab Member**. The seeded microscope and centrifuge can be used to exercise the booking form.

The frontend sends times as ISO 8601 values. The backend stores them in UTC and treats booking periods as half-open intervals: a booking ending exactly when another begins does not overlap.

## View my bookings and requests (US-5)

A signed-in Lab Member can open **My Bookings** from the navigation menu to see every booking request they have submitted with its current status: Pending, Approved, Rejected, or Cancelled. Rejected requests show the administrator's reason. The list can be filtered by status and refreshed.

The backend always uses the signed-in member's identity, so a member can never see another member's bookings.

## Create a resource (US-8)

An authenticated System Administrator can create a laboratory resource manually or ask the system to extract suggestions from a PDF. PDF processing first reads an embedded text layer locally. If usable text is not present, the backend sends the document to the narrow Typhoon OCR route. Typhoon 30B then converts the extracted text to the supported resource fields.

AI output never creates a record. Suggested fields are visibly marked, remain editable, do not overwrite fields already edited by the administrator, and are saved only after the administrator selects **Create Resource**. The regular create API performs server validation, writes to MySQL, and records the audit event in the same transaction.

US-12 provides a separate **Booking Requests** view for System Administrators. It lists pending requests, shows the requester, resource, and requested period, and provides **Approve** and **Decline** actions. Declining requires an administrator comment. Approval locks and rechecks the resource and existing approved periods before the decision, audit entry, and requester notification are committed in one transaction.

## Set resource availability (US-11)

Sign in as **System Administrator**, open the navigation menu (☰), and choose **Resource Availability**. Each resource shows its saved availability and operational status. Select **Available** or **Unavailable**, then choose **Save**. The saved status changes only after the server confirms success. **Refresh** reloads current values from the database.

Lab Members see **Current Resource Availability** on the **Request Booking** page. It lists every non-archived resource, including **Unavailable · Cannot currently be booked** and **Available · Can request booking**. Unavailable resources stay visible in both the list and booking selector, with their selector options disabled. Resources in maintenance or out of service show why they cannot currently be booked even if the administrator has set availability to Available. If none can be booked, the submission button is disabled.

Members can use **Refresh availability** to load the administrator's latest saved values without signing in again. Refresh clears a selection that is no longer bookable while preserving the entered dates. If refresh fails, stale statuses are hidden and submission is disabled until loading succeeds. New booking submissions and pending approvals recheck the latest availability and operational status on the server, including requests from a browser that loaded a resource before it became unavailable. Setting availability does not change operational status or existing bookings. Archived resources remain visible only in the administrator list, with disabled controls.

Each actual availability change records the signed-in administrator, resource, timestamp, and before/after values in **Change History**. Resource and audit writes share a transaction and a resource row lock with booking operations. Repeating an already-saved status succeeds without a duplicate audit entry.

To run and review this feature:

```bash
cd /path/to/Lab-Data-Management/source
docker compose up --build
```

Open <http://localhost:3000>, sign in as **System Administrator**, open **☰ → Resource Availability**, change the seeded microscope to **Unavailable**, and choose **Save**. Sign out and sign in as **Lab Member**. Confirm that the microscope remains visible with **Unavailable · Cannot currently be booked** and cannot be selected for booking. Return to the administrator view and restore **Available**. Open the Member view again (or choose **Refresh availability** in an existing Member session) and confirm the microscope shows **Available · Can request booking** and can be selected. Check **Change History** as administrator for both changes. Stop the app with `docker compose down` from `source/`.

US-11 reuses the existing resource schema and needs no new migration. If your older database lacks `audit_logs.changes_json`, apply the existing `database/migrations/001_audit_changes.sql` migration as described below; preserve the data volume.

## Archive a resource (US-10)

A System Administrator can open **Archive Resources** from the navigation menu. Resources are filtered as Active, Archived, or All. Choosing **Archive** opens a confirmation inside the resource card; after **Confirm Archive** the resource disappears from the Lab Member view and can no longer be booked, but stays visible to administrators with an Archived badge.

A resource with pending or upcoming approved bookings cannot be archived; the administrator sees how many bookings must be declined or cancelled first. The archive flag and its `RESOURCE_ARCHIVED` audit entry are committed in one transaction and appear in Change History (US-15).

## Manage user roles (US-14)

A System Administrator can open **User Roles** from the navigation menu to see every user and their current role. Selecting a role and choosing **Save** assigns it; **Revoke** returns the user to the base Lab Member role. Administrators cannot change their own role.

The backend reloads the signed-in user from MySQL on every protected request, so a saved role change takes effect immediately without the affected user signing in again. Each change and its `ROLE_ASSIGNED` or `ROLE_REVOKED` audit entry are committed in one transaction.

## Review change history (US-15)

A System Administrator can open **Change History** from the navigation menu to see who performed an action, which record was affected, and when. New audit entries can be expanded to see recorded field-level before/after values. Older entries remain visible without field details.

## Run locally with Docker

Requirements: Docker Desktop with Docker Compose.

```bash
cd source
docker compose up --build
```

Open <http://localhost:3000> and choose the role needed for the flow being reviewed. Lab Members can submit booking requests. System Administrators can use the navigation button to switch between **Create Resource**, **Booking Requests**, and **Change History**. A fresh local database contains two synthetic pending requests for review.

Manual creation is available even when AI assistance is not configured. If the PDF route is unavailable, the UI reports the failure and keeps the form usable.

The Compose setup enables a local-review login endpoint and seeds these identities:

- `admin@local.test` - System Administrator; can create resources and review pending bookings.
- `member@local.test` - Lab Member; can submit booking requests.
- `staff@local.test` - Lab Staff; issue reporting is planned for a later iteration.
- `researcher@local.test` - Lab Member without a login button; use it to try role changes.

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

The database initialization scripts run only when MySQL creates a new data volume. If an older local volume predates the integrated US-4/US-12 schema or the US-14 `LAB_STAFF` role, recreate that disposable local volume before reviewing the booking flow.

For US-15, Docker Compose runs the idempotent audit migration before starting the backend. An existing volume gains the nullable `changes_json` column without deleting or rewriting old audit rows; a fresh database already has the column and the migration is a no-op. Historical events still lack before/after values rather than being guessed. Do not delete a database volume just to add this column. Deployments outside Docker Compose must run `database/migrations/001_audit_changes.sql` before starting the new backend.

For a local smoke test, sign in as System Administrator, open **Change History**, and confirm existing events load. On a disposable review database, create a resource, return to Change History, and expand its `Resource created` event to see the recorded before/after values.

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
