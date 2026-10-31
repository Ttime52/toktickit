# TokTickIT Lab 4 Test Plan, Traceability, and Final Evidence

**Status:** Full Lab 1–4 regression evidence was recorded on 2026-10-12 for
`feature/28-final-regression-release`. Lab 2/3 tests were updated only where
their fixtures/assertions referenced the retired development-requester selector
or pre-session API; behavioral coverage remains ownership, Attachments, Public
Comments, Internal Notes, IT Staff, and Administrator User Management.
**Source of truth:** [specification.md](specification.md),
[api-spec.md](api-spec.md), and [ui-spec.md](ui-spec.md)  
**Final status convention:** Pass means the named automated test ran and
passed in the current release-candidate workspace. The recorded branch result
is local evidence; it does not claim that an external merge or release PR has
already completed.

This document preserves the planned Test-DD scope and records the final local
release-candidate result. It is not evidence that this branch has already been
merged to `main`.

## 1. Planned test approach

- Unit tests cover validation boundaries, safe serialization, status and
  dashboard formulas, version/ETag behavior, and idempotency normalization.
- API/integration tests use Express middleware, Prisma, sessions, role guards,
  transactions, concurrency headers, and safe error envelopes.
- UI tests cover role modes, semantic labels, loading/empty/forbidden/
  conflict/retry states, draft preservation, drill-down links, and duplicate
  submit protection.
- Authorization tests use Requester, IT Staff, and Administrator sessions and
  attempt permitted and forbidden calls, forged identity parameters, and
  protected-field access.
- Workflow tests cover Actions Taken, assignment, priority, status gates,
  resolution evidence, stale writes, Requester indications, and terminal
  states.
- Regression tests rerun the Lab 1–3 authentication, role navigation,
  ownership, Ticket Detail, Attachment, Public Comment, Internal Note, IT
  Staff, and Administrator User Management behavior after the Lab 4 schema/API
  changes through the adapted Lab 2/3 paths and the dedicated Lab 4 current-
  contract regression files.
- Responsive/accessibility tests cover Zen Green tokens, text status cues,
  keyboard focus, modal focus behavior, semantic labels, clipping, and page
  overflow at desktop, tablet, and mobile viewports.
- Migration tests preserve existing identities and relationships, verify
  legacy Tickets with zero Actions Taken, and run seed twice for idempotency.
- E2E tests run the integrated client/server with seeded accounts and capture
  stable screenshots under artifacts/lab-04/screenshots/.
- Performance-smoke tests exercise 1,000 Tickets and a 20-row Actions Taken
  page against explicit 750 ms and 500 ms local budgets.

## 2. Fixtures and evidence rules

The planned fixture contains every Ticket status and IT Priority, assigned and
unassigned Tickets, zero/one/multiple Actions Taken, multiple performers, a
follow-up-required Action Taken, and zero-metric dashboard data. Test users
are created through test helpers; passwords are not committed, logged, or
rendered as evidence.

API tests assert status code, safe error code, authorization scope, database
side effects, and absence of sensitive fields. UI/E2E tests use accessible
queries and capture screenshots only after the state is stable. Dashboard
tests use the documented Asia/Bangkok half-open date window.

## 3. Planned coverage matrix and actual test paths

| Test area | Planned evidence | Actual test files | Final status |
|---|---|---|---|
| Unit | Validation, ticket rules, dashboard boundaries, auth helpers, query helpers, and the complete transition matrix | server/tests/lab-02/*.unit.test.ts, server/tests/lab-03/auth.unit.test.ts, server/tests/lab-04/dashboard-metrics.unit.test.ts, server/tests/lab-04/ticket-workflow.unit.test.ts | Pass |
| API/integration | Actions Taken, dashboards, workflow, retained Lab 1–3 behavior, and safe errors | server/tests/lab-01/*.test.ts, server/tests/lab-02/*.api.test.ts, server/tests/lab-02/schema.integration.test.ts, server/tests/lab-03/*.api.test.ts, server/tests/lab-03/migration-regression.integration.test.ts, server/tests/lab-04/*.api.test.ts | Pass |
| Authorization | Role matrix, ownership, forged identity, protected fields | server/tests/lab-03/authorization.api.test.ts, server/tests/lab-03/comments-notes.api.test.ts, server/tests/lab-03/requester-regression.api.test.ts, server/tests/lab-03/staff-ticket-detail.api.test.ts, server/tests/lab-03/users-admin.api.test.ts, server/tests/lab-04/actions-taken.api.test.ts, server/tests/lab-04/dashboard.api.test.ts | Pass |
| UI component | Forms, role modes, important states, retry, draft preservation, focus | client/tests/lab-01/App.test.tsx, client/tests/lab-02/*.test.tsx, client/tests/lab-03/*.test.tsx, client/tests/lab-04/*.test.tsx | Pass |
| Workflow | Actions Taken create/read-only flow, stale/idempotent retry, the exhaustive transition matrix, and status gates | server/tests/lab-04/actions-taken.api.test.ts, server/tests/lab-04/ticket-workflow.unit.test.ts, server/tests/lab-04/ticket-workflow.api.test.ts, client/tests/lab-04/ActionsTaken.test.tsx, client/tests/lab-04/TicketWorkflow.test.tsx, e2e/lab-04/actions-taken-flow.spec.ts, e2e/lab-04/ticket-resolution.spec.ts | Pass |
| Migration/regression | Preserve Lab 1–3 data and run seed twice | server/tests/lab-02/schema.integration.test.ts, server/tests/lab-03/migration-regression.integration.test.ts, server/tests/lab-04/lab23-regression.api.test.ts | Pass |
| Responsive/accessibility | Desktop/tablet/mobile layout, labels, focus, non-color cues, overflow, and every Lab 4 major screen | e2e/lab-04/actions-taken-flow.spec.ts, e2e/lab-04/dashboards.spec.ts, e2e/lab-04/ticket-resolution.spec.ts, docs/lab-04/ui-spec.md §7–8 | Pass |
| E2E regression | Authentication, Requester, IT Staff, Administrator, Actions Taken, dashboards, resolution, and migrated Lab 2 browser flows | e2e/lab-02/*.spec.ts, e2e/lab-03/*.spec.ts, e2e/lab-04/*.spec.ts | Pass |
| Lab 2/3 current-contract regression | Session-derived ownership, Attachments, Public Comments, Internal Notes, and Administrator User Management after the Lab 4 schema/API migration | server/tests/lab-04/lab23-regression.api.test.ts, client/tests/lab-04/Lab23Regression.test.tsx, e2e/lab-04/lab23-regression.spec.ts, plus adapted `lab-02`/`lab-03` suites | Pass |
| Performance-smoke | 1,000+ Ticket aggregate and bounded Actions Taken pagination | server/tests/lab-04/performance-smoke.test.ts | Pass |

## 4. Acceptance-Criterion traceability

| AC | Planned test IDs | Actual evidence | Final status |
|---|---|---|---|
| AC-01 | API-02, WORK-01, E2E-02 | server/tests/lab-04/actions-taken.api.test.ts, client/tests/lab-04/ActionsTaken.test.tsx, e2e/lab-04/actions-taken-flow.spec.ts | Pass |
| AC-02 | UNIT-01, API-03, UI-02 | server/tests/lab-04/actions-taken.api.test.ts, client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| AC-03 | AUTH-01, API-01, E2E-02 | server/tests/lab-04/actions-taken.api.test.ts, client/tests/lab-04/ActionsTaken.test.tsx, e2e/lab-04/actions-taken-flow.spec.ts | Pass |
| AC-04 | AUTH-01/02, API-02/03 | server/tests/lab-04/actions-taken.api.test.ts, client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| AC-05 | UNIT-02, API-08, WORK-03 | server/tests/lab-04/ticket-workflow.unit.test.ts, server/tests/lab-03/staff-ticket-detail.api.test.ts, server/tests/lab-04/ticket-workflow.api.test.ts, client/tests/lab-03/StaffTicketDetail.test.tsx, client/tests/lab-04/TicketWorkflow.test.tsx | Pass |
| AC-06 | API-09, AUTH-03, E2E-03 | server/tests/lab-03/staff-ticket-detail.api.test.ts, server/tests/lab-04/ticket-workflow.api.test.ts, client/tests/lab-03/StaffTicketDetail.test.tsx, e2e/lab-04/ticket-resolution.spec.ts | Pass |
| AC-07 | API-10, REG-03, E2E-03 | server/tests/lab-03/requester-regression.api.test.ts, server/tests/lab-03/staff-ticket-detail.api.test.ts, client/tests/lab-03/RequesterRegression.test.tsx | Pass |
| AC-08 | UNIT-04, API-05, UI-04, E2E-01 | server/tests/lab-04/dashboard-metrics.unit.test.ts, server/tests/lab-04/requester-dashboard.api.test.ts, client/tests/lab-04/RequesterDashboard.test.tsx, e2e/lab-04/dashboards.spec.ts | Pass |
| AC-09 | API-06, UI-04, E2E-01 | server/tests/lab-04/staff-dashboard.api.test.ts, server/tests/lab-04/dashboard.api.test.ts, client/tests/lab-04/StaffDashboard.test.tsx, e2e/lab-04/dashboards.spec.ts | Pass |
| AC-10 | API-07/12, AUTH-04, UI-04, E2E-01 | server/tests/lab-04/dashboard.api.test.ts, client/tests/lab-04/Dashboard.test.tsx, client/tests/lab-04/ActionsTaken.test.tsx, e2e/lab-04/dashboards.spec.ts, artifacts/lab-04/screenshots/administrator-dashboard/ | Pass |
| AC-11 | UNIT-03, API-11, UI-03, WORK-02 | server/tests/lab-04/actions-taken.api.test.ts, server/tests/lab-04/ticket-workflow.api.test.ts, client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| AC-12 | MIG-01/02, REG-01–04 | server/tests/lab-02/schema.integration.test.ts, server/tests/lab-03/migration-regression.integration.test.ts, server/tests/lab-04/lab23-regression.api.test.ts | Pass |
| AC-13 | MIG-03 | server/tests/lab-03/migration-regression.integration.test.ts | Pass |
| AC-14 | API-04, UI-01–05, E2E-01–03 | client/tests/lab-02/*.test.tsx, client/tests/lab-03/*.test.tsx, client/tests/lab-04/*.test.tsx, e2e/lab-02/*.spec.ts, e2e/lab-03/*.spec.ts, e2e/lab-04/*.spec.ts | Pass |
| AC-15 | STYLE-01, RESP-01–03 | e2e/lab-04/actions-taken-flow.spec.ts, e2e/lab-04/dashboards.spec.ts, e2e/lab-04/ticket-resolution.spec.ts, artifacts/lab-04/screenshots/ | Pass |
| AC-16 | PERF-01/02 | server/tests/lab-04/performance-smoke.test.ts | Pass |
| AC-17 | MIG-04, REG-01–04, E2E-04 | server/tests/lab-02/*.test.ts, server/tests/lab-03/*.test.ts, server/tests/lab-04/lab23-regression.api.test.ts, client/tests/lab-02/*.test.tsx, client/tests/lab-03/*.test.tsx, client/tests/lab-04/Lab23Regression.test.tsx, e2e/lab-02/*.spec.ts, e2e/lab-03/*.spec.ts, e2e/lab-04/lab23-regression.spec.ts | Pass |

## 5. Recorded commands and passing output

The following output was recorded after the Lab 2/3 current-contract test
updates. The client and server commands were run with `npm.cmd` because this
Windows workspace blocks the PowerShell `npm.ps1` wrapper.

~~~text
$ npm.cmd run test:client
Test Files  21 passed (21)
      Tests  68 passed (68)

$ npm.cmd run test:server
Test Files  30 passed (30)
      Tests  115 passed (115)

$ npm.cmd run test:e2e:lab2
Running 8 tests using 1 worker
  8 passed (13.8s)

$ npm.cmd run test:e2e:lab3
Running 9 tests using 1 worker
  9 passed (44.9s)

$ npm.cmd run test:e2e:lab4
Running 15 tests using 1 worker
  15 passed (47.7s)

$ npm.cmd run build:client
passed

$ npm.cmd run build:server
passed

$ npm.cmd run test:regression
client: 21 test files / 68 tests passed
server: 30 test files / 115 tests passed
E2E Lab 2: 8 passed; E2E Lab 3: 9 passed; E2E Lab 4: 15 passed
exit code: 0
~~~

`npm.cmd run test:e2e:lab2` uses `playwright.lab2.config.ts`,
`npm.cmd run test:e2e:lab3` uses `playwright.config.ts`, and
`npm.cmd run test:e2e:lab4` uses `playwright.lab4.config.ts`; each suite keeps
its own artifact directory.

### 5.1 Lab 1–3 regression commands

The legacy test paths remain in their Lab 1/2/3 directories, but fixtures and
assertions that referenced the retired development-requester selector,
`requesterId` input, or pre-session UI were adapted to the current User/session
contract. The behavior under test was not weakened or removed.

~~~text
$ npm.cmd run test:client:lab2
Test Files  7 passed (7)
      Tests  31 passed (31)

$ npm.cmd run test:client:lab3
Test Files  7 passed (7)
      Tests  16 passed (16)

$ npm.cmd run test:server:lab2
Test Files  10 passed (10)
      Tests  51 passed (51)

$ npm.cmd run test:server:lab3
Test Files  9 passed (9)
      Tests  34 passed (34)
~~~

The complete aggregate commands in §5 also passed, so the release gate does
not rely only on the new `lab-04` regression files.

### 5.2 Current Lab 4 scoped regression run

The Lab 4-specific files below add coverage for Actions Taken, dashboards,
resolution workflow, conflict/idempotency handling, and cross-Lab regression
boundaries on top of the passing Lab 1–3 suites.

~~~text
$ npm.cmd run test:client:lab4
Test Files  6 passed (6)
      Tests  18 passed (18)

$ npm.cmd run test:server:lab4
Test Files  9 passed (9)
      Tests  28 passed (28)

$ npm.cmd run test:e2e:lab4
Running 15 tests using 1 worker
  15 passed (47.7s)
~~~

Current-contract regression files:

- `server/tests/lab-04/lab23-regression.api.test.ts` — ownership,
  Attachments, Public Comments, Internal Notes, and User Management API.
- `client/tests/lab-04/Lab23Regression.test.tsx` — current Ticket Detail
  ownership, Attachment, Public Comment, and private-Note UI boundary.
- `e2e/lab-04/lab23-regression.spec.ts` — integrated Requester/IT Staff/
  Administrator flow at desktop, tablet, and mobile.

## 6. Submission Part 8 regression evidence

The table below is the required Submission Part 8 representative regression
evidence. Every listed behavior is covered by at least one passing API, UI, or
E2E path after the Lab 4 schema/API migration; the dedicated Lab 4 files add
cross-role checks without replacing the Lab 1–3 paths.

| Required behavior | Current Lab 4 evidence | Result |
|---|---|---|
| Authentication and role navigation | server/tests/lab-04/lab23-regression.api.test.ts, e2e/lab-04/lab23-regression.spec.ts | Pass |
| My Tickets and ownership | server/tests/lab-04/lab23-regression.api.test.ts, client/tests/lab-04/Lab23Regression.test.tsx, e2e/lab-04/lab23-regression.spec.ts | Pass |
| Ticket Detail | client/tests/lab-04/Lab23Regression.test.tsx, e2e/lab-04/lab23-regression.spec.ts | Pass |
| Attachments | server/tests/lab-04/lab23-regression.api.test.ts, client/tests/lab-04/Lab23Regression.test.tsx, e2e/lab-04/lab23-regression.spec.ts | Pass |
| Public Comments | server/tests/lab-04/lab23-regression.api.test.ts, client/tests/lab-04/Lab23Regression.test.tsx, e2e/lab-04/lab23-regression.spec.ts | Pass |
| IT Staff functions | server/tests/lab-04/lab23-regression.api.test.ts, e2e/lab-04/lab23-regression.spec.ts | Pass |
| Internal Notes | server/tests/lab-04/lab23-regression.api.test.ts, client/tests/lab-04/Lab23Regression.test.tsx, e2e/lab-04/lab23-regression.spec.ts | Pass |
| Administrator User Management | server/tests/lab-04/lab23-regression.api.test.ts, e2e/lab-04/lab23-regression.spec.ts | Pass |

| Required evidence | Actual paths | Result |
|---|---|---|
| Authentication and role navigation | server/tests/lab-03/auth.api.test.ts, server/tests/lab-03/auth.unit.test.ts, client/tests/lab-03/Login.test.tsx, client/tests/lab-03/ChangePassword.test.tsx, e2e/lab-03/authentication.spec.ts, e2e/lab-03/visual-checklist.spec.ts | Pass |
| My Tickets and ownership | server/tests/lab-02/my-tickets.api.test.ts, server/tests/lab-03/requester-regression.api.test.ts, client/tests/lab-02/MyTickets.test.tsx, client/tests/lab-03/RequesterRegression.test.tsx, e2e/lab-02/requester-ticket-flow.spec.ts, e2e/lab-02/responsive-layout.spec.ts, e2e/lab-03/requester-regression.spec.ts | Pass |
| Ticket Detail | server/tests/lab-02/ticket-detail.api.test.ts, server/tests/lab-03/staff-ticket-detail.api.test.ts, client/tests/lab-02/TicketDetail.test.tsx, client/tests/lab-02/RequesterTicketDetail.test.tsx, client/tests/lab-03/StaffTicketDetail.test.tsx, e2e/lab-02/requester-ticket-flow.spec.ts, e2e/lab-03/requester-regression.spec.ts, e2e/lab-03/staff-ticket-flow.spec.ts | Pass |
| Attachments | server/tests/lab-02/attachments.api.test.ts, server/tests/lab-03/migration-regression.integration.test.ts, client/tests/lab-02/AttachmentSection.test.tsx, client/tests/lab-02/TicketDetail.test.tsx, e2e/lab-02/requester-ticket-flow.spec.ts, e2e/lab-03/requester-regression.spec.ts | Pass |
| Public Comments | server/tests/lab-03/comments-notes.api.test.ts, server/tests/lab-03/requester-regression.api.test.ts, server/tests/lab-03/staff-ticket-detail.api.test.ts, client/tests/lab-03/RequesterRegression.test.tsx, client/tests/lab-03/StaffTicketDetail.test.tsx, e2e/lab-03/visual-checklist.spec.ts | Pass |
| IT Staff functions | server/tests/lab-03/staff-queue.api.test.ts, server/tests/lab-03/staff-ticket-detail.api.test.ts, client/tests/lab-03/StaffTicketQueue.test.tsx, client/tests/lab-03/StaffTicketDetail.test.tsx, e2e/lab-03/staff-ticket-flow.spec.ts | Pass |
| Internal Notes | server/tests/lab-03/comments-notes.api.test.ts, server/tests/lab-03/staff-ticket-detail.api.test.ts, client/tests/lab-03/StaffTicketDetail.test.tsx, client/tests/lab-03/AdminTicketInspection.test.tsx, e2e/lab-03/staff-ticket-flow.spec.ts, e2e/lab-03/visual-checklist.spec.ts | Pass |
| Administrator User Management | server/tests/lab-03/users-admin.api.test.ts, server/tests/lab-03/authorization.api.test.ts, client/tests/lab-03/UserManagement.test.tsx, client/tests/lab-03/AdminTicketInspection.test.tsx, e2e/lab-03/user-administration.spec.ts | Pass |

## 7. Screenshot manifest and accessibility evidence

The required Issue 28 screenshot set is fifteen files: Actions Taken, Requester
Dashboard, IT Staff Dashboard, Administrator Dashboard, and Ticket resolution,
each at desktop, tablet, and mobile sizes.

~~~text
artifacts/lab-04/screenshots/actions-taken/actions-taken-desktop.png
artifacts/lab-04/screenshots/actions-taken/actions-taken-tablet.png
artifacts/lab-04/screenshots/actions-taken/actions-taken-mobile.png
artifacts/lab-04/screenshots/requester-dashboard/requester-dashboard-desktop.png
artifacts/lab-04/screenshots/requester-dashboard/requester-dashboard-tablet.png
artifacts/lab-04/screenshots/requester-dashboard/requester-dashboard-mobile.png
artifacts/lab-04/screenshots/staff-dashboard/staff-dashboard-desktop.png
artifacts/lab-04/screenshots/staff-dashboard/staff-dashboard-tablet.png
artifacts/lab-04/screenshots/staff-dashboard/staff-dashboard-mobile.png
artifacts/lab-04/screenshots/administrator-dashboard/administrator-dashboard-desktop.png
artifacts/lab-04/screenshots/administrator-dashboard/administrator-dashboard-tablet.png
artifacts/lab-04/screenshots/administrator-dashboard/administrator-dashboard-mobile.png
artifacts/lab-04/screenshots/ticket-resolution/ticket-resolution-desktop.png
artifacts/lab-04/screenshots/ticket-resolution/ticket-resolution-tablet.png
artifacts/lab-04/screenshots/ticket-resolution/ticket-resolution-mobile.png
~~~

The screenshot tests assert stable page state, keyboard focus, and no
page-level horizontal overflow. Status and priority use text/badge cues
rather than color alone. The completed checklist and its evidence references
are in ui-spec.md section 7–8.

## 8. Release handoff boundary

The Lab 4 implementation, the adapted Lab 1–3 regression suites, the
current-contract cross-Lab tests, and the screenshots are green. The release
candidate uses the User/session schema throughout; no retired requester
selector is required by the release gate.

1. Evidence was captured on `feature/28-final-regression-release`; a maintainer
   still has to merge the branch/release PR and confirm the final `main` result.
   This is an external release action, not an unverified test claim.
2. The release handoff is still an external repository action; the local
   evidence does not claim that the branch has already been merged to `main`.
