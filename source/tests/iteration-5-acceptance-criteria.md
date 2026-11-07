# Iteration 5 Acceptance Criteria

These criteria convert the three in-capacity user stories into observable, automatable outcomes. They are intentionally implementation-neutral except where an API contract is required to verify authorization and persistence.

## Test Status Legend

- **Automated:** implemented and expected to pass.
- **Red contract:** executable Playwright acceptance test marked as an expected failure because the feature is absent from the current baseline. An expected failure is not an accepted story.
- **Accepted:** all criteria pass without an expected-failure marker against the integrated stack.

## US-7 - Report Resource Problem

**Story:** As a Lab Staff member, I want to report a resource problem so that the administrator can correct the central record or arrange maintenance.

1. A signed-in Lab Staff member can select an active resource, select a supported problem type, enter a non-empty description, and submit the report.
2. The report is stored as `PENDING` with its resource, reporter, description, type, and submission time.
3. Every active administrator receives a persistent notification containing the report details.
4. An administrator can read the notification and its read state remains after reload.
5. Lab Members cannot submit reports; non-administrators cannot read or acknowledge administrator notifications.
6. Invalid identifiers, problem types, and descriptions are rejected without creating a partial report or notification.

**Automation:** `source/e2e/tests/06-us7-resource-reporting.spec.js` - automated on the current baseline.

## US-13 - Resolve Issue Report

**Story:** As a System Administrator, I want to resolve an issue report so that the reported resource problem has a recorded outcome.

1. A System Administrator can resolve a pending resource report only after entering a non-empty outcome.
2. Resolution stores `RESOLVED`, the outcome, resolver, and resolution time as one persistent change.
3. The recorded outcome remains visible after reload.
4. Lab Members and Lab Staff receive `403` when attempting to resolve a report.
5. Blank outcomes are rejected with `422`; resolving an already resolved report is rejected with `409` and cannot overwrite the first outcome.
6. Resolution creates an audit record with the actor, report identifier, status transition, outcome, and timestamp.

**Proposed API contract:** `PATCH /api/admin/resource-reports/:id/resolve` with `{ "outcome": string }`.

**Automation:** `source/e2e/tests/07-us13-resolve-issue-report.acceptance.spec.js` - red contract until US-13 is integrated.

## US-17 - Administrative Records

**Story:** As a System Administrator, I want to view administrative records so that I can oversee laboratory operations from one place.

1. A System Administrator can open one Administrative Records view containing the complete resource-issue lifecycle.
2. Each issue record shows its type, stable record identifier, resource, reporter, status, timestamps, resolver, and outcome when resolved.
3. Newly completed operations appear without stale cached data and records are ordered newest first.
4. Lab Members and Lab Staff cannot see the view and receive `403` from the underlying API.
5. The view is read-only; actions that change a report remain in their owning workflow and are represented here as records.

**Proposed API contract:** `GET /api/admin/records`, returning `{ "data": { "records": [...] } }` with `Cache-Control: private, no-store`.

**Automation:** `source/e2e/tests/08-us17-administrative-records.acceptance.spec.js` - red contract until US-13 and US-17 are integrated.

## Acceptance Gate

A story may be marked accepted only when:

1. Its Playwright tests run against the real React, Express, migration, and MySQL stack.
2. All tests pass without `test.fail`, `test.skip`, `test.fixme`, retries, or changed expectations that weaken the criteria.
3. Existing regression tests remain green.
4. The GitHub Actions report and traces are attached as evidence.

Run all Iteration 5 contracts with:

```bash
cd source/e2e
npm run test:acceptance:iteration5
```
