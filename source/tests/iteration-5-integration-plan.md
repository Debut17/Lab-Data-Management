# Iteration 5 Integration Testing

**Owner:** Tanawat Rungwallapa  
**Branch:** `iteration-5/integration-testing`  
**Baseline:** `origin/main@1000803`  
**Prepared:** 7 November 2026

## Goal

Automate full-stack verification for the current iteration using Playwright, the real React and Express applications, and a fresh MySQL database created by the isolated `lab-e2e` Docker Compose project.

## Current Scope

| User story | Integration flow | Status on baseline |
|---|---|---|
| US-7 Report Resource Problem | Lab Staff submits a problem; the report and administrator notification persist; the administrator reads it | Automated on this branch |
| US-13 Resolve Issue Report | Administrator records a resolution and the final outcome is retained | Red acceptance contract; implementation is not present on `origin/main@1000803` |
| US-17 Administrative Records | Administrator views the combined administrative record | Red acceptance contract; implementation is not present on `origin/main@1000803` |
| Role-based access | Member and Staff cannot call administrator notification APIs | Automated on this branch |
| CI integration | Run the isolated Docker/Playwright suite for every pull request | Automated on this branch |

US-13 and US-17 have executable expected-failure contracts. These tests are not evidence that the stories pass. Remove each `test.fail` marker only after its implementation is available and the complete test passes. Do not create passing placeholders for functionality that does not exist.

The behavioral criteria and proposed API contracts are documented in `source/tests/iteration-5-acceptance-criteria.md`. The US-13 and US-17 contracts require team confirmation before implementation is frozen because the available Iteration 5 report states outcomes but does not define endpoint names or response schemas.

## Automated US-7 Journey

1. Start the complete stack under Compose project `lab-e2e`.
2. Create a fresh MySQL volume and apply the resource-report migration.
3. Sign in as Lab Staff.
4. Submit a malfunction report for the seeded microscope.
5. Confirm the staff-facing success state.
6. Sign in as System Administrator in a separate browser context.
7. Open Problem Notifications and verify the persisted report details.
8. Mark the notification as read and verify the UI changes.
9. Confirm Lab Members cannot create reports and Lab Staff cannot access the administrator inbox.
10. Tear down the isolated stack and volume.

## Commands

```bash
cd source/e2e
npm ci
npx playwright install chromium
npm test
npm run test:acceptance:iteration5
```

To inspect a failure:

```bash
npm run report
```

## Definition of Done

- The existing Iteration 4 journeys remain green.
- The US-7 journey passes against the real frontend, backend, migrations, and MySQL database.
- Unauthorized roles receive `403` from protected endpoints.
- Every pull request automatically runs the Playwright integration suite.
- Failure traces, screenshots, and the HTML report are retained as CI artifacts.
- US-13 and US-17 receive equivalent automated journeys after their implementations are available.

## Verification Status

| Check | Result |
|---|---|
| Backend regression | PASS - 163/163 tests |
| Frontend regression | PASS - 132/132 tests |
| Frontend production build | PASS |
| Playwright collection | PASS - 28 tests collected in 8 files; 6 are red contracts for unavailable US-13/US-17 features |
| Full local Docker/Playwright run | BLOCKED - Docker daemon is not running on this machine |
| GitHub Actions full-stack run | Pending updated branch push and pull request |

The Playwright collection count is not a passing E2E count. Report the full suite as passed only after GitHub Actions or a local Docker run returns a successful exit code.

## Evidence to Record in the Iteration Report

- Pull request URL.
- Commit SHA authored by Tanawat.
- GitHub Actions run URL.
- Number of passing/failing/skipped Playwright tests from that run.
- Defects found and the commit or issue that resolves each defect.

Do not copy test counts or coverage values from another project or iteration. Record only the measurements produced by this branch's CI run.
