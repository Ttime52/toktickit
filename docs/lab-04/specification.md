# TokTickIT Lab 4 Sprint Engineering Specification

**Product:** TokTickIT service desk  
**Version:** 1.0 — Spec-DD contract  
**Status:** Approval baseline before Issue 2 implementation  
**Scope:** Actions Taken, Ticket workflow completion, role dashboards, final regression and hardening

`MUST` is an observable requirement. This contract extends Labs 1–3; it does
not replace the existing authentication, ownership, Ticket, Attachment,
Public Comment, Internal Note, or Administrator User Management contracts.
The detailed HTTP contract is in [api-spec.md](api-spec.md), the visual
contract is in [ui-spec.md](ui-spec.md), and the test trace is in
[tests.md](tests.md). The four documents are the approval gate for Issue 2;
implementation work must not start until this document is reviewed and
approved.

## 1. Sprint Goal

Complete the core TokTickIT service-desk workflow. IT Staff and Administrators
can record auditable Actions Taken under a Ticket, Requesters can see the work
history for their own Tickets, Ticket status transitions are enforced by the
backend through closure or cancellation, and each role receives a concise
dashboard backed by authoritative PostgreSQL data. All Labs 1–3 behavior,
including authentication, authorization, ownership, comments, notes,
attachments, and user management, remains usable.

## 2. Stakeholder Request

The service desk can receive Tickets and communicate with Requesters, but it
needs a reliable work record. Each Ticket therefore has multiple Actions Taken
with a timestamp, description, result, responsible user, follow-up decision,
follow-up note, and attachment guidance. A primary Ticket Owner coordinates the
Ticket, while another authorized IT Staff member may perform an Action Taken. The
Requester needs a safe view of progress and a small dashboard; IT Staff need
workload, urgency, status, and recent-work visibility. Administrators need the
same Action Taken support and a read-only operational overview without
weakening the existing role boundaries.

## 3. Scope

### Included

- An `ActionTaken` parent-child model: one Ticket has zero or more Actions
  Taken, listed chronologically and editable by permitted operational roles.
- Create, list, and update Actions Taken with server-derived `performedBy` and
  conditional follow-up validation.
- A complete Ticket status transition matrix for `NEW`, `OPEN`,
  `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`,
  and `CANCELLED`.
- Backend resolution and closure gates, including explicit confirmation,
  required transition evidence, and atomic validation when a client bypasses
  the normal screen.
- Requester, IT Staff, and Administrator dashboard contracts with exact
  metric formulas, fixed reporting boundaries, empty behavior, and drill-down
  destinations.
- An additive PostgreSQL/Prisma migration, deterministic seed data, indexes,
  version fields, and migration-regression coverage.
- Zen Green dashboard cards and Actions Taken list/form extensions at desktop,
  tablet, and mobile widths.
- Optimistic concurrency for mutable Ticket and Action Taken resources;
  duplicate-safe Action Taken creation; safe failures with no partial writes.
- Unit, API/integration, UI, UI-style, responsive, authorization, workflow,
  migration-regression, performance-smoke, and E2E tests.

### Explicitly excluded

- Automatic SLA clocks, escalation engines, breach notifications, or
  on-call scheduling.
- Email, SMS, LINE, push, or any external notification service.
- Inventory, purchasing, spare-parts, cost accounting, timesheets, payroll, or
  labor-cost calculations.
- Multi-level approval, electronic signatures, advanced report builders,
  exports, data warehouses, or multi-tenant production operations.
- Physical files attached directly to an Action Taken. `attachmentNotes`
  describes existing Ticket Attachments; the existing Attachment API remains
  the only file-storage workflow.
- Action Taken deletion or an audit-history viewer. Updates preserve the
  original `performedBy`; the current row is the operational record.
- A Requester changing formal Ticket status. **Problem Appears Resolved**
  remains an advisory, owner-only indication.

## 4. Functional Requirements

### 4.1 Actions Taken requirements and field contract

Terminology and naming are canonical across this specification, API, UI, and
test plan: one persisted record is an **Action Taken**; a collection or feature
is **Actions Taken**; `ActionTaken` is the code/model identifier; and the API
resource path is `/actions`. The canonical UI labels and JSON/database names
are the mappings in the field table below. Prose must not use bare “Action” as
an alternative domain name when it means an Action Taken.

| ID | Requirement |
|---|---|
| FR-01 | The API MUST allow an authenticated IT Staff user or Administrator to create an Action Taken under an accessible Ticket. The Ticket relationship and actor identity MUST come from the server, never from a client-supplied `ticketId`/`performedBy` object alone. |
| FR-02 | The API MUST list all Actions Taken for an authorized Ticket in stable chronological order (`actionAt ASC`, `id ASC`) and return zero items with `200`, not `404`, when none exist. |
| FR-03 | The API MUST allow IT Staff and Administrators to update the editable fields (`actionAt`, `actionDescription`, `result`, `followUpRequired`, `followUpNote`, and `attachmentNotes`) of an existing Action Taken. `ticketId`, `performedBy`, `createdAt`, and seed identity are immutable. There is no delete operation. |
| FR-04 | Requesters MUST be able to view Actions Taken only for their own Tickets. Requesters MUST never receive a create/update control or a write authorization. |
| FR-05 | `performedBy` MUST be populated from the authenticated session at create time and MUST be returned as a safe user summary. Any client-supplied `performedBy`, `performedByUserId`, or equivalent override MUST be rejected. |
| FR-06 | The create/edit form MUST expose every required business field: Action Date/Time, Action Description, Result, Performed by (auto), Follow-Up Required?, Follow-up Note, and Attachment Notes. Follow-up Note is required when Follow-Up Required? is `true`. |
| FR-07 | Action Taken validation MUST run on the backend before persistence. A failed validation, stale update, or database error MUST leave both the Action Taken and its parent Ticket unchanged. |

#### Action Taken fields

| UI label | API / database field | Required | Contract |
|---|---|---:|---|
| Action Date/Time | `actionAt` / `action_at` | Yes | Client-editable by IT Staff/Administrator on create and edit; Requester is read-only. The value is an ISO 8601 timestamp with an explicit UTC offset or `Z`. The client may prefill the current time, but must serialize the product-timezone selection to UTC; the server rejects timezone-less/malformed values or a future time beyond five minutes of server time. |
| Action Description | `actionDescription` / `action_description` | Yes | Trimmed plain text, 1–2,000 Unicode characters. HTML is rendered as text, never executed. |
| Result | `result` | Yes | Trimmed plain text, 1–2,000 Unicode characters. It describes the outcome of this Action Taken, not a planned next Action Taken. |
| Performed by | `performedBy` / `performed_by_user_id` | Auto | Server sets the foreign key to `req.auth.user.id` on create. The response includes `id`, `displayName`, and `role`; the request has no writable field for it. On edit it remains the original performer. |
| Follow-Up Required? | `followUpRequired` / `follow_up_required` | Yes | Explicit boolean; omission is a validation error. |
| Follow-up Note | `followUpNote` / `follow_up_note` | Conditional | Required and trimmed to 1–1,000 characters when `followUpRequired=true`. It MUST be `null`/empty when false; this prevents an ambiguous record. |
| Attachment Notes | `attachmentNotes` / `attachment_notes` | No | Optional trimmed plain text, 0–1,000 characters. It says what existing file, screenshot, log, or image to inspect; it is not a storage key and does not upload a file. |

#### Client-editable Action Date/Time design decision

`actionAt` is an editable business field, not an immutable audit timestamp.
IT Staff and Administrators may correct it on create or edit; Requesters can
only view it. The UI displays and edits the value in `Asia/Bangkok`, converts it
to an explicit UTC timestamp before submission, and never silently replaces an
edited value with “now”. An edit changes `updatedAt`, `updatedBy`, and the
Action Taken `version`, but does not change `createdAt` or `performedBy`.
Changing `actionAt` may reposition the Action Taken in chronological lists.

The response also contains `id`, `ticketId`, `createdAt`, `updatedAt`, an
integer `version`, and a read-only strong-concurrency `etag`. `updatedBy` may
be returned as a safe summary for UI feedback, but it is not the value shown
as **Performed by**.

### 4.2 Action Taken workflow and ownership

- A Ticket can have zero, one, or many Actions Taken. Each Action Taken belongs
  to one Ticket and cannot be moved to another Ticket.
- The primary Ticket Owner (`assignedToUserId`) coordinates the Ticket. The
  performer may be the Owner or another active IT Staff user. An Administrator
  may create/update Actions Taken as an operational support capability, but
  this does not make the Administrator the Ticket Owner.
- The create operation is idempotent with a caller-supplied
  `Idempotency-Key`; a network retry cannot create duplicate Action Taken rows.
- Actions Taken are displayed to Requesters as shared work history. Internal Notes
  remain private and are not merged into this collection.
- Successful create/update responses include the latest Action Taken and the
  parent Ticket version so the client can refresh stale detail state.

### 4.3 Action Taken authorization matrix

Authorization is enforced on the backend for direct API calls, deep links, and
crafted requests. Hiding a button is not authorization. `own` means
`ticket.requesterId === session.userId`; `all` means every Ticket the role is
allowed to inspect.

| Action Taken operation | Requester | IT Staff | Administrator |
|---|---|---|---|
| `GET /api/tickets/:ticketId/actions` | View only, `own` | View, `all` | View, `all` |
| `POST /api/tickets/:ticketId/actions` | Forbidden (`403`) | Create, `all` | Create, `all` |
| `PATCH /api/tickets/:ticketId/actions/:actionId` | Forbidden (`403`) | Update, `all` | Update, `all` |
| `DELETE /api/tickets/:ticketId/actions/:actionId` | Not supported (`405`) | Not supported (`405`) | Not supported (`405`) |

An existing Ticket/role ownership check is performed before returning Actions
Taken data. A foreign own-scoped Ticket uses the established safe `404`
behavior; an operation forbidden by role is `403` with no protected Actions
Taken content.

### 4.4 Ticket Owner and assignment rules

- There is exactly one primary Ticket Owner or `null`; the existing
  `assignedToUserId` field remains the source of truth.
- Only IT Staff may claim, assign, or reassign. The target must be active and
  have role `IT_STAFF` or `ADMINISTRATOR`.
- Claim is valid only when the Ticket is unassigned and assigns the caller.
  Assign is valid only when unassigned; reassign is valid only when assigned.
- An Action Taken does not change the primary Owner. Its `performedBy` is the
  authenticated actor, so multiple staff members can contribute work while
  the Owner remains accountable.
- Administrator may inspect permitted Ticket data and use Action Taken and
  IT-Priority operations already approved for Lab 3, but cannot claim, assign,
  reassign, or change formal status. This preserves the Lab 3 safety boundary.

### 4.5 Ticket status and resolution transition matrix

API values are uppercase; the UI labels are title case. The following is the
complete allowed-transition matrix. Every listed transition is performed only
by an active `IT_STAFF` user. Requesters and Administrators have no status
transition in this sprint; all other role/edge combinations return `403
FORBIDDEN` or `409 INVALID_STATUS_TRANSITION` as appropriate.

| From | To | Requester | IT Staff | Administrator | Required server gate |
|---|---|---:|---:|---:|---|
| `NEW` | `OPEN` | — | Yes | — | Valid transition; atomic version check |
| `NEW` | `CANCELLED` | — | Yes | — | `cancelReason` required, 3–1,000 chars |
| `OPEN` | `IN_PROGRESS` | — | Yes | — | Valid transition; atomic version check |
| `OPEN` | `WAITING_FOR_REQUESTER` | — | Yes | — | Valid transition; an Action Taken/communication is recommended |
| `OPEN` | `CANCELLED` | — | Yes | — | `cancelReason` required, 3–1,000 chars |
| `IN_PROGRESS` | `WAITING_FOR_REQUESTER` | — | Yes | — | Valid transition |
| `IN_PROGRESS` | `RESOLVED` | — | Yes | — | Resolution gate below |
| `IN_PROGRESS` | `CANCELLED` | — | Yes | — | `cancelReason` required |
| `WAITING_FOR_REQUESTER` | `IN_PROGRESS` | — | Yes | — | Valid transition; clears requester indication |
| `WAITING_FOR_REQUESTER` | `RESOLVED` | — | Yes | — | Resolution gate below |
| `WAITING_FOR_REQUESTER` | `CANCELLED` | — | Yes | — | `cancelReason` required |
| `RESOLVED` | `CLOSED` | — | Yes | — | Closure gate below |
| `RESOLVED` | `REOPENED` | — | Yes | — | `reopenReason` required, 3–1,000 chars |
| `CLOSED` | `REOPENED` | — | Yes | — | `reopenReason` required, 3–1,000 chars |
| `REOPENED` | `IN_PROGRESS` | — | Yes | — | Valid transition; clears requester indication |
| `REOPENED` | `WAITING_FOR_REQUESTER` | — | Yes | — | Valid transition |
| `REOPENED` | `CANCELLED` | — | Yes | — | `cancelReason` required |
| `CANCELLED` | `REOPENED` | — | Yes | — | `reopenReason` required, 3–1,000 chars |

Same-status writes are not transitions and return `409 NO_OPERATION`. Any
transition not listed above returns `409 INVALID_STATUS_TRANSITION` without a
partial owner, priority, status, or Action Taken mutation.

#### Resolution and closure gate

The backend MUST enforce these gates in the transaction that changes status;
the UI confirmation checkbox is only guidance:

1. A transition to `RESOLVED` requires an IT Staff actor,
   `confirmStatusChange=true`, and a trimmed `resolutionSummary` of 10–2,000
   characters. The current transition must be allowed by the matrix.
2. A transition to `CLOSED` requires the current status to be `RESOLVED`, an IT
   Staff actor, `confirmStatusChange=true`, and a trimmed `closureSummary` of
   10–2,000 characters. `CLOSED` cannot be reached directly from any other
   status.
3. The API rejects a missing/false confirmation or missing evidence with
   `400 STATUS_CONFIRMATION_REQUIRED`; a crafted client request cannot bypass
   the gate.
4. `Problem Appears Resolved` is an owner-only advisory indication. It records
   an actor and timestamp, does not change status, and never satisfies the
   formal resolution/closure confirmation by itself.
5. Reopening or returning to `IN_PROGRESS` clears the requester indication in
   the same transaction. A status update increments `Ticket.version`.

### 4.6 Dashboard metric contract

Dashboard responses are aggregates and short previews, not unbounded Ticket
collections. All persisted timestamps are UTC. Reporting uses the fixed
product timezone `Asia/Bangkok` (ICT, UTC+07:00), not the browser timezone, so
two users see the same daily result.

Capture `asOf` first. Let `D` be the `Asia/Bangkok` local calendar date of
that timestamp. The default `7d` window is the half-open interval
`[startOfDay(D - 6 days), startOfDay(D + 1 day))` in `Asia/Bangkok`, converted
to UTC for PostgreSQL comparisons. All counts are
computed in one read-only `REPEATABLE READ` transaction at that snapshot.
`ACTIVE` means status in
`NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, or `REOPENED`.

#### Requester dashboard (`GET /api/dashboard/requester`)

The owner predicate `t.requester_id = :authenticatedUserId` is applied to
every metric and preview query; no `userId` query parameter is accepted.

| Metric | Authoritative query / formula | Empty state | Drill-down |
|---|---|---|---|
| `openTicketCount` | `COUNT(*) WHERE requester_id=:me AND current_status IN ACTIVE` | `0`; card says “No open Tickets” | `/my-tickets?scope=active` |
| `waitingForRequesterCount` | `COUNT(*) WHERE requester_id=:me AND current_status='WAITING_FOR_REQUESTER'` | `0`; card says “Nothing waiting for your reply” | `/my-tickets?currentStatus=WAITING_FOR_REQUESTER` |
| `recentlyUpdatedTicketCount` | `COUNT(*) WHERE requester_id=:me AND updated_at >= :windowStart AND updated_at < :windowEnd` | `0`; show an empty recent-work message | `/my-tickets?updatedWithin=7d` |
| `recentlyResolvedTicketCount` | `COUNT(*) WHERE requester_id=:me AND current_status IN ('RESOLVED','CLOSED') AND resolved_at >= :windowStart AND resolved_at < :windowEnd` | `0`; show “No Tickets resolved in this period” | `/my-tickets?resolvedWithin=7d` |
| `resolutionIndicationCount` | `COUNT(*) WHERE requester_id=:me AND requester_resolution_indicated_at IS NOT NULL AND current_status IN ACTIVE` | `0`; no alert card | `/my-tickets?resolutionIndicated=true` |
| `recentTickets` | `SELECT safe Ticket summaries WHERE requester_id=:me AND updated_at >= :windowStart AND updated_at < :windowEnd ORDER BY updated_at DESC,id DESC LIMIT 5` | `[]`; never a `404` | Each item links to `/tickets/:ticketId` |

`recentlyResolvedTicketCount` uses `resolved_at`, which is set on a formal
`RESOLVED` transition and retained as historical evidence when a Ticket is
later reopened. The metric additionally requires current status `RESOLVED` or
`CLOSED`, so a reopened Ticket is not presented as currently resolved. It does
not count a Requester indication as a resolution.

#### IT Staff dashboard (`GET /api/dashboard/staff`)

The staff dashboard is available to IT Staff. Administrators may use the
separate Administrator endpoint below for the same read-only aggregate view.
All Ticket metrics are tenant-wide for the authenticated support role.

| Metric | Authoritative query / formula | Empty state | Drill-down |
|---|---|---|---|
| `unassignedActiveCount` | `COUNT(*) WHERE assigned_to_user_id IS NULL AND current_status IN ACTIVE` | `0`; show “Queue is fully assigned” | `/staff/tickets?assignment=unassigned&scope=active` |
| `myAssignedActiveCount` | `COUNT(*) WHERE assigned_to_user_id=:me AND current_status IN ACTIVE` | `0`; show “No active Tickets assigned to you” | `/staff/tickets?assignment=mine&scope=active` |
| `urgentActiveCount` | `COUNT(*) WHERE it_priority='URGENT' AND current_status IN ACTIVE` | `0`; show “No urgent active Tickets” | `/staff/tickets?itPriority=URGENT&scope=active` |
| `recentlyUpdatedCount` | `COUNT(*) WHERE updated_at >= :windowStart AND updated_at < :windowEnd` | `0`; show empty recent-work message | `/staff/tickets?updatedWithin=7d` |
| `ticketsByStatus` | For every status enum, `COUNT(*) WHERE current_status=:status`; missing groups are returned as `0` | Eight zero-valued buckets are returned; chart/list says “No Tickets” only when total is zero | `/staff/tickets?currentStatus=<status>` |
| `ticketsByItPriority` | For `LOW`, `MEDIUM`, `HIGH`, `URGENT`, `COUNT(*) WHERE current_status IN ACTIVE AND it_priority=:priority` | Four zero-valued buckets are returned | `/staff/tickets?itPriority=<priority>&scope=active` |
| `recentTickets` | `SELECT safe summaries WHERE updated_at >= :windowStart AND updated_at < :windowEnd ORDER BY updated_at DESC,id DESC LIMIT 5` | `[]`; show “No recent updates” | Each item links to `/staff/tickets/:ticketId` |
| `urgentTickets` | `SELECT safe summaries WHERE it_priority='URGENT' AND current_status IN ACTIVE ORDER BY updated_at DESC,id DESC LIMIT 5` | `[]`; show “No urgent work” | `/staff/tickets?itPriority=URGENT&scope=active` |

#### Administrator dashboard (`GET /api/dashboard/administrator`)

The Administrator view reuses the tenant-wide staff aggregates as read-only
data, plus two account counts. It never grants queue mutation or status
mutation permission.

| Metric | Authoritative query / formula | Empty state | Drill-down |
|---|---|---|---|
| `unassignedActiveCount` | `COUNT(*) WHERE assigned_to_user_id IS NULL AND current_status IN ACTIVE` | `0`; show “Queue is fully assigned” | `/admin/tickets?assignment=unassigned&scope=active` |
| `myAssignedActiveCount` | `COUNT(*) WHERE assigned_to_user_id=:me AND current_status IN ACTIVE` | `0`; show “No active Tickets assigned to you” | `/admin/tickets?assignment=mine&scope=active` |
| `urgentActiveCount` | `COUNT(*) WHERE it_priority='URGENT' AND current_status IN ACTIVE` | `0`; show “No urgent active Tickets” | `/admin/tickets?itPriority=URGENT&scope=active` |
| `recentlyUpdatedCount` | `COUNT(*) WHERE updated_at >= :windowStart AND updated_at < :windowEnd` | `0`; show empty recent-work message | `/admin/tickets?updatedWithin=7d` |
| `ticketsByStatus` | For every status enum, `COUNT(*) WHERE current_status=:status`; missing groups are returned as `0` | Eight zero-valued buckets are returned | `/admin/tickets?currentStatus=<status>` |
| `ticketsByItPriority` | For `LOW`, `MEDIUM`, `HIGH`, `URGENT`, `COUNT(*) WHERE current_status IN ACTIVE AND it_priority=:priority` | Four zero-valued buckets are returned | `/admin/tickets?itPriority=<priority>&scope=active` |
| `recentTickets` | `SELECT safe summaries WHERE updated_at >= :windowStart AND updated_at < :windowEnd ORDER BY updated_at DESC,id DESC LIMIT 5` | `[]`; show “No recent updates” | Each item links to `/tickets/:ticketId` |
| `urgentTickets` | `SELECT safe summaries WHERE it_priority='URGENT' AND current_status IN ACTIVE ORDER BY updated_at DESC,id DESC LIMIT 5` | `[]`; show “No urgent work” | `/admin/tickets?itPriority=URGENT&scope=active` |
| `activeUserCount` | `COUNT(*) FROM users WHERE is_active=true` | `0` is valid seed/test state | `/admin/users?isActive=true` |
| `inactiveUserCount` | `COUNT(*) FROM users WHERE is_active=false` | `0` is valid | `/admin/users?isActive=false` |

Dashboard failures return the standard safe `500/503` error envelope; a query
with no matching records is always `200` with zero-valued metrics and empty
arrays. A dashboard card is not allowed to render a stale client-calculated
count in place of the API value.

## 5. Business Rules

| ID | Business rule |
|---|---|
| BR-01 | Every Action Taken belongs to exactly one Ticket, and every Ticket may have zero or more Actions Taken. A foreign or missing parent cannot create an orphan Action Taken. |
| BR-02 | `performedBy` is the authenticated active User at creation. Client-provided identity, role, Ticket Owner, or `userId` values never establish authorization. |
| BR-03 | Only active IT Staff and Administrators can create/update Actions Taken; Requesters can view only their own Ticket history. The server enforces this on every request. |
| BR-04 | Action Description and Result are trimmed plain text, 1–2,000 characters; Follow-up Note is 1–1,000 characters when required; Attachment Notes are optional and max 1,000 characters. Unknown fields are rejected. |
| BR-05 | `followUpRequired` is an explicit boolean. `true` requires a non-empty Follow-up Note; `false` requires no meaningful note. |
| BR-06 | An Action Date/Time is normalized to UTC, must be a valid timestamp, and cannot be more than five minutes in the future relative to the server clock. |
| BR-07 | Actions Taken are appendable and editable but not deletable. Edit accepts only `actionAt`, `actionDescription`, `result`, `followUpRequired`, `followUpNote`, and `attachmentNotes`; it preserves `performedBy`, `ticketId`, `createdAt`, and `seedKey`, and updates `updatedAt`, `updatedBy`, and `version`. |
| BR-08 | A primary Ticket Owner is separate from the Action Taken performer. Assignment is single-valued; multiple IT Staff can perform Actions Taken. |
| BR-09 | The complete status matrix in §4.5 is the only allowed transition contract. Requester indications never change formal status. |
| BR-10 | `RESOLVED` requires IT Staff, a valid transition, `confirmStatusChange=true`, and a non-empty `resolutionSummary`; `CLOSED` requires current `RESOLVED`, IT Staff, confirmation, and `closureSummary`. The backend rechecks all gates. |
| BR-11 | Cancellation requires a trimmed `cancelReason` of 3–1,000 characters; reopening requires a trimmed `reopenReason` of 3–1,000 characters. Invalid transitions and missing evidence are atomic failures. |
| BR-12 | Every mutable Ticket response carries an integer `version` and strong ETag. Ticket workflow/owner mutations require a matching `If-Match`; a stale version returns `412 STALE_WRITE` and does not overwrite newer work. |
| BR-13 | Action Taken create uses `Idempotency-Key`; the same authenticated actor, key, and normalized payload replay safely before a stale-parent check, while a changed payload or cross-user reuse returns `409 IDEMPOTENCY_KEY_REUSED`. Only first use requires the current Ticket ETag. |
| BR-14 | Action Taken update requires the Action Taken ETag and the latest parent Ticket version. Malformed preconditions return `400 VALIDATION_ERROR`; missing concurrency preconditions return `428 PRECONDITION_REQUIRED`; a stale Action Taken or parent version returns `412 STALE_WRITE` without a partial write. |
| BR-15 | Dashboard metrics are computed by the backend from committed PostgreSQL data in one read snapshot. Client query parameters cannot widen Requester ownership. |
| BR-16 | Dashboard timestamps use the fixed `Asia/Bangkok` calendar boundary and are compared in UTC half-open intervals. `asOf`, `window.start`, and `window.end` are returned for evidence. |
| BR-17 | Dashboard count buckets are total and explicit: zero-valued statuses/priorities are returned rather than omitted. Empty lists use `[]` and `200`. |
| BR-18 | Existing Lab 2/3 APIs retain their documented validation, ownership, safe-error, authentication, Attachment, comment, note, and User Management behavior. New fields are additive and safe serializers never expose password hashes, sessions, storage keys, or private notes to Requesters. |
| BR-19 | Migration does not synthesize historical Actions Taken. Legacy Tickets remain valid with zero Actions Taken; they participate in Ticket/dashboard metrics according to their existing status, owner, priority, and timestamps, with `updatedAt` used as the documented backfill for an already-resolved/closed/cancelled status. |
| BR-20 | Seed execution is idempotent. It creates realistic Tickets in every major status, with assigned/unassigned ownership and zero/one/multiple Actions Taken, without duplicating records on a second run. |

## 6. UI Specification Summary

The UI contract in [ui-spec.md](ui-spec.md) extends the existing Zen Green
shell. It defines exact tokens, spacing, breakpoints, keyboard behavior,
dashboard cards, Actions Taken list/form modes, role boundaries, and failure
states.

| Screen | Required structure and role behavior |
|---|---|
| Requester Dashboard | Authenticated owner-only metric cards for open, waiting, recent, resolved, and indication counts; a recent Ticket list; each actionable card/link drills into an owned filter or Ticket Detail. |
| IT Staff Dashboard | Metric cards for unassigned, mine, urgent, recent, status buckets, and IT Priority buckets; recent/urgent Ticket preview; links to Queue or Detail. |
| Administrator Dashboard | Read-only staff aggregates plus active/inactive User counts; no status/assignment controls. |
| IT Staff Ticket Detail | Existing read-only Ticket core and Work controls plus Actions Taken list, Add Action Taken form, Edit Action Taken form, status/resolution controls, comments, notes, and attachments. |
| Administrator Ticket inspection | Actions Taken create/edit is visible and permitted; formal status/assignment controls remain absent and server-forbidden. |
| Requester Ticket Detail | Actions Taken list is visible for an owned Ticket; all fields are read-only; no Action Taken form; existing Public Comments, Attachments, and Problem Appears Resolved behavior remain. |

Every screen has loading, empty/no-results, validation, busy, success,
forbidden/not-found, stale-conflict, and safe API-failure states as applicable.
Desktop uses cards/table layouts, tablet collapses secondary columns, and mobile
uses stacked cards and full-width controls without page-level horizontal
scrolling. Status and permission information is conveyed by text and semantic
labels, not color alone.

## 7. Data Changes

### 7.1 Prisma/PostgreSQL model increment

The migration is additive and preserves existing primary keys and foreign-key
values.

| Model/table | New or required fields and constraints |
|---|---|
| `Ticket` / `tickets` | Add `version INT NOT NULL DEFAULT 1`, `resolvedAt TIMESTAMPTZ NULL`, `closedAt TIMESTAMPTZ NULL`, `cancelledAt TIMESTAMPTZ NULL`, `resolutionSummary TEXT NULL`, `closureSummary TEXT NULL`, `cancelReason TEXT NULL`, and `reopenReason TEXT NULL`. Keep existing requester/owner/status/priority fields and all Lab 2/3 indexes. |
| `ActionTaken` / `actions_taken` | `id BIGSERIAL PK`; `ticketId INT NOT NULL FK tickets(id) ON DELETE RESTRICT`; `actionAt TIMESTAMPTZ NOT NULL`; `actionDescription TEXT NOT NULL`; `result TEXT NOT NULL`; `performedByUserId INT NOT NULL FK users(id) ON DELETE RESTRICT`; `followUpRequired BOOLEAN NOT NULL`; `followUpNote TEXT NULL`; `attachmentNotes TEXT NULL`; `createdAt`, `updatedAt` TIMESTAMPTZ NOT NULL; `updatedByUserId INT NULL FK users(id) ON DELETE SET NULL`; `version INT NOT NULL DEFAULT 1`; `seedKey VARCHAR(120) NULL UNIQUE` for idempotent local seed only. |
| `ActionTaken` indexes | `(ticketId, actionAt, id)` for chronological list; `(ticketId, followUpRequired)` for operational checks; `(performedByUserId, actionAt)` for staff history; unique nullable `seedKey`. |
| `Ticket` indexes | Add `(currentStatus, updatedAt)`, `(assignedToUserId, currentStatus)`, `(itPriority, currentStatus)`, `(requesterId, updatedAt)`, and `(resolvedAt)` if missing. Existing useful indexes are retained rather than duplicated. |
| Dashboard query layer | No materialized dashboard table. Dashboard services use parameterized aggregate queries in a read transaction; this avoids a second source of truth and stale counters. |

### 7.2 Migration, backfill, rollback, and recovery

1. Before migration, take a PostgreSQL backup and run a preflight that checks
   foreign-key integrity, valid existing enum values, duplicate normalized
   emails, and the absence of an incompatible `version` column.
2. Add new Ticket columns with safe nullable/default values. Backfill
   `version=1`. For legacy Tickets already in `RESOLVED` or `CLOSED`, set
   `resolvedAt=updatedAt`; for legacy `CLOSED` set `closedAt=updatedAt`, and
   for legacy `CANCELLED` set `cancelledAt=updatedAt`. These are explicitly
   documented migration-boundary timestamps, not fabricated Action Taken
   records. Do not invent Action Taken history.
3. Create `actions_taken` with foreign keys, constraints, and indexes. The
   table starts empty for legacy data. Existing Users, Tickets, Attachments,
   Public Comments, Internal Notes, Sessions, and User Management records are
   untouched.
4. Deploy the seed/provision step inside the release transaction where
   possible. Seed upserts use stable `seedKey` values and stable Ticket
   Numbers; a second run updates only the controlled fixture fields and never
   duplicates an Action Taken.
5. Run postflight counts and snapshots: all pre-existing Ticket/Attachment
   IDs, owners, statuses, priorities, comment/note counts, and attachment
   storage keys must match. Verify legacy Tickets appear with zero Actions Taken and
   valid dashboard counts.
6. If preflight, migration, or postflight fails, stop and restore the backup or
   roll back the transaction. The migration is forward-only in production;
   recovery is backup restore plus redeploy of the previous application, not a
   destructive ad-hoc `DROP TABLE`. A tested disposable-database down/recovery
   rehearsal is required before merge.

### 7.3 Seed fixture requirements

The idempotent local seed MUST include:

- Tickets in `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`,
  `RESOLVED`, `CLOSED`, `REOPENED`, and `CANCELLED`;
- assigned and unassigned Tickets, every IT Priority, and at least one
  Requester-owned Ticket for dashboard ownership tests;
- at least one Ticket with zero Actions Taken, one with exactly one, and one
  with at least two Actions Taken by different active IT Staff users;
- at least one follow-up-required Action Taken and one no-follow-up Action Taken;
- data that produces both non-zero and zero dashboard metrics in isolated test
  fixtures; and
- no plaintext password, secret, session cookie, storage key, or real personal
  data committed to the repository. Seed credentials come from the existing
  environment-only Lab 3 mechanism.

## 8. API Contract

All paths are under `/api`, JSON uses camelCase and UTC ISO 8601 timestamps,
and protected routes use the existing opaque HttpOnly server session. The new
contract is summarized below; exact request/response examples, validation,
status codes, safe errors, retained Lab 2/3 routes, concurrency headers, and
dashboard payloads are normative in [api-spec.md](api-spec.md).

| Capability | Endpoint(s) | Success | Main roles |
|---|---|---:|---|
| Actions Taken list | `GET /tickets/:ticketId/actions` | `200` | Requester owner, IT Staff, Administrator |
| Create Action Taken | `POST /tickets/:ticketId/actions` | `201`, replay `200` | IT Staff, Administrator |
| Update Action Taken | `PATCH /tickets/:ticketId/actions/:actionId` | `200` | IT Staff, Administrator |
| Requester dashboard | `GET /dashboard/requester` | `200` | Requester |
| IT Staff dashboard | `GET /dashboard/staff` | `200` | IT Staff |
| Administrator dashboard | `GET /dashboard/administrator` | `200` | Administrator |
| Administrator Ticket drill-down | `GET /admin/tickets` | `200` | Administrator (read-only) |
| Ticket workflow | Existing `PATCH /staff/tickets/:ticketId` and `/owner` | `200` | IT Staff; Administrator priority-only |
| Retained APIs | Auth, references, Tickets, Attachments, comments, notes, users, health | Existing contracts | As documented in Lab 3 |

Mutable Ticket operations require a matching `If-Match` ETag. Action Taken creation
uses an idempotency key and current Ticket ETag; Action Taken updates use the Action Taken ETag
plus the latest parent Ticket version. Malformed concurrency preconditions return
`400 VALIDATION_ERROR`; missing concurrency preconditions return
`428 PRECONDITION_REQUIRED`; stale Ticket or Action Taken preconditions return
`412 STALE_WRITE`; no mutation is silently merged. This is the selected
optimistic-concurrency decision for Lab 4.

## 9. Acceptance Criteria

Every criterion maps to at least one planned test in [tests.md](tests.md).

| ID | Observable acceptance criterion | Test trace |
|---|---|---|
| AC-01 | Given an authorized IT Staff user and valid fields, creating an Action Taken saves it under the correct Ticket with the authenticated user as `performedBy`. | API-02, WORK-01, E2E-02 |
| AC-02 | Every Action Taken response contains Action Date/Time, Action Description, Result, auto Performed by, Follow-Up Required?, conditional Follow-up Note, and Attachment Notes with the documented validation boundaries. | UNIT-01, API-03, UI-02 |
| AC-03 | Requester can view Actions Taken only for an owned Ticket; Requester write attempts and foreign access are rejected without protected data. | AUTH-01, API-01, E2E-02 |
| AC-04 | IT Staff and Administrator can create/update Actions Taken; a Requester cannot bypass hidden controls through direct API calls. | AUTH-01, AUTH-02, API-02, API-03 |
| AC-05 | The complete status matrix accepts every listed transition and rejects every unlisted transition with no partial write. | UNIT-02, WORK-03, API-08 |
| AC-06 | A crafted request cannot move a Ticket to Resolved or Closed without the backend confirmation/evidence gate. | API-09, AUTH-03, E2E-03 |
| AC-07 | Problem Appears Resolved records an advisory indication and leaves formal status unchanged. | API-10, REG-03, E2E-03 |
| AC-08 | Requester dashboard counts and recent Ticket previews are owner-scoped and match the documented formulas and Asia/Bangkok boundaries. | UNIT-04, API-05, E2E-01 |
| AC-09 | IT Staff dashboard returns unassigned, mine, urgent, status, priority, and recent-work metrics with explicit zero buckets and correct drill-down links. | API-06, UI-04, E2E-01 |
| AC-10 | Administrator receives the approved read-only aggregate dashboard and user counts without acquiring status/assignment mutation access. | AUTH-04, API-07, API-12 |
| AC-11 | A stale Ticket or Action Taken update returns a safe `412 STALE_WRITE` conflict and does not overwrite newer work; repeated create retries do not duplicate Action Taken records. | UNIT-03, API-11, UI-03, WORK-02 |
| AC-12 | Migration preserves all Labs 1–3 records and legacy Tickets remain valid with zero Actions Taken. | MIG-01, MIG-02 |
| AC-13 | Re-running seed produces the same fixture counts and includes zero/one/multiple Actions Taken, all statuses, priorities, and assignment states. | MIG-03 |
| AC-14 | Dashboard, Actions Taken, status workflow, and prior role screens have loading, empty, validation, conflict, forbidden, not-found, and safe failure behavior. | API-04, UI-01, UI-02, UI-03, UI-04, UI-05, E2E-01, E2E-02, E2E-03, E2E-04 |
| AC-15 | Zen Green desktop/tablet/mobile layouts remain accessible, keyboard-operable, readable, and free of clipping, overlap, and page-level horizontal scrolling. | STYLE-01, RESP-01, RESP-02, RESP-03 |
| AC-16 | The performance-smoke suite shows dashboard aggregates and a paged Action Taken list remain within the documented budget on the seeded fixture. | PERF-01, PERF-02 |
| AC-17 | All Labs 1–3 authentication, Requester, Attachment, Public Comment, Internal Note, IT Staff, and Administrator behavior remains green after the increment. | MIG-04, REG-01, REG-02, REG-03, REG-04, E2E-04 |

## 10. Definition of Done

- [ ] This specification, `tests.md`, `ui-spec.md`, and `api-spec.md` are
  reviewed and approved before Issue 2 implementation begins.
- [ ] All FR/BR and AC items have an implementation reference and a passing
  automated test, or an approved reason for a non-automated check.
- [ ] Prisma migration, backfill, recovery rehearsal, and idempotent seed are
  reviewed; pre/post snapshots prove no Lab 1–3 data loss.
- [ ] Action Taken create/list/update enforces all seven business fields,
  server-derived performer, role matrix, follow-up conditional rule, safe
  errors, ETags, and duplicate-safe retry behavior.
- [ ] All status transitions and resolution/closure gates are enforced by the
  backend, including direct crafted requests and stale concurrent updates.
- [ ] Requester, IT Staff, and Administrator dashboards match database query
  evidence for non-zero and zero fixtures; every practical card has a working
  drill-down.
- [ ] Unit, API/integration, UI, UI-style, responsive, authorization,
  workflow, migration-regression, performance-smoke, and E2E suites pass on
  the final main branch.
- [ ] Existing Lab 2/3 suites pass without weakening or deleting earlier
  tests; no obsolete selector, duplicate control, console error, unsafe data,
  or placeholder UI remains.
- [ ] Screenshots at desktop, tablet, and mobile widths cover dashboards,
  Actions Taken, status workflow, empty/error/forbidden states, and regression
  screens. The commit containing approval and implementation is retained as
  Submission Part 2 evidence.
- [ ] README setup, migration, seed, test, and demonstration instructions are
  current, and reviewer/AI-use evidence is complete.

## 11. Assumptions and Decisions

| Decision | Choice | Reason / impact |
|---|---|---|
| Identity for writes | Session-derived `req.auth.user.id` | Prevents forged performer, owner, requester, or role values and preserves Lab 3 authorization. |
| Action Taken ownership | One Ticket to many Actions Taken; performer is independent of primary Owner | Models the stakeholder rule that one Owner coordinates while different staff perform work. |
| Action Taken edit semantics | No delete; performer and Ticket are immutable; editable fields use the Action Taken version | Keeps a concise operational record and prevents accidental reassignment of history. |
| Concurrency | Integer `version` plus strong `If-Match` ETags; `412 STALE_WRITE` on any stale Ticket/Action Taken write; `428 PRECONDITION_REQUIRED` when a required concurrency precondition is missing | Timestamp equality is vulnerable to precision/clock ambiguity. A monotonic version gives deterministic compare-and-swap behavior and one error mapping across resources. |
| Action Date/Time editability | `actionAt` is client-editable for IT Staff/Administrator; displayed in `Asia/Bangkok` and submitted as explicit UTC | Supports correction of operational timestamps while preserving `createdAt`, `performedBy`, and the immutable relationship to the Ticket. |
| Action Taken retries | `Idempotency-Key` scoped to authenticated User and normalized payload | Prevents duplicate Action Taken rows after browser/network retries without hiding a changed-payload conflict. |
| Reporting time | Fixed `Asia/Bangkok`; storage and comparisons in UTC; half-open local calendar windows | Makes daily dashboard evidence reproducible across browsers and avoids inclusive-end double counting. |
| Dashboard storage | Live aggregate queries, no materialized counter table | PostgreSQL remains the authority; no asynchronous counter drift or repair job is needed for this sprint. |
| Legacy Action Taken history | No synthetic backfill | A fabricated Action Taken would misrepresent historical work. Legacy Tickets show zero Actions Taken and remain fully usable. |
| Administrator status | Administrator can create/update Actions Taken and view dashboard data, but cannot assign or change formal status | Preserves the intentionally narrow Lab 3 Administrator boundary while satisfying the Lab 4 Action Taken responsibility. |
| Administrator dashboard drill-down | Use a dedicated read-only `/admin/tickets` view instead of the IT Staff queue | Keeps grouped metric links actionable without granting Administrator staff-queue assignment/status permissions. |
| Attachment Notes | Free-text guidance only; existing Attachment endpoints remain separate | Avoids duplicate file lifecycle/storage semantics and keeps the requested field useful for investigation. |
| Resolution evidence | Explicit confirmation plus a non-empty resolution/closure summary | The client can guide the user, but only this server-side gate prevents accidental or forged closure. |
| Approval gate | Documentation approval precedes Issue 2 | Provides the required screenshot/commit evidence and prevents implementation from drifting away from the agreed contract. |
