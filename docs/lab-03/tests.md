# Lab 3 Test Plan

Each test maps to the engineering contract before implementation. The files
listed below are planned evidence paths; `Pass` is the acceptance target, not a
claim that the Lab 3 implementation has already run. Update the Final column
after implementation and review. Requirements and acceptance criteria are
defined in [specification.md](specification.md), with API and UI details in
[api-spec.md](api-spec.md) and [ui-spec.md](ui-spec.md).

## 1. Test approach

- Unit tests isolate validation, password/session helpers, role guards, status
  transition rules, queue-query composition and migration mapping decisions.
- API/integration tests use a disposable PostgreSQL database and exercise real
  middleware, persistence and direct forbidden calls.
- UI/component tests use accessible queries and mock only the API boundary.
- UI-style and responsive checks inspect the Zen Green role shell, badges,
  private-note differentiation and desktop/tablet/mobile layouts.
- E2E runs against the integrated app with distinct Requester, IT Staff and
  Administrator accounts. No test records a plaintext password, session cookie
  or secret in a committed artifact.

## 2. Planned automated tests

| Test ID | Type | Requirement / AC? | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-01, BR-02 | Normalize email; validate password and hash/verify helper. | Invalid values fail; hash verifies but is not plaintext. | `server/tests/lab-03/auth.unit.test.ts` | Pass |
| UNIT-02 | Unit | BR-03, FR-02 | Session creation, expiry/revocation and password-change gate. | Opaque session only; gated route is denied. | `server/tests/lab-03/auth.unit.test.ts` | Pass |
| UNIT-03 | Unit | BR-05, BR-06, BR-11 | Every permitted/forbidden status transition, initial IT Priority copy and Requester indication rules; claim/owner validation. | Valid transition/indication persists; invalid gives conflict/no mutation and never lets Requester set `RESOLVED`/`CLOSED`. | `server/tests/lab-03/staff-ticket.unit.test.ts` | Pass |
| UNIT-04 | Unit | BR-07 | Trim/length validation and append-only comment/note policy. | Whitespace/oversize rejected; no edit/delete operation. | `server/tests/lab-03/comments-notes.unit.test.ts` | Pass |
| UNIT-05 | Unit | BR-08 | Duplicate email, self-deactivation and last-admin guard. | All unsafe mutations rejected. | `server/tests/lab-03/users.unit.test.ts` | Pass |
| UNIT-06 | Unit | AC-07, BR-02, BR-08 | Validate User creation's required 12–128-character initial password and explicit boolean `isActive`; preserve activation and set the mandatory password-change state. | Missing/invalid password or activation fails with validation; both active and inactive selections are preserved, password is hashed only, and `mustChangePassword=true`. | `server/tests/lab-03/users.unit.test.ts` | Pass |
| API-01 | API | AC-01, AC-02 | Valid/invalid/inactive login, five-failure throttle, `/me`, logout, mandatory password change and a protected call after logout. | Correct session routing; cookie is HttpOnly/SameSite and Secure in HTTPS; generic safe errors and `429` throttle; change unlocks app and the revoked session gets `401`. | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-02 | Security/authorization | AC-03, AC-08 | Direct requester list/detail/attachment calls as another requester/no session; IT Staff attachment inspection. | No session is `401`; role-forbidden is `403`; a foreign or missing requester-owned resource is indistinguishable `404`; no protected body/bytes leak; Staff may read metadata/download, while Admin Attachment calls are forbidden. | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-03 | API regression | AC-03, AC-05 | Migrated requester creates/lists/views own Ticket without `requesterId`, submits **Problem Appears Resolved**, and calls retired selector aliases directly. | Ownership works; supplied requester ID is rejected, the indication stores owner/time without changing formal status, and `/development-requesters`/`/requesters` return `410 ENDPOINT_RETIRED`. | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| API-04 | API | AC-04, AC-05 | Active IT Staff/Administrator owner options plus queue search, combined filters, sort, pages, assigned/unassigned/mine. | Only active permitted owner summaries are returned; queue data/meta and invalid query `400`. | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-05 | API | AC-05 | Claim, assign/reassign to active IT Staff/Administrator, initial/copied and changed IT Priority, every status transition including Waiting for Requester and formal resolution/closure. | IT Staff succeeds for permitted operations with explicit confirmation for `RESOLVED`/`CLOSED`; Administrator may change IT Priority only; no partial invalid update. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-06 | Security/authorization | AC-05, AC-08 | Requester invokes staff endpoints; Administrator invokes queue, assignment, status and unsupported staff operations. | Requester is `403`; Administrator is `403` for queue/assignment/status and may change only IT Priority, with no forbidden data leak. | `server/tests/lab-03/staff-queue.api.test.ts`, `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-07 | API | AC-06 | Public Comment reader/poster matrix, safe text rendering and append-only behavior. | Owner/staff behavior succeeds, Administrator can read but cannot post, content is rendered as text, and edit/delete are unavailable. | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-08 | Security/authorization | AC-06, AC-08 | Requester queries/posts Notes; Administrator reads/posts Notes. | Requester receives `403`/no content; Administrator may read but cannot post. | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-09 | API | AC-07 | Admin user list/search/filter; create one-role Users with active and inactive `isActive` values and an initial password; edit/reset. | Create requires `isActive` and `initialPassword` (omission is `400`), returns the selected activation and `mustChangePassword=true`, stores only an Argon2id hash, never returns password/hash, denies inactive login generically, and gates active first login to Change Password; reset sets required change. | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-10 | Security/authorization | AC-07, AC-08 | Non-admin direct User endpoints; unsafe admin edits, including deactivation/role change for a current Ticket Owner. | Forbidden/self/last-admin/duplicate/assigned-owner safeguards hold. | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-11 | API | BR-03, safe errors | Expired/revoked session, malformed JSON, CSRF/origin failure, cookie attributes and unexpected fault. | Safe `401`/`400`/`500`; unsafe cookie requests require the configured origin; never stack/SQL/cookie/hash. | `server/tests/lab-03/auth.api.test.ts` | Pass |
| MIG-01 | Migration/regression | AC-09 | Apply Lab 3 migration to Lab 2 fixture and inspect IDs/FKs/counts, Ticket Numbers, IT Priority backfill and attachment storage references, including a forced preflight failure. | Successful migration preserves identity, ownership, metadata and bytes; existing `itPriority` equals `requestedPriority`; a failed preflight/transaction leaves the fixture unchanged; no record is re-keyed or lost. | `server/tests/lab-03/migration-regression.integration.test.ts` | Pass |
| MIG-02 | Migration/regression | AC-09 | Run seed twice with environment-only seed password and verify final password-hash non-null constraint. | At least four active/one inactive Requesters, three active/one inactive IT Staff and one active Administrator exist once; realistic assigned/unassigned Tickets include active IT Staff and Administrator owners; safe example comments and notes exist; hashes only and every active account must change password. | `server/tests/lab-03/migration-regression.integration.test.ts` | Pass |
| UI-01 | UI component | AC-01, AC-02, AC-08 | Login/Change Password labels, validation, busy/error and route gate plus role-specific shell navigation, badge and Logout. | Accessible, generic failure; only permitted links render; normal routes remain unavailable until change and Logout removes access. | `client/tests/lab-03/Login.test.tsx`, `client/tests/lab-03/ChangePassword.test.tsx` | Pass |
| UI-02 | UI component | AC-03, AC-05, AC-06 | Requester shell/Ticket regression has identity but no selector/requester control; Public Comments and the confirmed Problem Appears Resolved indication are present while Internal Notes are absent. | Existing screens remain usable; indication feedback is clear and formal status does not become Resolved/Closed. | `client/tests/lab-03/RequesterRegression.test.tsx` | Pass |
| UI-03 | UI component | AC-04 | Queue filters, table/card state, pagination, first-use empty, no-results and retry failure. | Correct query/state accessibility and distinct empty/no-results feedback. | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-04 | UI component | AC-05, AC-06 | Staff Detail owner-option loading/empty/failure, work controls, formal status confirmation and communication panels. | Only active IT Staff/Administrators can be selected; requester indication is visible; `RESOLVED`/`CLOSED` confirmation and failure states are safe; Notes visually/semantically private. | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-05 | UI component | AC-07 | User list/Create/Edit/deactivation dialogs, combined search/role filters and all list states; create with each activation state, one role, initial password and confirmation. | The active/inactive choice is visible and submitted as `isActive`, initial password/confirmation validation is accessible, no confirmation/password is exposed after save, and filters combine and clear. | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| STYLE-01 | UI-style | UI spec §§0–5 | Role badge text/contrast, Zen Green token use, status labels, Requester resolution feedback, public vs private note distinction, labels, keyboard focus and non-colour cues. | Screenshot/DOM assertions meet visual and accessibility contract. | `client/tests/lab-03/visual-style.test.tsx` | Pass |
| RESP-01 | Responsive | AC-10 | Login/Change Password, requester Ticket, queue, staff detail and User Management at 1440/1024/390 px plus a 320 px overflow check. | No clipping/overflow; table-to-card/nav behavior works. | `e2e/lab-03/responsive.spec.ts` | Pass |
| E2E-01 | E2E | AC-01–03, AC-05 | Requester initial-login change, create Ticket, attachment regression, indicate Problem Appears Resolved, logout/login. | Own new/historical Ticket visible only after auth; indication is recorded without formal resolution. | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-02 | E2E | AC-04–06 | Staff searches, claims/reassigns, updates priority/status with formal confirmation, posts public/internal messages; Admin read-only Note inspection. | Queue/detail state updates; requester sees the Public Comment and indication but no Internal Note. | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| E2E-03 | E2E | AC-07–08 | Admin creates active and inactive Users with one role and required initial passwords, edits/deactivates/reactivates/resets them; role deep links and direct API restrictions. | Selected activation persists; active first login reaches only Change Password, inactive login returns a generic failure, reset re-applies the gate, and Admin guards hold. | `e2e/lab-03/user-administration.spec.ts` | Pass |

## 3. Acceptance-criterion traceability

Every criterion in `specification.md` has at least one planned test. The
security tests are intentionally direct API calls, because a hidden button or
client-side route guard cannot prove authorization.

| Acceptance criterion | Planned evidence | Final result |
|---|---|---|
| AC-01 | UNIT-01/02, API-01/11, UI-01, E2E-01 | Pass |
| AC-02 | UNIT-02, API-01, UI-01, E2E-01 | Pass |
| AC-03 | API-02/03, UI-02, MIG-01, E2E-01 | Pass |
| AC-04 | API-04, UI-03, RESP-01, E2E-02 | Pass |
| AC-05 | UNIT-03, API-05/06, UI-04, E2E-02 | Pass |
| AC-06 | UNIT-04, API-07/08, UI-04, STYLE-01, E2E-02 | Pass |
| AC-07 | UNIT-05/06, API-09/10, UI-05, E2E-03 | Pass |
| AC-08 | API-02/06/08/10/11, E2E-03 | Pass |
| AC-09 | MIG-01/02, API-03, E2E-01 | Pass |
| AC-10 | UI-01–05, STYLE-01, RESP-01, E2E-01–03 | Pass |

## 4. Traceability and release gates

| Area | Acceptance criteria | Evidence |
|---|---|---|
| Authentication/session | AC-01, AC-02, AC-08 | UNIT-01/02, API-01/11, UI-01, E2E-01 |
| Requester continuity/ownership | AC-03, AC-08, AC-09 | API-02/03, MIG-01/02, UI-02, E2E-01 |
| Staff queue/operations | AC-04, AC-05 | UNIT-03, API-04–06, UI-03/04, E2E-02 |
| Comments and Notes | AC-06, AC-08 | UNIT-04, API-07/08, UI-04, STYLE-01, E2E-02 |
| User administration | AC-07, AC-08 | UNIT-05/06, API-09/10, UI-05, E2E-03 |
| Responsive/safe UI | AC-10 | UI-01–05, STYLE-01, RESP-01 |

Release is blocked by any failed security/authorization or
migration/regression test, an unreviewed error response containing sensitive
detail, or a missing test type listed in the labsheet (unit, API/integration,
UI, UI-style, responsive, security/authorization, migration/regression and
E2E).
