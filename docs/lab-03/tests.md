# Lab 3 Test Plan

Each test maps to the engineering contract. Requirements and acceptance
criteria are defined in [specification.md](specification.md), with API and UI
details in [api-spec.md](api-spec.md) and [ui-spec.md](ui-spec.md).

## 1. Test approach

- Unit tests cover validation, password/code-point boundaries, opaque session
  parsing and safe user-shape helpers.
- API/integration tests exercise real middleware, persistence, role guards,
  ownership checks, migration preservation and idempotent seed behavior.
- UI/component tests use accessible queries and mock only the API boundary.
- UI-style and responsive checks inspect the Zen Green role shell, badges,
  private-note differentiation and desktop/tablet/mobile layouts.
- E2E runs against the integrated app with distinct Requester, IT Staff and
  Administrator accounts. No test records a plaintext password, session cookie
  or secret in a committed artifact.

Latest execution evidence, verified on 2026-09-24:

| Suite | Command | Result |
|---|---|---|
| Client build | `cd client; npm.cmd run build` | Pass |
| Client Lab 3 | `cd client; npx.cmd vitest run tests/lab-03` | 7 files / 14 tests passed |
| Server build | `cd server; npm.cmd run build` | Pass |
| Server Lab 3 | `cd server; npx.cmd vitest run tests/lab-03 --no-file-parallelism` | 8 files / 31 tests passed |
| Integrated E2E | `npx.cmd playwright test` | 9 tests passed |

The Playwright web server uses `server/e2e-server.mjs`, which builds the
server before starting it because Node 25's `tsx` source runner raises
`uv_os_get_passwd ENOMEM` in this workspace. This is an environment
workaround; the integrated E2E assertions passed. The responsive spec produces 18 screenshots: Login, Change Password,
Requester Ticket Detail, IT Staff Queue, IT Staff Ticket Detail and
Administrator User Management at desktop/tablet/mobile. Administrator Ticket
Inspection is verified by the staff-flow E2E deep-link check; the explicit
screenshot list in `ui-spec.md` requires Administrator User Management.

The release gate is the Lab 3 suite listed below. Pre-Lab 3 tests that still
assert the retired Development Requester selector, `requesterId` query
parameters, or unauthenticated protected routes are intentionally not release
gates; those contracts were superseded by the authenticated-identity rules.
Requester Ticket/Attachment continuity is instead covered by API-03, MIG-01,
MIG-02 and E2E-01, while retained Lab 2 validation helpers remain exercised by
their focused tests.

## 2. Automated tests

| Test ID | Type | Requirement / AC? | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-01, BR-02 | Normalize email; validate password policy and Unicode code-point boundaries. | Invalid values fail; the 12-128-character policy is enforced by code points. | `server/tests/lab-03/auth.unit.test.ts` | Pass |
| UNIT-02 | Unit | BR-03, FR-02 | Parse the opaque session cookie and return a safe authenticated-user shape. | Only the session token is read; password/hash fields are never exposed. | `server/tests/lab-03/auth.unit.test.ts` | Pass |
| API-01 | API | AC-01, AC-02 | Valid/invalid/inactive login, five-failure throttle, `/me`, logout, mandatory password change and a protected call after logout. | Correct session routing; cookie is HttpOnly/SameSite and Secure in HTTPS; generic safe errors and `429` throttle; change unlocks the app and the revoked session gets `401`. | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-02 | Security/authorization | AC-03, AC-08 | Direct requester and staff-route authorization, spoofed ownership input, requester role rejection and IT Staff attachment inspection. | No session is `401`; role-forbidden is `403`; authenticated ownership is used; Staff may read attachment metadata/download; protected data is not leaked. | `server/tests/lab-03/auth.api.test.ts`, `server/tests/lab-03/requester-regression.api.test.ts`, `server/tests/lab-03/staff-queue.api.test.ts`, `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-03 | API regression | AC-03, AC-05 | Migrated requester creates/lists/views an own Ticket without `requesterId`, submits **Problem Appears Resolved**, and calls retired selector aliases directly. | Ownership works; a supplied requester ID cannot override the session; the indication does not change formal status; `/development-requesters` and `/requesters` return `410 ENDPOINT_RETIRED`. | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| API-04 | API | AC-04, AC-05 | Active IT Staff/Administrator owner options plus queue search, combined filters, sort, pages and assigned/unassigned/mine views. | Only active permitted owner summaries are returned; queue data/meta and invalid query handling are correct. | `server/tests/lab-03/staff-queue.api.test.ts`, `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-05 | API | AC-05 | Claim, assign/reassign, IT Priority changes and valid status transitions including Waiting for Requester, Reopened, Resolved and Closed. | IT Staff succeeds for permitted operations with explicit confirmation for formal resolution/closure; Administrator may change only IT Priority; invalid updates do not partially mutate. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-06 | Security/authorization | AC-05, AC-08 | Requester invokes staff endpoints; Administrator invokes queue, assignment, status and unsupported staff operations. | Requester is `403`; Administrator is `403` for queue/assignment/status and may change only IT Priority, with no forbidden data leak. | `server/tests/lab-03/staff-queue.api.test.ts`, `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-07 | API | AC-06 | Public Comment reader/poster matrix, safe text rendering and append-only behavior. | Permitted readers/posters succeed, Administrator can read but cannot post, content is rendered as text, and edit/delete are unavailable. | `server/tests/lab-03/comments-notes.api.test.ts`, `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-08 | Security/authorization | AC-06, AC-08 | Requester queries/posts Internal Notes; Administrator reads/posts Internal Notes. | Requester receives `403` without note content; Administrator may read but cannot post. | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-09 | API | AC-07 | Admin user list/search/filter; create one-role Users with active/inactive state and an initial password; edit/reset. | Required fields and roles are validated; activation is preserved; password is Argon2id-hashed, never returned; first login is gated and reset requires a change. | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-10 | Security/authorization | AC-07, AC-08 | Non-admin direct User endpoints and unsafe Admin edits. | Forbidden, self-deactivation, last-active-Administrator, duplicate-email and assigned-owner safeguards hold. | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-11 | API/security | BR-03, safe errors | Session revocation, cookie attributes, origin protection and generic authentication failures/throttling. | Safe `401`/`403`/`429` responses; no password, hash, cookie or internal error detail leaks. | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-12 | Security/authorization | AC-06, AC-08 | Administrator opens shared `/tickets/:id` inspection and reads Ticket/Public Comments/Internal Notes without Attachment metadata. | Admin inspection is `200`; response omits `attachments`; notes are read-only; staff queue/mutation authorization is unchanged. | `server/tests/lab-03/requester-regression.api.test.ts` | Pass |
| MIG-01 | Migration/regression | AC-09 | Preserve Lab 2 Ticket and Attachment identity, ownership, history, counts, Ticket Numbers, IT Priority backfill and storage references. | No record is re-keyed or lost; all relationships and attachment bytes remain valid. | `server/tests/lab-03/migration-regression.integration.test.ts` | Pass |
| MIG-02 | Migration/regression | AC-09 | Run seed twice with environment-only seed password and verify required users, tickets, comments, notes and password-hash constraints. | Required role/activation counts exist once; ownership/status/priority data is realistic; hashes are present and no duplicate seed records appear. | `server/tests/lab-03/migration-regression.integration.test.ts` | Pass |
| UI-01 | UI component | AC-01, AC-02, AC-08 | Login/Change Password labels, validation, busy/error and route gate plus role-specific shell navigation, badge and Logout. | Accessible generic failures; normal navigation remains unavailable until change; Logout removes access. | `client/tests/lab-03/Login.test.tsx`, `client/tests/lab-03/ChangePassword.test.tsx` | Pass |
| UI-02 | UI component | AC-03, AC-05, AC-06 | Requester shell/Ticket regression has authenticated identity but no selector/requester control; Public Comments and the non-resolving indication are present while Internal Notes are absent. | Existing screens remain usable; indication feedback is clear and formal status does not become Resolved/Closed. | `client/tests/lab-03/RequesterRegression.test.tsx` | Pass |
| UI-03 | UI component | AC-04 | Queue filters, table/card state, pagination, first-use empty, no-results and retry failure. | Correct query/state accessibility and distinct empty/no-results feedback. | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-04 | UI component | AC-05, AC-06 | Staff Detail owner-option loading/empty/failure, work controls, formal status confirmation and communication panels. | Only active IT Staff/Administrators can be selected; confirmation and safe failure states work; Notes are visually private. | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-05 | UI component | AC-07, AC-10 | User list/Create/Edit/deactivation drawer, combined search/role filters, activation/password validation and keyboard focus containment. | Activation is explicit; initial-password confirmation is accessible; no password is exposed after save; filters combine and clear; focus stays in the drawer and returns to its invoking action. | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-06 | UI component | AC-06, AC-08 | Administrator shared Ticket inspection displays read-only Ticket, Public Comments and Internal Notes without work controls, composers or Attachment UI. | Authorized deep link renders both communication regions and uses no staff mutation control. | `client/tests/lab-03/AdminTicketInspection.test.tsx` | Pass |
| STYLE-01 | UI-style | UI spec 4-6 | Role navigation, role/status/priority badges, Public Comment vs Internal Note distinction, labels, keyboard focus and non-colour cues. | Screenshot/DOM assertions meet the visual and accessibility contract. | `e2e/lab-03/visual-checklist.spec.ts` | Pass |
| RESP-01 | Responsive | AC-10 | Login/Change Password, requester Ticket, queue, staff detail and User Management at 1440/1024/390 px plus a 320 px overflow check. | No clipping/overflow; Queue uses a readable table at desktop (>=1200 px) and cards at tablet/mobile (<=1199 px). | `e2e/lab-03/responsive.spec.ts` | Pass |
| E2E-01 | E2E | AC-01-03, AC-09 | Wrong/correct/inactive login, first-login change, logout/protected-route gate and authenticated Requester Create/My Tickets/Ticket Detail/Attachment regression without client `requesterId`. | Safe authentication behavior; migrated requester flow preserves ownership and attachment behavior. | `e2e/lab-03/authentication.spec.ts`, `e2e/lab-03/requester-regression.spec.ts` | Pass |
| E2E-02 | E2E | AC-04-06, AC-08 | Staff searches, claims, updates IT Priority/status, posts Public Comment/Internal Note; direct role deep links and Requester/Administrator UI checks verify visibility/read-only boundaries. | Queue/detail state updates; cross-role routes show safe Forbidden; Requester sees only Public Comment; Administrator sees both regions without work controls/composers. | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| E2E-03 | E2E | AC-07-08 | Admin creates an active one-role User with an initial password; the new User completes the mandatory first-login change. | User creation persists; first login reaches only Change Password; normal Requester navigation unlocks after change. | `e2e/lab-03/user-administration.spec.ts` | Pass |

## 3. Acceptance-criterion traceability

Every criterion in `specification.md` has at least one passing test. Security
tests intentionally use direct API calls, because a hidden button or client-
side route guard cannot prove authorization.

| Acceptance criterion | Passing evidence | Final result |
|---|---|---|
| AC-01 | UNIT-01/02, API-01/11, UI-01, E2E-01 | Pass |
| AC-02 | UNIT-01/02, API-01, UI-01, E2E-01 | Pass |
| AC-03 | API-02/03, UI-02, MIG-01, E2E-01 | Pass |
| AC-04 | API-04, UI-03, RESP-01, E2E-02 | Pass |
| AC-05 | API-05/06, UI-04, E2E-02 | Pass |
| AC-06 | API-07/08/12, UI-04/06, STYLE-01, E2E-02 | Pass |
| AC-07 | API-09/10, UI-05, E2E-03 | Pass |
| AC-08 | API-02/06/08/10/11/12, UI-06, E2E-02/03 | Pass |
| AC-09 | MIG-01/02, API-03, E2E-01 | Pass |
| AC-10 | UI-01-06, STYLE-01, RESP-01, E2E-01-03 | Pass |

## 4. Traceability and release gates

| Area | Acceptance criteria | Passing evidence |
|---|---|---|
| Authentication/session | AC-01, AC-02, AC-08 | UNIT-01/02, API-01/11, UI-01, E2E-01 |
| Requester continuity/ownership | AC-03, AC-08, AC-09 | API-02/03, MIG-01/02, UI-02, E2E-01 |
| Staff queue/operations | AC-04, AC-05 | API-04-06, UI-03/04, E2E-02 |
| Comments and Notes | AC-06, AC-08 | API-07/08/12, UI-04/06, STYLE-01, E2E-02 |
| User administration | AC-07, AC-08 | API-09/10, UI-05, E2E-03 |
| Responsive/safe UI | AC-10 | UI-01-06, STYLE-01, RESP-01 |

Release is blocked by any failed security/authorization or
migration/regression test, an unreviewed error response containing sensitive
detail, or a missing test type listed in the labsheet (unit, API/integration,
UI, UI-style, responsive, security/authorization, migration/regression and
E2E). The latest Lab 3 run satisfies all listed gates.
