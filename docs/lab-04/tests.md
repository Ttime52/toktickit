# TokTickIT Lab 4 Test Plan — Test-DD / TDD Contract

**Status:** Planned; must be approved before Issue 2 implementation  
**Source of truth:** [specification.md](specification.md),
[api-spec.md](api-spec.md), and [ui-spec.md](ui-spec.md)  
**Final status convention:** Every Lab 4 row starts as `Planned — not run`.
It may become `Pass` only after the named automated test runs on the final
main branch. No passing result is claimed by this pre-implementation plan.

## 1. Test approach

- **Unit tests** isolate Action Taken validation/serialization, transition
  rules, version/ETag comparison, idempotency normalization, and dashboard
  date-boundary formulas.
- **API/integration tests** use the real Express middleware, Prisma test
  database, sessions, role guards, transactions, ETags, and safe error
  envelopes. They verify direct calls, not only UI button visibility.
- **UI component tests** mock only the API boundary and assert accessible
  labels, role modes, form preservation, drill-down links, and all important
  loading/empty/error/conflict states.
- **UI-style and responsive tests** inspect Zen Green tokens, non-color cues,
  keyboard focus, semantic structure, clipping/overflow, and desktop/tablet/
  mobile layout behavior.
- **Authorization tests** use separate Requester, IT Staff, and Administrator
  sessions and attempt permitted and forbidden calls directly, including
  forged IDs, roles, performers, and status confirmations.
- **Workflow tests** run multi-step lifecycle scenarios with more than one
  staff actor, several Actions Taken, status gates, requester indication,
  closure, cancellation, and reopening.
- **Migration-regression tests** create a Lab 3-shaped fixture, run the Lab 4
  migration/backfill/seed, compare IDs and relationships, and run earlier Lab
  2–3 suites against the migrated database. The test does not depend on a
  developer’s existing database.
- **Performance-smoke tests** use a deterministic local fixture with at least
  1,000 Tickets and 20 Actions per busy Ticket. They check aggregate queries,
  pagination, query count, and response budgets without claiming production
  capacity.
- **E2E tests** run the integrated client/server with seeded accounts and
  capture evidence under `artifacts/lab-04/screenshots/`.

## 2. Fixtures and evidence rules

The test seed must include every status, every IT Priority, assigned and
unassigned Tickets, one Ticket with zero Actions, one with one Action, one with
multiple Actions by different staff, a follow-up-required Action, and isolated
zero-metric data. Test credentials come from environment variables; no
password is committed, logged, or rendered.

Each API test asserts status code, safe error code, authorization scope,
database side effects, and absence of sensitive fields. Each UI/E2E test uses
accessible queries and records screenshots only after the state is stable.
All tests use UTC fixtures but explicitly test the `Asia/Bangkok` local-day
boundary (`>= start`, `< end`).

## 3. Test matrix

| Test ID | Type | Requirement / AC | What it tests | Expected result | Automated test file | Final status |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | FR-01–07, BR-04–06, AC-02 | Validates Action Date/Time, including explicit timezone/UTC normalization, Description, Result, explicit Follow-Up Required?, conditional Follow-up Note, Attachment Notes, unknown fields, limits, and safe serializer. | Valid boundary values pass; timezone-less/malformed/future/over-limit values fail before persistence; `performedBy` is not writable. | `server/tests/lab-04/actions-taken.unit.test.ts` | Planned — not run |
| UNIT-02 | Unit | §4.5, BR-09–11, AC-05–06 | Exhaustive status adjacency matrix and resolution/closure/cancel/reopen gate. | Every listed transition passes only for IT Staff; every unlisted transition and missing evidence fails with the documented code. | `server/tests/lab-04/ticket-workflow.unit.test.ts` | Planned — not run |
| UNIT-03 | Unit | BR-12–14, AC-11 | ETag/version parser, compare-and-swap result, idempotency payload normalization, and stale error mapping. | Matching version succeeds; missing precondition is 428; stale version is 412; replay is safe; changed payload is 409. | `server/tests/lab-04/concurrency.unit.test.ts` | Planned — not run |
| UNIT-04 | Unit | §4.6, BR-15–17, AC-08–09 | Dashboard formulas, ACTIVE set, zero buckets, Asia/Bangkok 7-day half-open boundary, and stable preview ordering. | Counts match hand-calculated fixtures; records exactly at start are included and exactly at end are excluded; all buckets appear. | `server/tests/lab-04/dashboard-metrics.unit.test.ts` | Planned — not run |
| API-01 | API/integration | FR-02/04, AC-03 | Lists Actions for owned/accessible/missing Tickets, empty list, pagination, chronological ordering, and no Requester ID override. | Requester sees only own data; staff/admin see permitted data; empty is 200; foreign own-scope is safe 404. | `server/tests/lab-04/actions-taken.api.test.ts` | Planned — not run |
| API-02 | API/integration | FR-01/05/06, AC-01–02 | Creates an Action with all fields, derives performer from session, persists parent relation, increments Ticket version, and returns ETags. | 201 contains the complete safe representation; body performer/role/IDs cannot override session. | `server/tests/lab-04/actions-taken.api.test.ts` | Planned — not run |
| API-03 | API/integration | FR-03/07, AC-02/04 | Updates editable Action fields, preserves original performer/Ticket/createdAt, validates follow-up conditionality, and updates version. | 200 returns edited row; immutable/unknown fields fail; no partial mutation on validation failure. | `server/tests/lab-04/actions-taken.api.test.ts` | Planned — not run |
| API-04 | API/integration | BR-04–07, AC-02/14 | Boundary and safe-error matrix for malformed JSON, wrong types, blank strings, timezone-less/future dates, hidden fields, and 405 delete. | All errors use documented safe envelope and leave database unchanged. | `server/tests/lab-04/actions-taken.api.test.ts` | Planned — not run |
| API-05 | API/integration | FR-06, §4.6 Requester, AC-08 | Requester dashboard ownership, counts, recent list, drill-down query, zero state, `window`, `asOf`, and timezone. | Server count equals SQL fixture; forged `userId` is rejected/ignored; foreign Ticket never appears. | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned — not run |
| API-06 | API/integration | §4.6 Staff, AC-09 | IT Staff dashboard unassigned/mine/urgent/recent metrics, all status/priority zero buckets, previews, and drill-downs. | Aggregate data is tenant-wide, current-user count is scoped correctly, and response is concise. | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned — not run |
| API-07 | API/integration | §4.6 Admin, AC-10 | Administrator dashboard reuse, active/inactive user counts, exact `isActive=true|false` User drill-down filters, safe previews, and role boundary. | Administrator receives read-only aggregate data and reversible user filters; Requester/IT Staff get 403; no mutation permission is implied. | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned — not run |
| API-08 | API/integration | §4.5, AC-05 | Positive and negative status transitions, owner/priority atomic update, required reasons, and response version. | Complete matrix is enforced; invalid transitions and same-status writes do not partially mutate. | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned — not run |
| API-09 | API/integration | Resolution gate, AC-06 | Direct crafted requests to Resolved/Closed with hidden/false/omitted confirmation or missing summary. | Backend rejects bypass with 400/409; valid evidence succeeds only when role/matrix/version are valid. | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned — not run |
| API-10 | API/integration | BR-10, AC-07 | Problem Appears Resolved indication, duplicate safety, allowed statuses, formal status unchanged, and staff clearing behavior. | Owner-only advisory record is created once; it never sets Resolved/Closed. | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned — not run |
| API-11 | API/integration | BR-12–14, AC-11 | Two sessions update one Ticket/Action with the same ETag; repeated Action create after the parent version advances; changed-payload retry. | Exactly one stale writer succeeds; loser gets 412; an exact replay is 200 even with a newer parent version, while changed payload is 409; no duplicates/partial writes. | `server/tests/lab-04/concurrency.api.test.ts` | Planned — not run |
| API-12 | API/integration | AC-10/14 | Administrator grouped-metric drill-down through `/api/admin/tickets`, exact filters, empty state, safe inspection links, and rejection of mutation/owner options. | Administrator gets a read-only filtered list; other roles get 403; invalid filters get 400; no queue/status/assignment capability is exposed. | `server/tests/lab-04/admin-dashboard-drilldown.api.test.ts` | Planned — not run |
| AUTH-01 | Authorization | §4.3, AC-03–04 | Full Action Taken matrix for Requester, IT Staff, and Administrator, including deep link/direct API. | Requester GET-own succeeds; Requester POST/PATCH/foreign GET fails; IT Staff/Admin read/write permitted scope succeeds. | `server/tests/lab-04/authorization.api.test.ts` | Planned — not run |
| AUTH-02 | Authorization | Dashboard matrix, AC-08–10 | Requester, staff, and admin dashboard endpoints with forged query/user IDs. | Each role reaches only its endpoint/data; no client parameter widens scope. | `server/tests/lab-04/authorization.api.test.ts` | Planned — not run |
| AUTH-03 | Authorization | §4.5, AC-05–06 | Requester/Admin status mutation, admin assignment, and client-hidden resolution controls through direct calls. | Requester and Administrator status/owner calls are 403; only IT Staff can transition or satisfy resolution gate. | `server/tests/lab-04/authorization.api.test.ts` | Planned — not run |
| AUTH-04 | Authorization | BR-18, AC-17 | Sensitive-field leakage across dashboards/actions/legacy Ticket routes. | No password hash, session, storage key, Internal Note, foreign Ticket, or forged performer is returned. | `server/tests/lab-04/authorization.api.test.ts` | Planned — not run |
| UI-01 | UI component | FR-02/04, UI §3.2, AC-03/14 | `ActionsTakenList` loading, empty, populated, Requester read-only, staff/admin edit affordance, and safe error states. | Accessible list/table shows all seven business fields; role controls match matrix; retry preserves Ticket page. | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned — not run |
| UI-02 | UI component | FR-06, UI §3.3, AC-02/14 | Create form fields, conditional Follow-up Note, read-only Performed by, inline validation, busy, success, and failed-submit preservation. | Labels/errors are associated; Save disabled while busy; invalid form never calls API; draft survives failure. | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned — not run |
| UI-03 | UI component | BR-12/14, AC-11/14 | Edit mode, immutable performer, stale conflict, Reload latest, and Cancel behavior. | Successful edit refreshes list; 412 keeps dirty draft and never silently overwrites it. | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned — not run |
| UI-04 | UI component | §4.6, UI §2, AC-08–10 | Requester/Staff/Admin metric cards, zero buckets, preview rows, accessible drill-down paths, and period label. | Card values/links match API data; zero cards remain visible; links use exact filters. | `client/tests/lab-04/RequesterDashboard.test.tsx`, `client/tests/lab-04/StaffDashboard.test.tsx` | Planned — not run |
| UI-05 | UI component | UI §5, AC-14–15 | Dashboard/action loading, forbidden, not-found, safe failure, keyboard focus, live announcements, and no raw HTML. | States are explicit and accessible; protected data does not flash; form text renders safely. | `client/tests/lab-04/RequesterDashboard.test.tsx`, `client/tests/lab-04/StaffDashboard.test.tsx`, `client/tests/lab-04/ActionsTaken.test.tsx` | Planned — not run |
| STYLE-01 | UI-style/accessibility | UI §1/5/7, AC-15/17 | Zen Green tokens, typography, focus ring, role/status/priority text cues, semantic headings/labels, modal focus trap, and console errors. | Visual checklist passes at required states; no new theme, color-only cue, warning, broken asset, or console error. | `e2e/lab-04/visual-checklist.spec.ts` | Planned — not run |
| RESP-01 | Responsive | UI §2.2/2.3/6, AC-15 | Staff and Requester dashboard at 1440×900, 1024×768, and mobile viewport. | Cards/grid/previews reflow with no clipping, overlap, or horizontal page scroll. | `e2e/lab-04/responsive.spec.ts` | Planned — not run |
| RESP-02 | Responsive | UI §3, AC-15 | Actions Taken table/card and form at desktop/tablet/mobile. | All fields and Save/Cancel remain reachable; long text wraps and conditional controls fit. | `e2e/lab-04/responsive.spec.ts` | Planned — not run |
| RESP-03 | Responsive | UI §4–6, AC-15/17 | Ticket workflow dialog, role shell, and regression screens at all widths. | Confirmation modal is usable, focus is trapped/restored, and existing Lab 2/3 screens remain responsive. | `e2e/lab-04/responsive.spec.ts`, `e2e/lab-03/responsive.spec.ts` | Planned — not run |
| WORK-01 | Workflow | AC-01–04, AC-14 | Staff opens a Ticket, creates two Actions by different staff, edits one, and Requester views the result. | Actions remain under one Ticket; performers differ correctly; Requester sees shared history but no write controls. | `server/tests/lab-04/actions-taken.workflow.test.ts`, `e2e/lab-04/actions-taken-flow.spec.ts` | Planned — not run |
| WORK-02 | Workflow/concurrency | AC-11/14 | Two actors edit/create against the same Ticket, including network retry and stale form. | One writer wins; stale form is preserved/reviewed; no duplicate Action or parent corruption occurs. | `server/tests/lab-04/concurrency.api.test.ts`, `e2e/lab-04/actions-taken-flow.spec.ts` | Planned — not run |
| WORK-03 | Workflow | AC-05–07 | Full lifecycle: New → Open → In Progress → Waiting → In Progress → Resolved → Closed, plus Reopened/Cancelled paths and requester indication. | Only matrix transitions work; gate evidence is required; final status and timestamps are correct. | `server/tests/lab-04/ticket-workflow.api.test.ts`, `e2e/lab-04/ticket-resolution.spec.ts` | Planned — not run |
| MIG-01 | Migration-regression | AC-12 | Lab 3-shaped database snapshot before/after migration: Users, Tickets, owners, statuses, priorities, Attachments, comments, notes, IDs, and storage keys. | Counts/IDs/relationships/data are unchanged; new columns have safe defaults; migration is transactional/recoverable. | `server/tests/lab-04/migration-regression.integration.test.ts` | Planned — not run |
| MIG-02 | Migration-regression | BR-19, AC-12 | Legacy Tickets with no Action rows and dashboard calculations after migration. | Legacy rows are valid, Action list is empty 200, and Ticket/dashboard metrics count them by existing fields only. | `server/tests/lab-04/migration-regression.integration.test.ts` | Planned — not run |
| MIG-03 | Migration-regression | BR-20, AC-13 | Run seed twice and compare controlled fixture counts, seed keys, statuses, priorities, owner states, and Action cardinalities. | Second run is idempotent; zero/one/multiple Actions and zero/non-zero metrics remain demonstrable. | `server/tests/lab-04/migration-regression.integration.test.ts` | Planned — not run |
| MIG-04 | Migration-regression | AC-17 | Run all Lab 2/3 API, component, E2E, auth, attachment, comments, notes, queue, and User Management suites on migrated data. | Earlier tests remain green without deleting or weakening coverage. | `server/tests/lab-02/**`, `server/tests/lab-03/**`, `client/tests/lab-02/**`, `client/tests/lab-03/**`, `e2e/lab-02/**`, `e2e/lab-03/**` | Planned — not run |
| REG-01 | Regression | AC-17 | Re-run Lab 3 authentication, session expiry, mandatory password change, logout, and role navigation behavior after the Lab 4 increment. | Existing login/session/role-shell behavior remains green; no protected content flashes. | `server/tests/lab-03/auth.unit.test.ts`, `server/tests/lab-03/auth.api.test.ts`, `client/tests/lab-03/Login.test.tsx`, `e2e/lab-03/authentication.spec.ts` | Planned — not run |
| REG-02 | Regression | AC-17 | Re-run Requester Ticket creation/list/detail, ownership, Attachment lifecycle, and Public Comment behavior. | Existing Requester-owned Ticket/Attachment/comment behavior remains unchanged and all earlier tests pass. | `server/tests/lab-03/requester-regression.api.test.ts`, `client/tests/lab-03/RequesterRegression.test.tsx`, `e2e/lab-03/requester-regression.spec.ts` | Planned — not run |
| REG-03 | Regression | AC-07, AC-17 | Re-run Problem Appears Resolved, IT Staff queue/detail, owner/priority/status operations, Public Comments, and Internal Notes. | Advisory indication remains non-resolving; staff operations and private-note boundaries remain correct. | `server/tests/lab-03/staff-ticket-detail.api.test.ts`, `server/tests/lab-03/comments-notes.api.test.ts`, `client/tests/lab-03/StaffTicketDetail.test.tsx`, `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned — not run |
| REG-04 | Regression | AC-17 | Re-run Administrator User Management, activation/role safety, and Administrator inspection behavior. | Existing admin account-management and read-only inspection behavior remains green; no new status/assignment privilege leaks. | `server/tests/lab-03/users-admin.api.test.ts`, `client/tests/lab-03/UserManagement.test.tsx`, `client/tests/lab-03/AdminTicketInspection.test.tsx`, `e2e/lab-03/user-administration.spec.ts` | Planned — not run |
| PERF-01 | Performance-smoke | AC-09/16 | Requester, staff, and admin dashboard aggregate calls on deterministic 1,000+ Ticket fixture. | p95 is under 750 ms locally, query count is bounded/no per-row N+1, response contains no full Ticket collection, and memory remains stable. | `server/tests/lab-04/performance-smoke.test.ts` | Planned — not run |
| PERF-02 | Performance-smoke | AC-01/16 | Paged Action list (20/100 rows) and create/update transaction under a busy Ticket. | p95 list is under 500 ms locally; pagination is bounded; create/update remains atomic and does not load unbounded history. | `server/tests/lab-04/performance-smoke.test.ts` | Planned — not run |
| E2E-01 | End-to-end | AC-08–10, AC-14–15 | Seeded Requester, IT Staff, and Administrator open their dashboards, verify cards/zero states, click drill-downs, and observe forbidden boundaries. | Each role sees correct metrics and destination; loading/failure/empty states and responsive evidence are captured. | `e2e/lab-04/dashboards.spec.ts` | Planned — not run |
| E2E-02 | End-to-end | AC-01–04, AC-11, AC-14 | IT Staff/Admin create and edit Actions; Requester views the same Ticket; follow-up validation and stale conflict are demonstrated. | Working list/create/edit/assign/read-only behavior and safe conflict feedback are visible in the integrated app. | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned — not run |
| E2E-03 | End-to-end | AC-05–07, AC-14 | Staff performs permitted transitions, confirmation gate, closure/cancel/reopen, and Requester advisory indication. | Status summary refreshes correctly; client bypass is rejected; lifecycle evidence is captured. | `e2e/lab-04/ticket-resolution.spec.ts` | Planned — not run |
| E2E-04 | End-to-end/regression | AC-15/17 | Final integrated pass through Login, password change, Requester Tickets/Attachments/Comments, Staff queue/Notes, Admin Users, dashboards, and Action Detail. | No earlier role, ownership, attachment, comment, note, or admin behavior regresses; console is clean. | `e2e/lab-04/final-regression.spec.ts` | Planned — not run |

## 4. Acceptance-criterion traceability

| Acceptance criterion | Planned tests |
|---|---|
| AC-01 | UNIT-01, API-02, WORK-01, E2E-02 |
| AC-02 | UNIT-01, API-02–04, UI-02, E2E-02 |
| AC-03 | API-01, AUTH-01, UI-01, E2E-02 |
| AC-04 | AUTH-01, AUTH-04, API-02–03, E2E-02 |
| AC-05 | UNIT-02, API-08, AUTH-03, WORK-03, E2E-03 |
| AC-06 | UNIT-02, API-09, AUTH-03, WORK-03, E2E-03 |
| AC-07 | API-10, WORK-03, E2E-03 |
| AC-08 | UNIT-04, API-05, AUTH-02, UI-04, E2E-01 |
| AC-09 | UNIT-04, API-06, AUTH-02, UI-04, PERF-01, E2E-01 |
| AC-10 | API-07, API-12, AUTH-02, AUTH-03, AUTH-04, UI-04, E2E-01 |
| AC-11 | UNIT-03, API-11, UI-03, WORK-02, E2E-02 |
| AC-12 | MIG-01, MIG-02, MIG-04 |
| AC-13 | MIG-03 |
| AC-14 | API-04, UI-01–05, WORK-01–03, E2E-01–03 |
| AC-15 | STYLE-01, RESP-01–03, UI-05, E2E-01/E2E-04 |
| AC-16 | PERF-01–02 |
| AC-17 | MIG-04, E2E-04 |

## 5. Required coverage checklist before approval

- [ ] Unit coverage exists for field boundaries, full transition matrix,
  resolution gate, formulas/date boundaries, version/ETag, and idempotency.
- [ ] API/integration coverage exists for create/list/update Actions Taken,
  every dashboard endpoint, workflow, safe errors, and retained APIs.
- [ ] UI component coverage exists for DashboardMetricCard,
  ActionsTakenList, ActionTakenForm, role modes, and all important states.
- [ ] UI-style and responsive coverage exists at desktop, tablet, and mobile.
- [ ] Authorization coverage directly calls every new read/write endpoint with
  every role and attempts forged actor/owner/requester values.
- [ ] Workflow coverage demonstrates multiple Actions on one Ticket, different
  performers, ownership continuity, status transitions, resolution gate,
  cancellation, reopening, and Requester feedback.
- [ ] Migration-regression coverage compares pre/post records and runs earlier
  Lab 2/3 suites; seed runs twice.
- [ ] Performance-smoke coverage records p95, query count, and bounded payload.
- [ ] E2E coverage passes on the integrated main branch and produces readable
  screenshots/evidence.
- [ ] All final rows change from `Planned — not run` to `Pass` or receive an
  explicitly approved exception before release.
