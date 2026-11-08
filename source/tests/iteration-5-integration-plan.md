# Iteration 5 Integration Testing

**Owner:** Tanawat Rungwallapa
**Branch:** `iteration-5/integration-testing`
**Baseline:** `origin/main@1000803` (US-7 merge baseline)
**Prepared:** 7 November 2026

## Goal

Automate full-stack verification for the current iteration using Playwright, the real React and Express applications, and a fresh MySQL database created by the isolated `lab-e2e` Docker Compose project.

## Current Scope

| User story | Integration flow | Status on baseline |
|---|---|---|
| US-7 Report Resource Problem | Lab Staff submits a problem; the report and administrator notification persist; the administrator reads it | Automated on this branch |
| US-13 Resolve Issue Report | Administrator records a resolution and the final outcome is retained | Waiting for the story owner; implementation is not present on `origin/main@1000803` |
| US-17 Administrative Records | Administrator views the combined administrative record | Waiting for the story owner; implementation is not present on `origin/main@1000803` |
| Role-based access | Member and Staff cannot call administrator notification APIs | Automated on this branch |
| CI integration | Run the isolated Docker/Playwright suite for every pull request | Automated on this branch |

US-13 and US-17 remain outside this branch until their story owners make the implementations available. Add their integration tests after those branches are ready; do not create passing placeholders for functionality that does not exist.

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
| Frontend regression | PASS - 145/145 tests |
| Frontend production build | PASS |
| Playwright collection | PASS - 22 tests collected in 6 files, including 3 US-7 integration tests |
| Full local Docker/Playwright run | Not run; GitHub Actions is the verified integration environment |
| GitHub Actions full-stack run | PASS - 22/22 tests on PR #15 |

The GitHub Actions result is the evidence for the passing full-stack suite. The local collection count only confirms test discovery.

## Evidence to Record in the Iteration Report

- Pull request URL.
- Commit SHA authored by Tanawat.
- GitHub Actions run URL.
- Number of passing/failing/skipped Playwright tests from that run.
- Defects found and the commit or issue that resolves each defect.

Do not copy test counts or coverage values from another project or iteration. Record only the measurements produced by this branch's CI run.
