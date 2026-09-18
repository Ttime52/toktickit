# Lab 3 Sprint Engineering Specification

**Product:** TokTickIT  
**Version:** 1.0 — pre-implementation contract  
**Status:** Pre-implementation source-of-truth contract for the Lab 3 increment

`MUST` is an observable requirement. This specification is deliberately additive
to Lab 2: the existing Ticket, Category, RelatedSystem and Attachment history
is retained. Detailed request/response contracts are in
[api-spec.md](api-spec.md); visual rules are in [ui-spec.md](ui-spec.md); the
test trace is in [tests.md](tests.md).

## 1. Sprint Goal

Replace Lab 2's Development Requester selector with authenticated, single-role
Users and server-side authorization. Deliver the first operational IT Staff
workflow (queue, assignment, IT Priority, status, Public Comments and Internal
Notes), a Requester resolution indication, and a deliberately small
Administrator User Management screen, while preserving every existing
Requester Ticket and Attachment.

## 2. Stakeholder Request Interpretation

Requesters need to sign in, change a supplied initial password, create and
track only their own problems, communicate publicly about them, and indicate
when a problem appears resolved. IT Staff need one searchable work queue and a
controlled way to take or reassign work, prioritise it, update its status,
formally resolve or close it, and leave private working notes. Administrators
need to create and maintain the accounts that make this possible. The client
may guide users, but the API is the authority for identity, ownership and role.

## 3. Scope

### Included

- Login, logout, current-user retrieval, mandatory first-password change, and
  an authenticated server-side session.
- Bounded failed-login attempts with generic throttling feedback (no permanent
  lockout or account-enumeration signal).
- One permitted role per User: `REQUESTER`, `IT_STAFF`, or `ADMINISTRATOR`;
  activation is tracked separately.
- Migration of Lab 2 Development Requesters and their owned records to Users.
- Requester regression: authenticated create, own-list, own-detail and the
  existing Attachment lifecycle without a requester selector or `requesterId`,
  plus the **Problem Appears Resolved** indication.
- IT Staff ticket queue, detail, claim/assign/reassign, IT Priority and status
  transitions including formal resolution/closure; Public Comments and
  Internal Notes.
- Administrator create/search/filter/edit/activate/deactivate User functions
  and setting a new initial password.
- Zen Green role navigation, role badge, responsive states, safe errors, and
  tests/evidence for the full increment.

### Excluded

- Self-registration, email invitations/reset mail, OAuth/SSO/MFA, password
  recovery, permanent account lockout, account-unlocking/approval workflows,
  multi-tenant/customer administration, production deployment and audit/history.
- Multiple roles, departments, profile photos, user deletion, bulk actions,
  import/export, user-list pagination, multi-column sorting or advanced
  simultaneous filters.
- Actions Taken, SLA/KPI dashboards, notifications, and a separate
  resolution-confirmation/close workflow owned by the Requester. The
  Requester's **Problem Appears Resolved** indication is included, but only IT
  Staff may formally set `RESOLVED` or `CLOSED`; tenant support and advanced
  identity administration are excluded.
- Changing Lab 2 Category, Related System, Ticket Number or Attachment storage
  semantics except where authentication replaces requester context.

## 4. Functional Requirements

| ID | Requirement |
|---|---|
| FR-01 | A User MUST log in with email/password, receive only an HttpOnly session cookie, retrieve the current identity, log out, and be blocked from normal application routes while `mustChangePassword` is true. |
| FR-02 | The backend MUST establish identity from the session, never from client `userId`, role, or `requesterId` input, and reject inactive Users. |
| FR-03 | A Requester MUST retain Lab 2 create/list/detail/Attachment behavior for only Tickets whose `requesterId` is their User ID and may submit one **Problem Appears Resolved** indication on an owned Ticket. |
| FR-04 | IT Staff MUST be able to search/filter/sort/page all Tickets, view Ticket Detail, claim an unassigned Ticket, assign/reassign it to an active IT Staff or Administrator User, set IT Priority, and make permitted status transitions including formal resolution/closure. |
| FR-05 | Every authenticated User who may view a Ticket MUST see Public Comments; the Requester may post only to an owned Ticket and IT Staff may post to any Ticket. Internal Notes MUST be visible to IT Staff and Administrators, but postable only by IT Staff. |
| FR-06 | An Administrator MUST search/filter Users, create one User with exactly one role, an explicitly selected activation state and a required initial password, edit name/email/role/activation, and reset an initial password. The create API MUST require the boolean `isActive` field (it MUST NOT silently default to active) and MUST prevent duplicate email, self-deactivation and removal of the last active Administrator. |
| FR-07 | The shell MUST show authenticated name, email, role badge, permitted password action, only permitted navigation and Logout. It MUST show safe loading, empty, no-results, validation, busy, forbidden and failure states. |
| FR-08 | Protected APIs MUST apply the authorization matrix below on the server, including direct calls and deep links. Hiding a control is not authorization. |
| FR-09 | Migration and idempotent seed MUST preserve Lab 2 records/foreign-key ownership and provide usable local test accounts without plaintext passwords in source or the database. |

### 4.1 Authorization matrix

`own` means the Ticket's requester is the authenticated User. `all` means all
Tickets. A dash means the endpoint must return `403 FORBIDDEN`, even when a
screen button is hidden. All protected non-login API endpoints require an
authenticated, active session; `/api/health` remains public and a user with
`mustChangePassword=true` may use only `GET /auth/me`,
`POST /auth/change-password`, and `POST /auth/logout` among protected routes.

| Endpoint / operation | Requester | IT Staff | Administrator |
|---|---|---|---|
| `GET /api/health` | public | public | public |
| `POST /api/auth/login` | public | public | public |
| `POST /api/auth/logout` | self | self | self |
| `GET /api/auth/me` | self | self | self |
| `POST /api/auth/change-password` | self | self | self |
| `GET /api/categories` | yes | yes | yes |
| `GET /api/related-systems` | yes | yes | yes |
| `GET /api/development-requesters` (retired) | `410 ENDPOINT_RETIRED` | `410 ENDPOINT_RETIRED` | `410 ENDPOINT_RETIRED` |
| `GET /api/requesters` (retired alias) | `410 ENDPOINT_RETIRED` | `410 ENDPOINT_RETIRED` | `410 ENDPOINT_RETIRED` |
| `POST /api/tickets` | create as self | — | — |
| `GET /api/tickets` | own | — | — |
| `GET /api/tickets/:id` | own | — | all, read-only inspection |
| `POST /api/tickets/:id/attachments` | own upload | — | — |
| `GET /api/tickets/:id/attachments` | own metadata | all metadata | — |
| `GET /api/tickets/:id/attachments/:aid` | own metadata | all metadata | — |
| `GET /api/tickets/:id/attachments/:aid/download` | own bytes | all bytes | — |
| `DELETE /api/tickets/:id/attachments/:aid` | own soft-remove | — | — |
| `POST /api/tickets/:id/problem-appears-resolved` | own indication | — | — |
| `GET /api/tickets/:id/comments` | own | all | all |
| `POST /api/tickets/:id/comments` | own | all | — |
| `GET /api/tickets/:id/internal-notes` | — | all | all |
| `POST /api/tickets/:id/internal-notes` | — | all | — |
| `GET /api/staff/tickets` | — | all | — |
| `GET /api/staff/users` owner options | — | active IT Staff/Administrator summaries | — |
| `GET /api/staff/tickets/:id` | — | all | — |
| `PATCH /api/staff/tickets/:id` | — | all operations | IT Priority only |
| `GET /api/users` | — | — | all |
| `POST /api/users` | — | — | all |
| `PATCH /api/users/:id` | — | — | all |
| `POST /api/users/:id/reset-password` | — | — | all |

The Administrator is intentionally not a substitute IT Staff operator: it may
inspect Ticket, Public Comment and Internal Note information needed for account
support, may change only IT Priority through the explicitly authorized
operation, and cannot claim, assign, change status, or post comments/notes.
Formal Ticket resolution and closure remain IT Staff responsibilities. This
explicit decision keeps the minimal Administrator role distinct.

For an own-scoped route, a foreign Ticket ID is answered with the same safe
`404` as a missing resource; the `403` matrix entries are role/operation
forbidden calls. Neither response includes protected data.

## 5. Business Rules

| ID | Rule |
|---|---|
| BR-01 | Only an active User with valid credentials may log in. Email is trimmed, lower-cased for uniqueness, and validated as a normal email address. A User has exactly one permitted role and `isActive` state. |
| BR-02 | Passwords are never plaintext. Store an Argon2id adaptive password hash; login compares it server-side. Initial/reset passwords set `mustChangePassword=true`; changing it requires current password and a valid new password of 12–128 characters. |
| BR-03 | A session is opaque, HttpOnly, `Secure` in HTTPS, `SameSite=Lax`, server-stored/revocable, expires after eight hours of inactivity, and is destroyed on logout, password change/reset, deactivation, or expiry. |
| BR-04 | A Ticket's requester is immutable. Requester authorization is derived from `ticket.requesterId === session.userId`; no query/body requester ID is accepted. A role-forbidden response is `403` without protected data, while a foreign Ticket/Attachment/Comment/Note is deliberately indistinguishable from a missing resource (`404`) so existence is not leaked. |
| BR-05 | Ticket statuses are `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED`. New Tickets start `NEW`; only IT Staff may update status: `NEW→OPEN/CANCELLED`, `OPEN→IN_PROGRESS/WAITING_FOR_REQUESTER/CANCELLED`, `IN_PROGRESS→WAITING_FOR_REQUESTER/RESOLVED/CANCELLED`, `WAITING_FOR_REQUESTER→IN_PROGRESS/RESOLVED/CANCELLED`, `RESOLVED→CLOSED/REOPENED`, `CLOSED→REOPENED`, and `REOPENED→IN_PROGRESS/WAITING_FOR_REQUESTER/CANCELLED`. Moving to `RESOLVED` or `CLOSED` requires an explicit confirmation in the UI/API. Other transitions return `409 INVALID_STATUS_TRANSITION`. |
| BR-06 | An operational update may set `assignedToUserId`, `itPriority`, and/or one valid status transition. An assignment/claim/reassignment is IT Staff-only and must target an active IT Staff or Administrator User. An Administrator may change only IT Priority; it cannot assign or change status. Claim sets the caller as owner only when unassigned. The Requester **Problem Appears Resolved** action is a separate owner-only indication and never changes a Ticket directly to `RESOLVED` or `CLOSED`. `itPriority` is `LOW`, `MEDIUM`, `HIGH`, or `URGENT` and initially copies `requestedPriority`; only IT Staff or Administrator may change it. |
| BR-07 | Public Comments are visible to the owned Requester, IT Staff and Administrator; Internal Notes are visible to IT Staff and Administrator and postable only by IT Staff. Both are append-only with no edit/delete. Empty or whitespace-only content is rejected; valid content is trimmed to 1–2,000 characters (a bounded size for useful incident context without unbounded payloads), rendered as text (never raw HTML), and retains author/time. Internal Note content is never included in a Requester representation. |
| BR-08 | User name is trimmed and 2–120 characters; User creation requires a 12–128-character `initialPassword` and an explicit boolean `isActive` (omitted activation is `400 VALIDATION_ERROR`, never an implicit active account). The selected activation state is persisted and returned in the safe User shape. Account creation and editing prevent duplicate emails; self-deactivation and changing/deactivating the last active Administrator are blocked. A User with assigned Tickets must be reassigned before deactivation or changing to a non-owner role (`409 TICKET_OWNER_SAFETY_CONFLICT`); this prevents an inactive primary owner. Invalid role/activation/password input is rejected. No User deletion endpoint exists. |
| BR-09 | All Lab 2 validation, idempotency, Ticket Number allocation, reference-data checks, Attachment file checks, soft removal and safe error rules remain in effect, except that Lab 3's no-enumeration policy uses one generic `404` for a foreign own-scoped resource. An idempotency replay is valid only for the same authenticated User and normalized payload; cross-user reuse never returns the original Ticket. Authentication replaces every Lab 2 `requesterId` parameter/body field. |
| BR-10 | Failed login attempts are counted in an expiring server-side throttle keyed by a one-way email/IP bucket. After 5 failures in 15 minutes, login returns generic `429 AUTHENTICATION_RATE_LIMITED` for that bucket; successful login clears it. The response never reveals whether an account exists. |
| BR-11 | `POST /tickets/:id/problem-appears-resolved` is available only to the authenticated owner while the Ticket is `IN_PROGRESS` or `WAITING_FOR_REQUESTER`. It records the backend timestamp and owner as a one-time, duplicate-safe indication, leaves formal status unchanged, and repeated submission returns a safe conflict. IT Staff may later clear the indication when work resumes or formally transition the Ticket. |

### 5.1 Rule implementation notes

The numbered BR table is normative; the implementation and tests must enforce
these rules at the API boundary as well as in the UI.

### 5.2 Migration strategy: DevelopmentRequester to User

This migration is a prerequisite, not an implementation afterthought.
Field names below use the Prisma model names; the migration must keep explicit
`@map` names consistent with the existing PostgreSQL schema and must not rename
an existing value while changing a relation name.

1. Take a database backup and run the migration in maintenance mode, inside a
   transaction wherever PostgreSQL permits. If a preflight or postflight check
   fails, stop before dropping any compatibility object and restore the backup
   (or roll back the transaction) rather than attempting a partial repair.
   Before altering data, verify that every `tickets.requesterId`,
   `attachments.uploadedByRequesterId` and `attachments.removedByRequesterId`
   reference an existing
   `development_requesters.id`, that every existing requested priority is a
   valid non-null enum value, and that lower-casing/normalizing existing emails
   produces no duplicates.
2. Rename `development_requesters` to `users` rather than copying/re-keying it.
   This preserves every primary key, email identity, active state and the existing
   Ticket/Attachment foreign-key values. Rename the Prisma model to `User`,
   relation names, and the Attachment uploader/remover columns and constraints
   to their User names without changing their integer values; PostgreSQL keeps
   the foreign-key relationships.
3. Add `role UserRole NOT NULL DEFAULT REQUESTER`, a temporary nullable
   `passwordHash`, `mustChangePassword BOOLEAN NOT NULL DEFAULT true`,
   `lastLoginAt`, and User indexes. Existing rows become Requesters and retain
   their IDs. After the preflight duplicate check, trim/lower-case their stored
   emails so login normalization and the unique index use the same value. Add
   nullable `assignedToUserId`/`assignedAt`,
   `requesterResolutionIndicatedAt` and
   `requesterResolutionIndicatedByUserId` to Ticket. Expand the status enum
   without rewriting existing `NEW` values, and backfill every existing
   `itPriority` from its `requestedPriority` before making the final field
   non-null. Create the `sessions`, `public_comments` and `internal_notes`
   tables with User/Ticket foreign keys. Configure an expiring server-side
   failed-login throttle keyed by a one-way email/IP bucket alongside the
   migration. A null `passwordHash` can never authenticate.
4. In the same release, run an idempotent seed/provision step. It creates at
   least four active Requesters and one inactive Requester, at least three
   active IT Staff and one inactive IT Staff, and at least one active
   Administrator. It provisions every existing account using an Argon2id hash
   of `LAB3_SEED_INITIAL_PASSWORD` from the environment (or an equivalent
   secure production provisioning channel). The password is neither committed
   nor logged; every provisioned account requires a first-login change. Before
   declaring the migration complete, verify no `passwordHash` is null and
   apply `SET NOT NULL`; the final Prisma model is therefore non-null and no
   active account is stranded without credentials.
   Seeded account emails and the local-only procedure for setting
   `LAB3_SEED_INITIAL_PASSWORD` are documented in local development
   instructions; the password value itself is never committed, logged or
   rendered.
5. Replace the client selector/localStorage requester context with `/auth/me`.
   Remove `requesterId` from Lab 2 route contracts; retain Ticket IDs, numbers,
   attachments and URL shapes. Retire `GET /api/development-requesters` and
   its `/api/requesters` compatibility alias with safe `410 ENDPOINT_RETIRED`
   responses after client deployment.
6. Before release, run migration-regression tests on a Lab 2-shaped database:
   counts, IDs, Ticket Number, owner, uploader/remover, attachment state and
   list/detail access must be unchanged for the migrated Requester. Verify
   attachment storage keys/bytes are not rewritten and active/removed download
   behavior remains unchanged.

## 6. UI Specification Summary

The normative design contract is [ui-spec.md](ui-spec.md). Login and Change
Password are unauthenticated/limited entry screens. The authenticated shell
uses role-specific navigation: Requester (My Tickets, Create Ticket), IT Staff
(Ticket Queue), Administrator (User Management). Ticket Detail has a
read-only Ticket core plus a visibly distinct Public Comments region, a
Requester **Problem Appears Resolved** action, and an Internal Notes region
(read-only for Administrators and editable for IT Staff). Only IT Staff receive
formal resolve/close controls. Existing Requester screens remain Zen
Green and retain their loading, validation, empty/no-results and failure modes.

## 7. Data Changes

| Model | Required fields / constraints |
|---|---|
| `User` / `users` | Preserved Lab 2 requester `id`, `displayName`, `email UNIQUE`, `isActive`, timestamps; add `role UserRole`, `passwordHash String NOT NULL` (a temporary nullable staging column is allowed only during the two-phase migration), `mustChangePassword`, `lastLoginAt`; indexes `(role,isActive,displayName)` and `(role,isActive,email)`. |
| `Session` / `sessions` | `id` (hash of opaque cookie, PK), `userId FK`, `createdAt`, `lastSeenAt`, `expiresAt`, `revokedAt nullable`; index `(userId,revokedAt,expiresAt)`. Store only a hash of the cookie and revoke rows on logout, password events or deactivation. |
| `LoginThrottleBucket` / expiring server-side store | `keyHash` PK (HMAC of normalized email + coarse client address), `failedCount`, `firstFailedAt`, `blockedUntil`; TTL at 15 minutes. Never store or expose raw email/IP or counters in the API. |
| `Ticket` | Preserve all Lab 2 fields; `requesterId` FK now references `users`; backfill and retain `itPriority = requestedPriority` (final `Priority NOT NULL`); add `assignedToUserId nullable FK users`, `assignedAt`, `requesterResolutionIndicatedAt`, `requesterResolutionIndicatedByUserId nullable FK users`, and expanded `currentStatus`; indexes `(assignedToUserId,updatedAt)`, `(currentStatus,updatedAt)`, `(itPriority,updatedAt)`. |
| `PublicComment` | `id`, `ticketId FK`, `authorUserId FK`, `content`, `createdAt`; index `(ticketId,createdAt,id)`. |
| `InternalNote` | `id`, `ticketId FK`, `authorUserId FK`, `content`, `createdAt`; index `(ticketId,createdAt,id)`. |
| `Attachment` | Preserve row/metadata/storage key; uploader/remover FKs reference `users`, preserving their values. |

Relations are one-to-many from a Requester User to submitted Tickets, zero-or-one
primary Ticket Owner per Ticket (an active IT Staff or Administrator), and
one-to-many from a Ticket to Public Comments and Internal Notes. Every Comment
or Note has exactly one author User. The database enforces foreign keys and
uniqueness; service-level authorization enforces the active-role constraint on
Ticket Owner assignment.

Enums: `UserRole = REQUESTER | IT_STAFF | ADMINISTRATOR`; expand
`CurrentStatus` as BR-05. Timestamps are UTC ISO 8601. Seed at least four
active Requesters and one inactive Requester, at least three active IT Staff and
one inactive IT Staff, and at least one active Administrator. Include four
active Categories, six Related Systems, realistic Tickets distributed across
Requesters, statuses and priorities, both assigned and unassigned ownership;
at least one assigned Ticket uses an active IT Staff owner and one uses an
active Administrator owner. Include example Public Comments and Internal Notes
with no sensitive data. At least one Ticket is a Lab 2-migrated Requester
Ticket, one has a Public Comment and one has an Internal Note. The seed uses
deterministic natural keys (normalized emails and reference names plus reserved
fixture keys for Tickets, Comments and Notes) and upserts rather than appending
random rows, so running it twice creates no duplicates.

### 7.1 Seed decisions

- Seed credentials are supplied only through the local-development
  `LAB3_SEED_INITIAL_PASSWORD` environment variable. The value must be 12–128
  characters, is never committed or logged, and is hashed separately for each
  account with Argon2id. Every provisioned account starts with
  `mustChangePassword=true`; the seed verifies that no `passwordHash` is null
  before applying the final `NOT NULL` constraint.
- Existing Lab 2 requester rows are matched by normalized lowercase email and
  updated in place. Their primary keys and historical Ticket/Attachment
  references are preserved; no requester or operational record is copied or
  re-keyed.
- User, reference-data, Ticket, Public Comment, and Internal Note fixtures use
  deterministic natural keys. User and reference-data rows use `upsert`; seed
  Tickets use reserved idempotency keys, and comments/notes are checked by
  their ticket, author, and content before insertion.
- Ticket fixtures intentionally cover every `CurrentStatus` value, all
  priority values, assigned and unassigned ownership, and both active IT Staff
  and Administrator owners. Comment and Note examples contain operational
  text only and no passwords, tokens, personal secrets, or attachment storage
  data.
- The seed may reset local fixture credentials and must-change state for
  provisioned accounts, but never rewrites existing Ticket IDs, Ticket Numbers,
  attachment metadata, storage keys, or stored attachment bytes.

## 8. API Specification Summary

Every endpoint, request/response shape, query rule, error and cookie policy is
defined in [api-spec.md](api-spec.md). APIs use `/api`; identity is derived
from the session. Authentication failures are `401`, authorization failures
are `403`, missing resources are `404`, validation/query errors are `400`, and
conflicts are `409`, all with the safe error envelope. The matrix in §4.1 is
normative for all endpoints.

## 9. Acceptance Criteria

| ID | Observable criterion |
|---|---|
| AC-01 | Given valid active credentials, when a User logs in, then a safe session is established and the correct role shell opens; invalid/inactive credentials and a throttled bucket reveal no account detail. |
| AC-02 | Given an initial password, when login succeeds, then only Change Password and Logout are usable until a valid password change succeeds. |
| AC-03 | Given a Requester, when they use migrated Lab 2 Ticket/Attachment features, then only their historical and new records appear, no requester selector or client requester ID is used, and the owner may submit the **Problem Appears Resolved** indication without changing formal status. |
| AC-04 | Given an IT Staff User, when they query the queue, then search, simultaneous filters, sorting, pagination and assigned/unassigned state produce the documented result. |
| AC-05 | Given a Requester and an owned Ticket, when **Problem Appears Resolved** is confirmed, then an owner/timestamp indication is recorded while `RESOLVED`/`CLOSED` is not set. Given IT Staff and a Ticket, when a permitted claim/assignment/priority/status update is saved, then the Ticket reflects it; formal resolution/closure requires explicit confirmation and invalid assignee/transition is rejected without partial change. |
| AC-06 | Given a Requester, IT Staff and Administrator, when each views a Ticket, then Public Comments are shared and Internal Notes are visible to IT Staff/Administrator but never to Requester; direct forbidden calls reveal no note content. |
| AC-07 | Given an Administrator, when they create a User with exactly one role, a valid 12–128-character initial password and an explicitly selected `isActive` state, then the User is created with that activation state, only its Argon2id hash is stored, `mustChangePassword=true` is set, and the password is never returned. An active created User can authenticate only into the mandatory Change Password gate; an inactive created User is denied authentication without account-enumeration detail. Search/filter/edit/reset work, and duplicate email, invalid role, self-deactivation and last-admin removal are blocked. |
| AC-08 | Given a non-permitted role or unauthenticated caller, when it invokes or deep-links to any protected function, then the backend returns the documented safe `401`/`403`; a foreign own-scoped resource is the same safe `404` as missing and reveals no protected data. |
| AC-09 | Given a Lab 2 database, when the migration and seed run, then identities/ownership/history are preserved, credentials are hashed, required seed data is present and rerunning seed is safe. |
| AC-10 | Given desktop, tablet and mobile widths, when major screens render and fail/load/empty, then Zen Green styling, focus, accessible labels and no horizontal page overflow remain intact. |

## 10. Definition of Done

- [ ] The four Lab 3 Spec-DD files are internally consistent and linked.
- [ ] Migration is reviewed, applies from Lab 2 and passes preservation checks.
- [ ] Seed verifies the required Requester/IT Staff/Admin active and inactive
  account counts, realistic Ticket distribution, comments and notes, and is
  safe to run repeatedly.
- [ ] Auth/session, all matrix rules and safe errors are enforced server-side.
- [ ] Requester regression and resolution indication, staff queue/detail,
  comments/notes and User Management are implemented with required
  loading/validation/busy/failure UI.
- [ ] Unit, API/integration, UI, visual/style, responsive, authorization,
  migration/regression and E2E tests in [tests.md](tests.md) pass.
- [ ] No password, hash input, session ID, storage key, stack trace, SQL or
  secret is committed or rendered; README/evidence/reviewer/AI reflection are
  complete before merge.

## 11. Assumptions and Decisions

- Server-side opaque sessions are chosen over browser-readable JWTs to permit
  immediate revocation on logout, deactivation and password events.
- Argon2id is the single password-hash format for Lab 3; the encoded hash
  carries its parameters, and a future algorithm migration must verify the old
  hash before replacing it.
- Administrator is a separate minimal account-management role, not a fallback
  IT Staff role. Its read-only Ticket inspection access includes Notes, and its only
  Ticket mutation is IT Priority; it has no assignment, status or posting
  capability.
- A Requester's **Problem Appears Resolved** action records an owner/timestamp
  indication and leaves formal status unchanged. Only IT Staff may perform the
  explicitly confirmed `RESOLVED` and `CLOSED` transitions.
- A staff queue uses `GET /api/staff/tickets`; Requester routes keep
  `/api/tickets` to make ownership intent unambiguous.
- Existing Lab 2 requester IDs become User IDs through table rename. This is
  safer than a data copy/map and is the required continuity decision.
- CSRF is addressed with `SameSite=Lax` plus origin checking on unsafe cookie
  requests; deployments needing cross-site cookies must add a CSRF token before
  changing that cookie policy.
