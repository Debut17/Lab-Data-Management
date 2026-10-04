# Manual Test Log

Environment note (2026-09-17): Docker Compose successfully built and started the MySQL, backend, and frontend services. The frontend returned HTTP 200 and the backend passed its health check.

Shared AI gateway: `https://lab-data-management-ai-gateway.triple-t-lab-data.workers.dev`; the provider key is stored only as a Cloudflare Worker Secret.

|ID|Scenario|Status|Observation|
|-|-|-|-|
|US4-M01|Lab Member submits a valid booking request|Not run|Requires Docker/browser run. Automated API and React tests verify requester ownership, `PENDING` status, and success confirmation.|
|US4-M02|Required fields and invalid time period are rejected|Not run|Automated client and server tests verify required resource/start/end fields and that end time must be after start time.|
|US4-M03|Unavailable resource is rejected with a reason|Not run|Automated repository and API tests verify the `RESOURCE_UNAVAILABLE` response.|
|US4-M04|Approved-booking overlap is rejected with a reason|Not run|Automated repository and API tests verify the half-open overlap check and `BOOKING_CONFLICT` response.|
|US4-M05|Administrator and unauthenticated booking attempts are blocked|Not run|Automated API tests verify `401 UNAUTHENTICATED` and `403 FORBIDDEN` responses.|
|US8-M01|Manual create resource successfully|Passed|System Administrator created a resource through the Docker-hosted application and the UI displayed "Resource created successfully."|
|US8-M02|Required-field validation|Not run|Requires browser run. Automated client and server validation tests pass.|
|US8-M03|Unauthorized/non-admin access blocked|Not run|Requires browser run. Automated unauthenticated and non-admin API tests pass.|
|US8-M04|Embedded-text PDF extraction through Typhoon|Passed|A sample resource PDF was processed through the Docker frontend proxy, backend, local Worker, and Typhoon; structured resource suggestions were returned and no create request was made.|
|US8-M05|Scanned PDF OCR fallback|Passed|An image-only PDF with a verified empty text layer was processed through the Docker proxy, backend, Typhoon OCR, and Typhoon 30B. The expected centrifuge fields were returned; a database check confirmed that extraction did not create a resource.|
|US8-M06|AI suggestions populate editable fields without auto-save|Not run|Automated React integration tests verify untouched-field fill, dirty-field preservation, edit-before-save, no auto-save, failure fallback, and Cancel reset.|
|US8-M07|Clean-clone shared Worker flow|Passed|Compose was started with an empty environment file. The backend used the committed Cloudflare Worker URL with no gateway token, processed the scanned PDF successfully, and did not create a resource.|

Automated verification on 2026-09-17: backend 39/39, frontend 20/20, and AI gateway 16/16 tests passed. Coverage was above 80% for all three projects; the frontend production build and Worker deployment dry-run also passed.

Automated US-4 verification on 2026-10-04: backend 53/53 and frontend 52/52 tests passed. Backend coverage was 94.15% lines and frontend coverage was 96.75% lines. The frontend production build passed. A fresh Docker/MySQL browser run remained pending at the time of the US-4 branch verification.

## US-12 verification - 2026-10-04

An isolated Docker Compose project with a fresh MySQL volume was built for US-12 verification and removed after the checks. The requests below travelled through the production Nginx proxy and backend into MySQL.

|ID|Scenario|Status|Observation|
|-|-|-|-|
|US12-M01|Load pending requests as System Administrator|Passed|The seeded database returned two pending requests with requester, resource, and period details through `GET /api/admin/bookings?status=PENDING`.|
|US12-M02|Approve a conflict-free request|Passed|The API returned `APPROVED`; MySQL stored reviewer and review time and created matching audit and notification rows.|
|US12-M03|Decline with administrator comment|Passed|The API returned `REJECTED` and persisted the normalized decline comment, reviewer, audit event, and requester notification.|
|US12-M04|Block an overlapping approval|Passed|An overlapping approved period produced `409 BOOKING_CONFLICT`; the target remained `PENDING` and no audit or notification row was written.|
|US12-M05|Enforce administrator-only access|Passed|An unauthenticated request returned 401 and a signed-in Lab Member request returned 403.|
|US12-M06|Administrator UI flow|Automated|React tests cover loading, empty, approve, decline-comment, error, and navigation states. A production frontend image built successfully; interactive browser inspection was not available in this environment.|

Automated US-12 verification: backend 53/53 tests passed with 94.54% line coverage; frontend 52/52 tests passed with 93.99% statement coverage. Both exceeded the configured 80% target.

Integrated US-4/US-12 verification on 2026-10-04: backend 68/68 tests passed with 95.23% line coverage; frontend 60/60 tests passed with 96.65% statement coverage. A fresh Docker/MySQL run confirmed that a Lab Member can create a `PENDING` request, the System Administrator can see and approve it, and the transaction writes both request/approval audit entries plus the status notification. The frontend production build passed, and both backend and frontend dependency audits reported zero vulnerabilities.
