# Manual Test Log

Environment note (2026-09-17): Docker Compose successfully built and started the MySQL, backend, and frontend services. The frontend returned HTTP 200 and the backend passed its health check.

Shared AI gateway: `https://lab-data-management-ai-gateway.triple-t-lab-data.workers.dev`; the provider key is stored only as a Cloudflare Worker Secret.

|ID|Scenario|Status|Observation|
|-|-|-|-|
|US8-M01|Manual create resource successfully|Passed|System Administrator created a resource through the Docker-hosted application and the UI displayed "Resource created successfully."|
|US8-M02|Required-field validation|Not run|Requires browser run. Automated client and server validation tests pass.|
|US8-M03|Unauthorized/non-admin access blocked|Not run|Requires browser run. Automated unauthenticated and non-admin API tests pass.|
|US8-M04|Embedded-text PDF extraction through Typhoon|Passed|A sample resource PDF was processed through the Docker frontend proxy, backend, local Worker, and Typhoon; structured resource suggestions were returned and no create request was made.|
|US8-M05|Scanned PDF OCR fallback|Passed|An image-only PDF with a verified empty text layer was processed through the Docker proxy, backend, Typhoon OCR, and Typhoon 30B. The expected centrifuge fields were returned; a database check confirmed that extraction did not create a resource.|
|US8-M06|AI suggestions populate editable fields without auto-save|Not run|Automated React integration tests verify untouched-field fill, dirty-field preservation, edit-before-save, no auto-save, failure fallback, and Cancel reset.|
|US8-M07|Clean-clone shared Worker flow|Passed|Compose was started with an empty environment file. The backend used the committed Cloudflare Worker URL with no gateway token, processed the scanned PDF successfully, and did not create a resource.|

Automated verification on 2026-09-17: backend 39/39, frontend 20/20, and AI gateway 16/16 tests passed. Coverage was above 80% for all three projects; the frontend production build and Worker deployment dry-run also passed.
