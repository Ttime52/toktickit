# TokTickIT Lab 4 REST API Specification

**Version:** 1.0 — Spec-DD contract  
**Base path:** `/api`  
**Status:** Approval baseline before Issue 2 implementation

This document extends the Lab 2 and Lab 3 REST contracts. Existing endpoint
semantics remain valid unless an additive Lab 4 field is called out here. JSON
uses camelCase, IDs are positive integers, and timestamps are ISO 8601 UTC
strings. All protected requests use the existing opaque HttpOnly server
session; the API never trusts a client-supplied user ID, role, requester ID,
or `performedBy` value.

Terminology is fixed across the Lab 4 documents: one record is an **Action
Taken**, a collection is **Actions Taken**, `ActionTaken` is the code/model
identifier, and `/actions` is the API resource path. Canonical JSON names are
camelCase (`actionAt`, `actionDescription`, `result`, `performedBy`,
`followUpRequired`, `followUpNote`, and `attachmentNotes`); snake_case names
are database-only mappings.

## 1. Conventions, authentication, and safe errors

### 1.1 Authentication and authorization

- `GET /api/health` and `/api/auth/login` are public.
- `POST /api/auth/logout`, `GET /api/auth/me`, and
  `POST /api/auth/change-password` follow the Lab 3 session contract.
- Every other endpoint requires an authenticated, active User with completed
  mandatory password change. The server derives `req.auth.user` from the
  session on every request.
- A Requester is scoped to owned Tickets. IT Staff can operate the staff queue,
  status workflow, and all accessible Ticket work. Administrators retain Lab 3
  administrative access and receive the explicitly listed Lab 4 Action Taken
  and dashboard capabilities; they do not gain assignment or status mutation.
- `Origin`/same-origin protection remains required for browser state-changing
  requests as in Lab 3. Direct API clients still receive the same server-side
  role and ownership checks.

### 1.2 Safe error envelope

All JSON errors use this shape and never include stack traces, SQL, file paths,
passwords, storage keys, session values, or private note/Action Taken data:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "fields": {
      "followUpNote": "A follow-up note is required when follow-up is required."
    }
  }
}
```

`fields` is optional. A stale error may include safe resource/version metadata:

```json
{
  "error": {
    "code": "STALE_WRITE",
    "message": "The record changed. Reload it before saving again.",
    "resource": "actionTaken",
    "currentVersion": 4
  }
}
```

Foreign own-scoped resources use the established safe `404` behavior. A role
forbidden operation is `403` without protected data.

### 1.3 Endpoint inventory

| Method and path | Purpose | Success | Allowed roles |
|---|---|---:|---|
| `GET /api/health` | Lab 1 health check | `200` | Public |
| `POST /api/auth/login` | Start session | `200` | Public |
| `POST /api/auth/logout` | Revoke current session | `204`/`200` | Authenticated self |
| `GET /api/auth/me` | Current identity | `200` | Authenticated self |
| `POST /api/auth/change-password` | Change current password | `200` | Authenticated self |
| `GET /api/development-requesters`, `GET /api/requesters` | Retired Lab 2 selectors | `410` | Public safe response |
| `GET /api/categories`, `GET /api/related-systems` | Active references | `200` | Any completed authenticated User |
| `POST /api/tickets` | Create owned Ticket | `201`, replay `200` | Requester |
| `GET /api/tickets` | Owned Ticket list | `200` | Requester |
| `GET /api/tickets/:ticketId` | Owned/read-only Ticket detail | `200` | Requester owner, Administrator inspection |
| `POST /api/tickets/:ticketId/attachments` | Upload Attachment | `201` | Requester owner |
| `GET /api/tickets/:ticketId/attachments` | Attachment metadata | `200` | Requester owner, IT Staff |
| `GET /api/tickets/:ticketId/attachments/:attachmentId` | One attachment metadata record | `200` | Requester owner, IT Staff |
| `GET /api/tickets/:ticketId/attachments/:attachmentId/download` | Download/preview bytes | `200` | Requester owner, IT Staff |
| `DELETE /api/tickets/:ticketId/attachments/:attachmentId` | Soft-remove Attachment | `200` | Requester owner |
| `POST /api/tickets/:ticketId/problem-appears-resolved` | Advisory resolution indication | `200` | Requester owner |
| `GET /api/tickets/:ticketId/comments` | Public Comment list | `200` | Requester owner, IT Staff, Administrator |
| `POST /api/tickets/:ticketId/comments` | Add Public Comment | `201` | Requester owner, IT Staff |
| `GET /api/tickets/:ticketId/internal-notes` (`/notes`) | Internal Note list | `200` | IT Staff, Administrator |
| `POST /api/tickets/:ticketId/internal-notes` (`/notes`) | Add Internal Note | `201` | IT Staff |
| `GET /api/tickets/:ticketId/actions` | Action Taken list | `200` | Requester owner, IT Staff, Administrator |
| `POST /api/tickets/:ticketId/actions` | Create Action Taken | `201`, replay `200` | IT Staff, Administrator |
| `PATCH /api/tickets/:ticketId/actions/:actionId` | Update Action Taken | `200` | IT Staff, Administrator |
| `GET /api/staff/tickets` | Staff queue | `200` | IT Staff |
| `GET /api/staff/users` | Active owner options | `200` | IT Staff |
| `GET /api/staff/tickets/:ticketId` | Staff Ticket detail | `200` | IT Staff |
| `GET /api/admin/tickets` | Administrator read-only dashboard drill-down | `200` | Administrator |
| `PATCH /api/staff/tickets/:ticketId/owner` | Claim/assign/reassign | `200` | IT Staff |
| `PATCH /api/staff/tickets/:ticketId` | Priority/status/workflow update | `200` | IT Staff; Administrator priority-only |
| `GET /api/dashboard/requester` | Requester metrics and recent Tickets | `200` | Requester |
| `GET /api/dashboard/staff` | IT Staff metrics and previews | `200` | IT Staff |
| `GET /api/dashboard/administrator` | Staff aggregates plus user counts | `200` | Administrator |
| `GET /api/users` | User Management list | `200` | Administrator |
| `POST /api/users` | Create User | `201` | Administrator |
| `PATCH /api/users/:userId` | Edit User | `200` | Administrator |
| `POST /api/users/:userId/reset-password` | Set initial password | `200` | Administrator |

There is no Action Taken delete endpoint. `DELETE` on an Action Taken returns
`405 METHOD_NOT_ALLOWED` and does not change data.

## 2. Shared resource shapes

### 2.1 Action Taken representation

```json
{
  "id": 901,
  "ticketId": 101,
  "actionAt": "2026-10-07T09:30:00.000Z",
  "actionDescription": "Checked the endpoint logs and restarted the service.",
  "result": "The service returned to a healthy state.",
  "performedBy": {
    "id": 8,
    "displayName": "Somchai Staff",
    "role": "IT_STAFF"
  },
  "followUpRequired": true,
  "followUpNote": "Verify the error rate after the next scheduled deployment.",
  "attachmentNotes": "Review attachment 501 for the before/after log screenshot.",
  "createdAt": "2026-10-07T09:30:02.000Z",
  "updatedAt": "2026-10-07T09:30:02.000Z",
  "updatedBy": null,
  "version": 1,
  "etag": "\"action-taken-901-v1\""
}
```

The server derives `performedBy` from the session and rejects any client
attempt to send `performedBy`, `performedByUserId`, `ticketId`,
`createdAt`, `version`, or `seedKey`. `updatedBy` is optional response metadata
for the editor; it is not a replacement for the original performer. `etag` is
read-only response metadata and matches the strong HTTP `ETag` header for that
Action Taken resource.

### 2.2 Validation table

| Request field | Type | Validation |
|---|---|---|
| `actionAt` | string | Required ISO 8601 timestamp with an explicit UTC offset or `Z`; normalized to UTC; timezone-less values are rejected; no more than five minutes in the future |
| `actionDescription` | string | Required after trim; 1–2,000 Unicode characters; plain text |
| `result` | string | Required after trim; 1–2,000 Unicode characters; plain text |
| `followUpRequired` | boolean | Required; no string coercion |
| `followUpNote` | string/null | Required 1–1,000 chars when true; empty/null when false |
| `attachmentNotes` | string/null | Optional; trimmed, max 1,000 chars; descriptive text only |
| `expectedTicketVersion` | integer | Required on Action Taken update; missing returns `428 PRECONDITION_REQUIRED`, malformed/wrong type returns `400 VALIDATION_ERROR`, and a stale value returns `412 STALE_WRITE` |

Unknown fields, malformed IDs, malformed JSON, and wrong types return
`400 VALIDATION_ERROR` before any database write.

## 3. Action Taken endpoints

### 3.1 List Actions Taken

`GET /api/tickets/:ticketId/actions?page=1&pageSize=20`

The server validates a positive `ticketId`, performs the role/ownership check,
and returns chronological data. `pageSize` accepts `10`, `20`, `50`, or `100`;
default is `20`. The list is ordered `actionAt ASC, id ASC`, making equal
timestamps stable. The query never accepts `performedByUserId` or a requester
override.

Success:

```json
{
  "data": [
    {
      "id": 901,
      "ticketId": 101,
      "actionAt": "2026-10-07T09:30:00.000Z",
      "actionDescription": "Checked the endpoint logs and restarted the service.",
      "result": "The service returned to a healthy state.",
      "performedBy": { "id": 8, "displayName": "Somchai Staff", "role": "IT_STAFF" },
      "followUpRequired": false,
      "followUpNote": null,
      "attachmentNotes": null,
      "createdAt": "2026-10-07T09:30:02.000Z",
      "updatedAt": "2026-10-07T09:30:02.000Z",
      "updatedBy": null,
      "version": 1,
      "etag": "\"action-taken-901-v1\""
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false,
    "ticketVersion": 7
  }
}
```

An empty list is `200 {"data":[],"meta":{"totalItems":0,"totalPages":0}}`.
Requester ownership is applied before querying Action Taken rows; a foreign Ticket
is a safe `404 TICKET_NOT_FOUND` for an own-scoped Requester.

### 3.2 Create an Action Taken

`POST /api/tickets/:ticketId/actions`

Required headers:

```text
Content-Type: application/json
Idempotency-Key: 36-character-or-other-16-to-64-character-ASCII-key
If-Match: "ticket-101-v7"
```

Request body:

```json
{
  "actionAt": "2026-10-07T09:30:00.000Z",
  "actionDescription": "Checked the endpoint logs and restarted the service.",
  "result": "The service returned to a healthy state.",
  "followUpRequired": true,
  "followUpNote": "Verify the error rate after the next deployment.",
  "attachmentNotes": "Review the before/after log screenshot."
}
```

For first use, the server validates the Ticket, active actor, ETag, fields, and
idempotency key, then inserts the Action Taken and increments the parent Ticket
version in one transaction. `performedBy` is the authenticated actor; it is not
read from the body. First use returns:

```json
{
  "data": {
    "id": 901,
    "ticketId": 101,
    "actionAt": "2026-10-07T09:30:00.000Z",
    "actionDescription": "Checked the endpoint logs and restarted the service.",
    "result": "The service returned to a healthy state.",
    "performedBy": { "id": 8, "displayName": "Somchai Staff", "role": "IT_STAFF" },
    "followUpRequired": true,
    "followUpNote": "Verify the error rate after the next deployment.",
    "attachmentNotes": "Review the before/after log screenshot.",
    "createdAt": "2026-10-07T09:30:02.000Z",
    "updatedAt": "2026-10-07T09:30:02.000Z",
    "updatedBy": null,
    "version": 1,
    "etag": "\"action-taken-901-v1\""
  },
  "meta": { "idempotentReplay": false, "ticketVersion": 8 }
}
```

with `201 Created` and an Action Taken ETag such as `"action-taken-901-v1"`. An equivalent
retry by the same authenticated User returns `200` with the original row and
`idempotentReplay=true`; a different normalized body or cross-user reuse
returns `409 IDEMPOTENCY_KEY_REUSED` and reveals no original protected record.

### 3.3 Update an Action Taken

`PATCH /api/tickets/:ticketId/actions/:actionId`

Required header and body field:

```text
If-Match: "action-taken-901-v1"
```

```json
{
  "actionAt": "2026-10-07T09:30:00.000Z",
  "actionDescription": "Checked logs, restarted the service, and verified health.",
  "result": "The service is healthy and the error rate is normal.",
  "followUpRequired": false,
  "followUpNote": null,
  "attachmentNotes": null,
  "expectedTicketVersion": 8
}
```

Only the six editable business fields — `actionAt`, `actionDescription`,
`result`, `followUpRequired`, `followUpNote`, and `attachmentNotes` — plus
`expectedTicketVersion` are accepted. `actionAt` is intentionally
client-editable by IT Staff/Administrator; it is displayed in `Asia/Bangkok`
and submitted with an explicit UTC offset or `Z`. The transaction compares the
Action Taken ETag and parent Ticket version, updates the row, increments both
versions, and returns `200` with the new ETags. `performedBy`, `ticketId`, and
`createdAt` remain unchanged. The operation returns `412 STALE_WRITE` when
either version is stale and performs no partial update. The UI must refetch
both resources and ask the user to review before retrying.

## 4. Ticket workflow and resolution endpoints

### 4.1 Staff Ticket update

The existing endpoints remain the mutation surface:

- `PATCH /api/staff/tickets/:ticketId/owner` for `claim`, `assign`, and
  `reassign`;
- `PATCH /api/staff/tickets/:ticketId` for owner (when allowed), IT Priority,
  and status operations.

Both require `If-Match: "ticket-<id>-v<version>"`. The server performs a
compare-and-swap update inside a transaction. A successful response increments
`Ticket.version`, returns `ETag`, and refreshes the detail representation.

The combined body may contain only the following fields:

```json
{
  "action": "reassign",
  "assignedToUserId": 9,
  "itPriority": "HIGH",
  "currentStatus": "RESOLVED",
  "confirmStatusChange": true,
  "resolutionSummary": "The endpoint was repaired and verified healthy.",
  "closureSummary": null,
  "cancelReason": null,
  "reopenReason": null
}
```

The status matrix and gates are normative in
[specification.md §4.5](specification.md). In short:

- only IT Staff can assign/claim/reassign or change status;
- Administrator can send only `itPriority`;
- `RESOLVED` requires an allowed transition, IT Staff,
  `confirmStatusChange:true`, and `resolutionSummary` (10–2,000 chars);
- `CLOSED` requires current `RESOLVED`, IT Staff,
  `confirmStatusChange:true`, and `closureSummary` (10–2,000 chars);
- cancellation/reopening requires its trimmed reason field (3–1,000 chars);
- invalid transitions return `409 INVALID_STATUS_TRANSITION`, missing/false
  gate data returns `400 STATUS_CONFIRMATION_REQUIRED`, and stale requests
  return `412 STALE_WRITE`.

The backend applies these checks even when the client omits the UI dialog or
sends a crafted request. Assignment, status, priority, resolution timestamps,
and version are updated atomically; errors do not partially mutate the Ticket.

### 4.2 Requester resolution indication

`POST /api/tickets/:ticketId/problem-appears-resolved` retains the Lab 3 body
`{"confirm":true}` and owner-only authorization. It is valid only in
`IN_PROGRESS` or `WAITING_FOR_REQUESTER`, records the authenticated Requester
and UTC time once, returns `409 RESOLUTION_INDICATION_ALREADY_RECORDED` on a
duplicate, and leaves `currentStatus` unchanged. IT Staff later clears it when
work resumes or performs formal resolution. It never satisfies the formal
resolution gate.

## 5. Dashboard endpoints (Lab sheet §6.2)

### 5.1 Common dashboard response

All dashboard endpoints return a concise object rather than a full Ticket
collection:

```json
{
  "data": {
    "asOf": "2026-10-07T10:00:00.000Z",
    "reportTimeZone": "Asia/Bangkok",
    "window": {
      "key": "7d",
      "start": "2026-10-01T17:00:00.000Z",
      "end": "2026-10-08T17:00:00.000Z"
    },
    "metrics": {
      "openTicketCount": { "value": 3, "drillDown": { "path": "/my-tickets", "query": { "scope": "active" } } }
    },
    "recentTickets": []
  }
}
```

The default and only supported `window` for this sprint is `7d`; an omitted
value defaults to it. The server captures `asOf` first; `window.start` is the
start of the `Asia/Bangkok` local day six days before the local date of `asOf`,
and `window.end` is the start of the next local day, converted to UTC.
Comparisons are `>= start AND < end`. Client timezone and arbitrary `userId`
parameters are rejected.

Every metric object has `value` and a safe drill-down `{path,query}` where a
drill-down is useful. Count values are integers; grouped metrics return every
enum bucket with a zero value.

### 5.2 Requester dashboard

`GET /api/dashboard/requester?window=7d`

Allowed role: Requester. The API applies `ticket.requesterId = session.userId`
to all queries. It returns `openTicketCount`,
`waitingForRequesterCount`, `recentlyUpdatedTicketCount`,
`recentlyResolvedTicketCount`, `resolutionIndicationCount`, and at most five
`recentTickets` ordered by `updatedAt DESC, id DESC`. The formulas, empty
messages, and drill-downs are the normative table in
[specification.md §4.6](specification.md). No matching records means `200`
with zero-valued metrics and `recentTickets:[]`.

### 5.3 IT Staff dashboard

`GET /api/dashboard/staff?window=7d`

Allowed role: IT Staff. It returns `unassignedActiveCount`,
`myAssignedActiveCount`, `urgentActiveCount`, `recentlyUpdatedCount`,
`ticketsByStatus`, `ticketsByItPriority`, `recentTickets`, and
`urgentTickets`. Status buckets contain all eight statuses and priority
 buckets contain all four priorities, including zero values. `recentTickets`
is restricted to the requested dashboard window using `updatedAt >=
window.start AND updatedAt < window.end`; `urgentTickets` is the current
active urgent queue. Preview items are
safe Ticket summaries with `id`, `ticketNumber`, `summary`, `currentStatus`,
`itPriority`, `ticketOwner`, and `updatedAt`; they do not include internal
notes, sessions, password data, or storage keys.

### 5.4 Administrator dashboard

`GET /api/dashboard/administrator?window=7d`

Allowed role: Administrator. It returns these read-only tenant-wide metrics:
`unassignedActiveCount`, `myAssignedActiveCount`, `urgentActiveCount`,
`recentlyUpdatedCount`, `ticketsByStatus`, `ticketsByItPriority`,
`recentTickets`, and `urgentTickets`, plus `activeUserCount` and
`inactiveUserCount`. The links may open
filtered read-only views, but this endpoint does not authorize queue,
assignment, or status mutation. A Requester or IT Staff receives `403`.

To keep those links actionable without widening the Lab 3 staff-queue
permission, Administrator grouped-metric links use:

`GET /api/admin/tickets?assignment=unassigned&itPriority=<priority>&currentStatus=<status>&scope=active&updatedWithin=7d`

This endpoint is a read-only dashboard adapter. It reuses the staff queue's
safe search/filter/sort/pagination response shape, but is Administrator-only,
does not return owner options, and does not authorize assignment, status,
priority, comment, note, or Action Taken mutation. Each row includes an
inspection link to `GET /api/tickets/:ticketId`; the endpoint returns `200 []`
when no rows match and uses the same `Asia/Bangkok`/UTC filter boundaries as
the dashboard. It accepts the retained staff query parameters
`search`, `categoryId`, `relatedSystemId`, `requestedPriority`, `itPriority`,
`currentStatus`, `assignment` (`all|assigned|unassigned|mine`), `sortBy`,
`sortOrder`, `page`, and `pageSize`,
plus Lab 4 `scope=active` and `updatedWithin=7d`. Invalid or unsupported
filters return `400 INVALID_QUERY_PARAMETER`.

### 5.5 Dashboard failures and evidence

The dashboard service uses parameterized aggregate queries in one read-only
`REPEATABLE READ` transaction. A database/service failure returns `500 INTERNAL_ERROR` or `503
SERVICE_UNAVAILABLE` with the safe envelope; it must not return a partially
calculated mixture of client and server values. The response exposes
`reportTimeZone`, `asOf`, `window.start`, and `window.end` so screenshot and
database evidence can reproduce the boundary.

## 6. Retained Lab 1–3 contracts

### 6.1 Reference and authentication routes

`GET /api/categories?active=true` and
`GET /api/related-systems?active=true` require a completed authenticated
session, return active rows sorted by `id ASC`, and return `200 []` when empty.
Any `active` value other than omitted/`true` is `400
INVALID_QUERY_PARAMETER`. The former `GET /api/development-requesters` and
`GET /api/requesters` selectors remain public safe `410 ENDPOINT_RETIRED`.

Login, session cookie, mandatory password change, generic invalid-credential
feedback, throttling, logout revocation, and User Management retain the Lab 3
contracts. No Lab 4 endpoint accepts a requester selector or browser-readable
token.

### 6.2 Requester Ticket and Attachment routes

`POST /api/tickets` retains the Lab 2/3 `Idempotency-Key`, category/system,
summary, requested priority, description, backend Ticket Number, `NEW` status,
and authenticated Requester ownership rules. `GET /api/tickets` applies
ownership before search/filter/sort/pagination; `GET /api/tickets/:ticketId`
returns an owned read-only Ticket for a Requester or an authorized
Administrator inspection. Requester inputs cannot set `itPriority`, status,
owner, dates, Action Taken fields, or requester identity.

Lab 4 adds the following server-side filters so dashboard drill-down links are
real, repeatable queries rather than client-only labels:

- Requester `GET /api/tickets` accepts `scope=active`,
  `updatedWithin=7d`, `resolvedWithin=7d`, and
  `resolutionIndicated=true`. These filters are combined with the existing
  ownership/search/filter rules; `scope=active` means the five `ACTIVE`
  statuses from the specification, and `resolvedWithin=7d` means
  `currentStatus IN (RESOLVED,CLOSED)` plus a `resolvedAt` timestamp in the
  dashboard window.
- Staff `GET /api/staff/tickets` accepts `scope=active` and
  `updatedWithin=7d` in addition to its Lab 3 filters. `scope=active` applies
  to the same five statuses and `updatedWithin=7d` uses the fixed
  `Asia/Bangkok` dashboard window.
- `updatedWithin` and `resolvedWithin` accept only `7d` in this sprint;
  `resolutionIndicated` accepts only `true`. Unknown or invalid values return
  `400 INVALID_QUERY_PARAMETER`. The API computes the date window in
  `Asia/Bangkok` and compares UTC timestamps using `>= start` and `< end`.

Attachment upload, metadata, download/preview, soft removal, file signature,
5 MiB/file, five active-file limit, removed/unavailable `410`, safe filename,
and storage cleanup behavior remain unchanged. IT Staff can read/download
authorized Attachment metadata/bytes; Administrators do not receive Attachment
bytes in inspection responses.

### 6.3 Comments and Internal Notes

`GET/POST /api/tickets/:ticketId/comments` retains chronological append-only
plain-text Public Comments: Requester owner and IT Staff may post; Administrator
is read-only. `GET/POST /api/tickets/:ticketId/internal-notes` and `/notes`
retain private plain-text Internal Notes: IT Staff and Administrator may read;
only IT Staff may post. Requester responses never include Internal Notes.

### 6.4 Staff queue, users, and compatibility shapes

`GET /api/staff/tickets`, `GET /api/staff/users`, and
`GET /api/staff/tickets/:ticketId` retain Lab 3 search/filter/sort/pagination,
active owner options, safe detail, and role rules. The detail response may
include `actionsSummary` (`count`, `latestActionAt`) for a compact header, but
the full Action Taken collection is retrieved through §3.1 to keep list size
bounded. The Lab 4 `scope=active` and `updatedWithin=7d` filters above are
included in the staff queue contract so metric drill-down links open the exact
set counted by the dashboard.

`GET /api/admin/tickets` is intentionally separate from the staff queue. It is
the Administrator dashboard's read-only drill-down adapter and must not expose
the staff owner selector or any mutation affordance.

`GET/POST/PATCH /api/users` and
`POST /api/users/:userId/reset-password` retain Administrator-only User
Management, explicit `isActive`, normalized email uniqueness, password hashing,
session revocation, and safety rules. `GET /api/users` additionally accepts the
optional exact `isActive=true|false` filter used by the Administrator dashboard
account-count drill-down; omitted means both active and inactive users. No
password, hash, or session is returned.

## 7. Authorization matrix for the new capabilities

| Operation | Requester | IT Staff | Administrator |
|---|---|---|---|
| `GET /tickets/:id/actions` | Own Ticket only | Any accessible Ticket | Any accessible Ticket |
| `POST /tickets/:id/actions` | `403` | Yes | Yes |
| `PATCH /tickets/:id/actions/:actionId` | `403` | Yes | Yes |
| `GET /dashboard/requester` | Own data | `403` | `403` |
| `GET /dashboard/staff` | `403` | Yes | `403` (use admin endpoint) |
| `GET /dashboard/administrator` | `403` | `403` | Yes |
| `GET /admin/tickets` | `403` | `403` | Yes (read-only) |
| `PATCH /staff/tickets/:id` status/owner | `403` | Yes | `403` |
| `PATCH /staff/tickets/:id` IT Priority only | `403` | Yes | Yes |

The matrix is checked before data serialization. A Requester cannot learn the
existence of a foreign own-scoped Ticket through an Action Taken or dashboard
query.

## 8. Conflict, stale-update, and idempotency contract (Lab sheet §6.1)

### 8.1 Optimistic concurrency decision

The selected mechanism is a monotonic integer `version` plus strong ETags:

- `GET /api/tickets/:ticketId`, staff detail, and dashboard-linked Ticket
  summaries expose `version` where a mutable detail is returned and send
  `ETag: "ticket-<id>-v<version>"`.
- `PATCH /api/staff/tickets/:ticketId` and `/owner` require that Ticket ETag in
  `If-Match`.
- Actions Taken list responses return the parent `ticketVersion`; each Action
  Taken representation includes read-only `etag`, and Action Taken resource
  responses send the matching `ETag: "action-taken-<id>-v<version>"` header.
- Action Taken create requires the latest Ticket ETag. Action Taken update
  requires the Action Taken ETag and `expectedTicketVersion` in the JSON body.
- The database update condition includes the expected version. Exactly one
  concurrent writer wins; the loser gets `412 STALE_WRITE` and no field is
  silently overwritten.

`If-Match: *` is not accepted because it would disable stale protection.
Missing `If-Match` or `expectedTicketVersion` returns `428
PRECONDITION_REQUIRED`. A malformed precondition returns `400
VALIDATION_ERROR`. A stale ETag/version always returns `412 STALE_WRITE`, for
both Ticket and Action Taken resources. The client must GET, show a conflict
message, preserve unsaved form values, and ask for an explicit review before
resubmitting. The server does not auto-merge status, owner, priority, or Action
Taken fields.

### 8.2 Duplicate requests and atomicity

Action Taken creation requires an ASCII 16–64 character `Idempotency-Key`. The key
is scoped to authenticated actor and endpoint. Equivalent normalized payloads
are looked up before the first-use ETag compare: an exact retry replays the
original response with `200` even when the parent Ticket version has advanced.
Only a first use must pass the current Ticket ETag. A changed payload,
different actor, or key collision returns `409 IDEMPOTENCY_KEY_REUSED`. Ticket
and Action Taken mutations,
including version increment, are one database transaction. A database failure
cannot leave an Action Taken row without a parent or increment a parent without its
child.

## 9. Status and safe-error matrix

| HTTP status | Meaning / example codes |
|---:|---|
| `200` | Successful read/update, or idempotent replay |
| `201` | Ticket or Action Taken created |
| `204` | Successful logout when no body is needed |
| `400` | `VALIDATION_ERROR`, `INVALID_QUERY_PARAMETER`, `STATUS_CONFIRMATION_REQUIRED`, invalid reference |
| `401` | `AUTHENTICATION_REQUIRED`, `INVALID_CREDENTIALS`, `INVALID_CURRENT_PASSWORD` |
| `403` | `FORBIDDEN`, `PASSWORD_CHANGE_REQUIRED`, role/operation restriction |
| `404` | `TICKET_NOT_FOUND`, `ACTION_NOT_FOUND`, `ATTACHMENT_NOT_FOUND`, `USER_NOT_FOUND`; safe foreign own-scope behavior |
| `405` | `METHOD_NOT_ALLOWED` for Action Taken deletion |
| `409` | `INVALID_STATUS_TRANSITION`, `NO_OPERATION`, `IDEMPOTENCY_KEY_REUSED`, `RESOLUTION_INDICATION_ALREADY_RECORDED`, owner conflicts |
| `410` | `ENDPOINT_RETIRED`, `ATTACHMENT_NOT_AVAILABLE` |
| `412` | `STALE_WRITE` for any stale Ticket or Action Taken ETag/version |
| `413` | `ATTACHMENT_TOO_LARGE` |
| `415` | `ATTACHMENT_TYPE_NOT_ALLOWED` |
| `428` | `PRECONDITION_REQUIRED` when a required `If-Match` or `expectedTicketVersion` precondition is absent |
| `429` | `AUTHENTICATION_RATE_LIMITED` |
| `500` | `INTERNAL_ERROR` with generic message |
| `503` | `SERVICE_UNAVAILABLE`, `STORAGE_UNAVAILABLE` |

## 10. Traceability

The Administrator read-only dashboard drill-down adapter is covered by API-12
and AUTH-02 in addition to the aggregate dashboard coverage below.

| API area | Specification | Planned tests |
|---|---|---|
| Action Taken fields and validation | specification §4.1, §5 BR-01–BR-07 | UNIT-01, API-02, API-03, UI-02 |
| Action Taken authorization | specification §4.3, API §7 | AUTH-01, AUTH-02, E2E-02 |
| Ticket transitions and resolution gate | specification §4.5, API §4 | UNIT-02, API-08, API-09, E2E-03 |
| Requester dashboard | specification §4.6, API §5.2 | UNIT-04, API-05, E2E-01 |
| IT Staff/Admin dashboards | specification §4.6, API §5.3–5.4 | API-06, API-07, E2E-01 |
| Concurrency and retries | API §8 | UNIT-03, API-11, WORK-02 |
| Migration and retained routes | specification §7, API §6 | MIG-01–MIG-04, REG-01–REG-04 |
