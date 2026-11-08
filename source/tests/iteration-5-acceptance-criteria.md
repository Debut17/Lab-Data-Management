# US-17 Acceptance Contract

These criteria define the executable contract for the remaining Iteration 5 administrative-records story.

## Test Status Legend

- **Red contract:** executable Playwright acceptance test marked as an expected failure because the feature is absent from the current baseline. An expected failure is not an accepted story.
- **Accepted:** all criteria pass without an expected-failure marker against the integrated stack.

## US-17 - Administrative Records

**Story:** As a System Administrator, I want to view administrative records so that I can oversee laboratory operations from one place.

1. A System Administrator can open one Administrative Records view containing the complete resource-issue lifecycle.
2. Each issue record shows its type, stable record identifier, resource, reporter, status, timestamps, resolver, and outcome when resolved.
3. Newly completed operations appear without stale cached data and records are ordered newest first.
4. Lab Members and Lab Staff cannot see the view and receive `403` from the underlying API.
5. The view is read-only; actions that change a report remain in their owning workflow and are represented here as records.

**Proposed API contract:** `GET /api/admin/records`, returning `{ "data": { "records": [...] } }` with `Cache-Control: private, no-store`.

**Automation:** `source/e2e/tests/08-us17-administrative-records.acceptance.spec.js` - red contract until US-17 is integrated.

## Acceptance Gate

A story may be marked accepted only when:

1. Its Playwright tests run against the real React, Express, migration, and MySQL stack.
2. All tests pass without `test.fail`, `test.skip`, `test.fixme`, retries, or changed expectations that weaken the criteria.
3. Existing regression tests remain green.
4. The GitHub Actions report and traces are attached as evidence.

Run the US-17 contract with:

```bash
cd source/e2e
npm run test:contract:us17
```
