# Lab 3 REST API Contract

All paths are relative to `/api`. JSON responses use `Content-Type:
application/json; charset=utf-8`. Except for login and the retained health
check, all protected endpoints require the session described below. This
contract supersedes only the requester-context part of Lab 2; its Ticket
Number, validation and Attachment contracts remain.

## 1. Authentication, session and safe errors

This section is the implementation contract for the labsheet's session/token
decision (§6.1) and safe-error behavior (§6.2).

### 1.1 Authentication mechanism and session/token decision (labsheet §6.1)

**Decision:** use an opaque, cookie-bound server session rather than a
browser-readable JWT or token in storage. This permits server-side revocation
on logout, password events, deactivation and role changes while keeping the
client unable to forge identity or role claims.

`POST /auth/login` accepts `{ "email", "password" }`. Malformed JSON or missing
fields is `400 VALIDATION_ERROR`. On valid active
credentials it creates a cryptographically random opaque server-side session
(at least 256 bits; only its SHA-256 hash is stored) and sends
`Set-Cookie: toktickit_session=<opaque>; HttpOnly; SameSite=Lax; Path=/; Secure`
over HTTPS. Local HTTP development may omit `Secure` only under an explicit
development configuration. It returns `{ "data": { "user": userShape } }`. It returns generic
`401 INVALID_CREDENTIALS` for invalid email/password and inactive account so
account existence is not disclosed. After 5 failed attempts for the same
one-way email/IP bucket in 15 minutes, it returns generic
`429 AUTHENTICATION_RATE_LIMITED`; successful login clears the bucket. Password verification uses the Argon2id
hash stored for the User; it never returns a password or hash.

`POST /auth/logout` revokes the current session and clears the cookie (`204`).
`GET /auth/me` returns the current `userShape`; `401 AUTHENTICATION_REQUIRED`
when absent/expired. `POST /auth/change-password` accepts `{currentPassword,
newPassword}`; it is available to the current User, validates a 12–128
character new password, rotates the session, clears `mustChangePassword` and
returns `200 {"data":{"user":userShape}}`. Every request re-checks the
User's current `isActive` and role, so deactivation or a role edit takes effect
without waiting for the old session to expire. Each successful authenticated
request updates `lastSeenAt` and extends `expiresAt` by eight hours; an expired
or revoked row is unusable. Unsafe cookie requests require
an exact same-origin `Origin` header and otherwise return `403 CSRF_ORIGIN_INVALID`.
The browser client sends `credentials: "include"`; CORS allows only the
configured client origin with credentials (never `*`). No token is placed in
localStorage, URL, response body, source control or client code.
While `mustChangePassword=true`, every other protected endpoint returns
`403 PASSWORD_CHANGE_REQUIRED`; `GET /health` remains the public exception.

### 1.2 Safe-error behavior (labsheet §6.2)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "fields": { "email": "Enter a valid email address." }
  }
}
```

`fields` is optional. Errors MUST NOT expose account existence (where relevant),
passwords/hashes, cookies, stack traces, SQL, paths, storage keys or secrets.
`401` is missing/expired/invalid session; `403` is authenticated but disallowed.
For an own-scoped resource, a foreign ID is deliberately indistinguishable
from a missing resource and returns the same safe `404`; role-forbidden calls
remain `403`. Neither response includes protected data. `409` is a state
conflict. The login throttle is server-side and its counters never appear in a
response.

The non-sensitive `userShape` returned by authentication and User Management
endpoints is:

```json
{
  "id": 7,
  "displayName": "Narin Example",
  "email": "narin@example.test",
  "role": "IT_STAFF",
  "isActive": true,
  "mustChangePassword": false
}
```

## 2. Endpoint inventory and authorization

| Method/path | Success | Authorized role/action |
|---|---:|---|
| `GET /health` | 200 | public; Lab 1 endpoint retained unchanged |
| `POST /auth/login` | 200 | public |
| `POST /auth/logout` | 204 | current session |
| `GET /auth/me` | 200 | current session |
| `POST /auth/change-password` | 200 | current session |
| `GET /categories`; `GET /related-systems` | 200 | any active role |
| `GET /development-requesters` (retired) | 410 | all callers receive `ENDPOINT_RETIRED` |
| `GET /requesters` (retired alias) | 410 | all callers receive `ENDPOINT_RETIRED` |
| `POST /tickets` | 201 (replay 200) | Requester creates as self |
| `GET /tickets` | 200 | Requester reads own Tickets |
| `GET /tickets/:ticketId` | 200 | Requester reads own; Administrator read-only inspection |
| `POST /tickets/:ticketId/attachments` | 201 | Requester owner |
| `GET /tickets/:ticketId/attachments` | 200 | Requester owner or IT Staff |
| `GET /tickets/:ticketId/attachments/:attachmentId` | 200 | Requester owner or IT Staff |
| `GET /tickets/:ticketId/attachments/:attachmentId/download` | 200 binary | Requester owner or IT Staff |
| `DELETE /tickets/:ticketId/attachments/:attachmentId` | 200 | Requester owner |
| `POST /tickets/:ticketId/problem-appears-resolved` | 200 | Requester owner; records an indication only |
| `GET /tickets/:ticketId/comments` | 200 | Requester owner, IT Staff or Administrator |
| `POST /tickets/:ticketId/comments` | 201 | Requester owner or IT Staff |
| `GET /tickets/:ticketId/internal-notes` | 200 | IT Staff or Administrator |
| `POST /tickets/:ticketId/internal-notes` | 201 | IT Staff only |
| `GET /staff/users` | 200 | IT Staff only; active Ticket Owner options |
| `GET /staff/tickets` | 200 | IT Staff |
| `GET /staff/tickets/:ticketId` | 200 | IT Staff |
| `PATCH /staff/tickets/:ticketId` | 200 | IT Staff; Administrator for IT Priority only |
| `GET /users` | 200 | Administrator only |
| `POST /users` | 201 | Administrator only |
| `PATCH /users/:userId` | 200 | Administrator only |
| `POST /users/:userId/reset-password` | 200 | Administrator only |

## 3. Reference-data endpoints

The retained `GET /health` endpoint continues to return
`{"status":"ok","service":"TokTickIT API"}` and is not an authentication
or authorization signal.

`GET /categories?active=true` and `GET /related-systems?active=true` require an
active session and return active rows sorted by `id asc`:

```json
[{ "id": 2, "name": "Hardware" }]
```

The `active` parameter is optional and defaults to `true`; any value other than
`true` is `400 INVALID_QUERY_PARAMETER`. An empty list is `200 []`. No internal
timestamps or inactive rows are returned.

The Lab 2 `GET /development-requesters` and compatibility `GET /requesters`
selectors are retired after the client migration and return `410
ENDPOINT_RETIRED`; neither can be used as an identity or authorization input.

## 4. Requester Ticket and Attachment endpoints

`POST /tickets` accepts the Lab 2 body except `requesterId`; the session User
becomes the immutable requester. `GET /tickets` returns only that User's
Tickets and keeps Lab 2 search/filter/sort/page semantics. `GET /tickets/:id`
returns an owned Ticket for a Requester; an Administrator may use the same
route for read-only inspection. Passing `requesterId` anywhere is `400
INVALID_QUERY_PARAMETER`/`VALIDATION_ERROR`, not an override.

### Ticket request/response shapes

`POST /tickets` requires an ASCII `Idempotency-Key` (16–64 characters) and a
JSON body containing `categoryId`, `relatedSystemId`, `summary` and
`description`, with optional `requestedPriority`. IDs must be positive active
references; priority is `LOW|MEDIUM|HIGH|URGENT` and defaults to `MEDIUM`;
the server sets `itPriority` to that same requested value on create (the
Requester cannot submit or override it); summary is trimmed to 5–120
characters and description to 20–2,000. The client
cannot submit Ticket Number/date/status/IT Priority/requester or attachment
fields. First use returns `201 {"data":<ticket>,"meta":{"idempotentReplay":false}}`;
an equivalent replay by the same authenticated User returns `200` with the
same envelope and `meta.idempotentReplay=true`; a changed payload or reuse by
another User returns `409 IDEMPOTENCY_KEY_REUSED` without revealing the first
Ticket.

The created/detail representation is below. `ticketOwner` is the canonical
primary-owner summary; `assignedTo` is a response compatibility alias with the
same value. Mutation requests use the explicit `assignedToUserId` field below;
the server does not accept a client-supplied owner object or arbitrary ID alias.

```json
{
  "id": 101,
  "ticketNumber": "TT-2026-000101",
  "ticketDate": "2026-09-17T05:00:00.000Z",
  "requester": { "id": 7, "displayName": "Narin Example", "email": "narin@example.test" },
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 4, "name": "Corporate Laptop" },
  "summary": "Laptop battery drains quickly",
  "requestedPriority": "MEDIUM",
  "itPriority": "MEDIUM",
  "description": "The laptop battery drops below 20 percent after a short meeting.",
  "currentStatus": "NEW",
  "ticketOwner": null,
  "assignedTo": null,
  "assignedAt": null,
  "requesterResolutionIndicatedAt": null,
  "attachments": [],
  "createdAt": "2026-09-17T05:00:00.000Z",
  "updatedAt": "2026-09-17T05:00:00.000Z"
}
```

Ticket Number, Ticket Date and timestamps are generated in UTC. `GET /tickets`
accepts trimmed case-insensitive `search`, exact category/system/requested
priority filters, `currentStatus` from the BR-05 enum, and
`sortBy=ticketNumber|ticketDate|updatedAt|requestedPriority|currentStatus|category`,
`sortOrder=asc|desc`, `page` (default 1) and `pageSize=10|20|50` (default 10).
Search matches Ticket Number, Summary, Description, Category and Related
System; ownership filtering occurs before every other operation. Invalid or
unknown parameters return `400`; an empty/no-results list is `200 {data:[],meta}`.

Each list item contains `id`, `ticketNumber`, `ticketDate`, `summary`,
`category`, `relatedSystem`, `requestedPriority`, `itPriority`, `currentStatus`,
`requester`, `ticketOwner` (or `null`), `assignedTo` (the same owner summary),
`attachmentCount` and `updatedAt`; `meta` retains `page`, `pageSize`,
`totalItems`, `totalPages`, `hasNextPage` and `hasPreviousPage` from Lab 2.

`GET /tickets/:ticketId` validates a positive integer. A Requester must own the
Ticket; an Administrator may read any Ticket for inspection. Missing resources are
`404 TICKET_NOT_FOUND`; a requester ownership mismatch uses the same `404`
with no Ticket body so ownership cannot be used to enumerate IDs. A successful response is
`200 {"data":<ticket>}`. Requester representations never contain Internal
Notes. The `requesterResolutionIndicatedAt` value is either the UTC indication
timestamp or `null`; it is informational and does not mean that the Ticket is
formally resolved.

All Attachment paths in the inventory keep their Lab 2 validation, output
metadata and safe availability behavior, but remove `requesterId` query values.
Owner checks use session identity. IT Staff may retrieve metadata and download
bytes for operational work but cannot upload or remove. Administrator does not
receive Attachment metadata or bytes; all Attachment calls from that role are
`403`. A foreign
Requester-owned Ticket/Attachment is answered with the same safe `404` as a
missing resource. If an
Administrator receives a Ticket representation that embeds Attachment metadata,
the role-aware serializer omits the Attachment collection entirely.

### Attachment contract

`POST /tickets/:ticketId/attachments` is `multipart/form-data` with exactly one
`file` field. JPEG/JPG, PNG, WEBP and PDF are allowed; each file is at most 5
MiB and a Ticket has at most five active files. Extension, MIME and file
signature are checked server-side. The display basename is normalized and made
safe; the opaque storage key is never returned. `201` returns an attachment
metadata object. `GET /tickets/:ticketId/attachments` and the item endpoint
return `{data:[metadata]}` / `{data:metadata}`, including removed and
unavailable records.

```json
{
  "id": 501,
  "ticketId": 101,
  "originalFilename": "battery-photo.png",
  "mimeType": "image/png",
  "sizeBytes": 245760,
  "uploadedAt": "2026-09-17T05:05:00.000Z",
  "state": "active",
  "removedAt": null,
  "unavailableAt": null,
  "unavailableReason": null,
  "removalReason": null,
  "previewable": true,
  "downloadUrl": "/api/tickets/101/attachments/501/download"
}
```

`state` is `active`, `removed` or `unavailable`. Removed/unavailable metadata
has `downloadUrl:null` and `previewable:false`; an unavailable record includes
the safe `unavailableAt`/`unavailableReason` values. The download route accepts an
optional `disposition=attachment|inline` (default `attachment`) and returns
`200` bytes with the stored MIME and safe Content-Disposition for a Requester
owner or IT Staff. Removed or unavailable bytes return `410
ATTACHMENT_NOT_AVAILABLE`. `DELETE` accepts
`{"reason":"..."}` (trimmed 3–200 characters), soft-removes the row and
returns `200` metadata; repeated removal is `409`. Size/type/limit failures are
`413`/`415`/`409`; a failed upload never rolls back the Ticket.

## 5. Requester resolution indication

`POST /tickets/:ticketId/problem-appears-resolved` accepts exactly
`{ "confirm": true }` (missing/false/non-boolean is `400 VALIDATION_ERROR`)
and is available only to the authenticated Requester
who owns the Ticket. The server permits it when the current status is
`IN_PROGRESS` or `WAITING_FOR_REQUESTER`; it verifies ownership before reading
or writing any Ticket data. The transaction records
`requesterResolutionIndicatedAt` and
`requesterResolutionIndicatedByUserId`, returns `200 {"data":<ticket>}`, and
leaves `currentStatus` unchanged. It never sets `RESOLVED` or `CLOSED` and it
does not create a forged Public Comment. A second indication returns `409
RESOLUTION_INDICATION_ALREADY_RECORDED`; a status outside the permitted set is
`409 RESOLUTION_INDICATION_NOT_ALLOWED`. A missing/foreign Ticket returns the
same safe `404` ownership behavior as Ticket Detail (role-forbidden callers
still receive `403`). Only IT Staff may
later clear the indication when work resumes or perform the explicitly
confirmed formal `RESOLVED`/`CLOSED` transition.

## 6. Ticket communication

### Public Comments

`GET /tickets/:ticketId/comments` returns chronological `data`:

```json
{ "data": [{ "id": 12, "ticketId": 101, "content": "Please restart the laptop.", "author": { "id": 7, "displayName": "Narin Example", "role": "IT_STAFF" }, "createdAt": "2026-09-17T05:00:00.000Z" }] }
```

`POST /tickets/:ticketId/comments` accepts `{ "content": "..." }` and returns
the created item (`201`). Content is required after trim, 1–2,000 characters.
The server stores plain text and clients render it as text, never HTML. The
requester must own the Ticket; IT Staff may post to any Ticket;
Administrator is read-only. A foreign requester-owned Ticket uses the same
safe `404` as a missing Ticket; role-forbidden calls are `403`. Comments cannot
be edited/deleted.

### Internal Notes

`GET /tickets/:ticketId/internal-notes` and `POST` at the same path use the
same collection/item shape and validation as Comments. IT Staff and
Administrators may read; only IT Staff may post. Note content is stored and
rendered as plain text. Responses are never embedded
in Requester Ticket responses, and forbidden callers receive no Note content.
A foreign requester-owned Ticket uses the same safe `404` as a missing Ticket;
role-forbidden callers receive `403` without Note content.

## 7. IT Staff queue and Ticket operations

`GET /staff/users` returns `{ "data": [{ "id": 8, "displayName": "Somchai Staff", "role": "IT_STAFF" }] }`
for active `IT_STAFF` and `ADMINISTRATOR` accounts, ordered case-insensitively
by display name then `id`. It returns no email, password or inactive account
and is used to populate the Ticket Owner select. A failed lookup uses the
standard safe error envelope.

`GET /staff/tickets` accepts `search` (max 100), `categoryId`,
`relatedSystemId`, `requestedPriority`, `itPriority`, `currentStatus`,
`assignment=all|assigned|unassigned|mine`, `sortBy=ticketNumber|ticketDate|updatedAt|requestedPriority|itPriority|currentStatus|ticketOwner|assignee|category`,
`sortOrder=asc|desc`, `page` and `pageSize=10|20|50`. Defaults are
`updatedAt desc`, assignment `all`, page 1, 10. Unknown/invalid parameters are `400`; filters
combine with AND; `mine` means `assignedToUserId` equals the authenticated IT
Staff User, while `assigned` includes every non-null owner. `ticketOwner` is
the canonical owner sort key and `assignee` is its compatibility alias. Equal
values use `id desc` as secondary order. Priority
sort order is `LOW < MEDIUM < HIGH < URGENT`; status sort follows
the workflow order in BR-05; category/ticketOwner sorts are case-insensitive.
Trimmed case-insensitive `search` matches Ticket Number, Summary, Description,
Category, Related System, Requester name/email and Ticket Owner name/email.

The only supported status values are `NEW`, `OPEN`, `IN_PROGRESS`,
`WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED` and
`CANCELLED`. The server applies the transition matrix in BR-05; it does not
silently coerce a display label or an unknown value.

The response is `{data,meta}` with the Lab 2 pagination metadata. A row adds
`requester {id,displayName,email}`, `ticketOwner {id,displayName,role}` (or
`null`), the response-only `assignedTo` alias (the same owner summary),
`itPriority`, `currentStatus`, `requesterResolutionIndicatedAt` and
`updatedAt`. `GET /staff/tickets/:ticketId` returns the
full staff representation, including public comments, internal notes,
owner/assignee summaries and safe Attachment metadata, but never
password/session/storage secrets.

`PATCH /staff/tickets/:ticketId` accepts one or more of:

```json
{ "action": "assign", "assignedToUserId": 8, "itPriority": "HIGH", "currentStatus": "IN_PROGRESS" }
```

`action` is optional when changing only priority/status. `assignedToUserId`
must be a positive integer for `assign`/`reassign`; `itPriority` and
`currentStatus` accept only the enums documented above; and
`confirmStatusChange` is an optional boolean that is required as `true` for a
`RESOLVED` or `CLOSED` target. Unknown fields are rejected before any write.
At least one permitted change is required; an empty body is a safe `400 VALIDATION_ERROR`.
`action` is `claim`, `assign`, or `reassign`; the Problem Appears Resolved
operation is the separate Requester endpoint in §5. Claim has no assignee field
and only succeeds for an unassigned Ticket. Assign/reassign requires an active
`IT_STAFF` or `ADMINISTRATOR` User and is IT Staff-only. IT Priority initially
equals Requested Priority; only IT Staff or Administrator may change it. Status
changes, including formal `RESOLVED` and `CLOSED`, are IT Staff-only and follow
BR-05/BR-06 in [specification.md](specification.md). A target of `RESOLVED` or
`CLOSED` also requires `confirmStatusChange:true` in the same atomic request.
When status moves back to `IN_PROGRESS` or `REOPENED`, the staff operation
clears any requester resolution indication. An unrecognized field, invalid
enum, attempted unchanged/conflicting claim, inactive/invalid-role owner or
invalid transition returns safe `400`/`409` without partial persistence. An
Administrator may send only `itPriority`; any action, assignee or status field
from that role returns `403`.
On a successful operational update the endpoint returns `200 {"data":<staffTicket>}`
using the same representation as staff detail; the
response never includes a password, session value or storage key.

## 8. Administrator User Management

`GET /users?search=&role=` returns an unpaginated `{ "data": [...] }` list
of active and inactive users ordered case-insensitively by display name then
`id`; trimmed `search` matches name/email and is limited to 100 characters,
and `role` is one enum. When both are provided, the filters combine with AND;
an empty/no-results response is still `200` with `data:[]`.
Each item is the user shape plus `createdAt` and `updatedAt`, never a hash.

`POST /users` accepts `{displayName,email,role,isActive,initialPassword}`.
`displayName` is required after trim and is 2–120 characters; `email` is
normalized as in BR-01; `role` is exactly one of `REQUESTER|IT_STAFF|
ADMINISTRATOR`; `isActive` is boolean; and `initialPassword` is 12–128
characters. The client may ask for a password confirmation, but it is checked
client-side and never sent as a second password field. On success, the server
stores only an Argon2id hash, sets `mustChangePassword=true`, and never echoes
the password; an inactive User remains unable to log in until activated.
`PATCH /users/:userId` accepts only `displayName`, `email`, `role`, and
`isActive`. `POST /users/:userId/reset-password` accepts
`{initialPassword}` and atomically hashes it, marks `mustChangePassword=true`
and revokes that User's sessions. Setting `isActive:false` also revokes all of
that User's sessions in the same transaction; a role change takes effect on the
next request through the current-user role check. Create/reset password
validation is 12–128 characters and is never echoed. Duplicate normalized email
returns `409 EMAIL_ALREADY_EXISTS`; an invalid role/field is `400`;
self-deactivation or deactivation/role-change that would leave no active
Administrator is `409 ADMINISTRATOR_SAFETY_CONFLICT`. A User with assigned Tickets must be
reassigned before deactivation or changing to a non-owner role and returns
`409 TICKET_OWNER_SAFETY_CONFLICT`. There is no `DELETE /users`.

`POST /users` returns `201 {"data":<userShape>}`; edit and reset return
`200 {"data":<userShape>}`. These responses include the new `mustChangePassword`
state but never include `initialPassword`, a password hash, or a session value.

## 9. Status and safe-error matrix

| Status | Safe code examples |
|---:|---|
| 200/201/204 | successful read/create/update/logout |
| 400 | `VALIDATION_ERROR`, `INVALID_QUERY_PARAMETER`, `INVALID_REFERENCE`, `STATUS_CONFIRMATION_REQUIRED` |
| 401 | `AUTHENTICATION_REQUIRED`, `INVALID_CREDENTIALS`, `INVALID_CURRENT_PASSWORD` |
| 429 | `AUTHENTICATION_RATE_LIMITED` |
| 403 | `FORBIDDEN`, `PASSWORD_CHANGE_REQUIRED`, `CSRF_ORIGIN_INVALID` |
| 404 | `TICKET_NOT_FOUND`, `ATTACHMENT_NOT_FOUND`, `USER_NOT_FOUND` |
| 409 | `EMAIL_ALREADY_EXISTS`, `INVALID_STATUS_TRANSITION`, `TICKET_ALREADY_CLAIMED`, `IDEMPOTENCY_KEY_REUSED`, `TICKET_NUMBER_EXHAUSTED`, `ATTACHMENT_LIMIT_REACHED`, `ATTACHMENT_ALREADY_REMOVED`, `RESOLUTION_INDICATION_ALREADY_RECORDED`, `RESOLUTION_INDICATION_NOT_ALLOWED`, `ADMINISTRATOR_SAFETY_CONFLICT`, `TICKET_OWNER_SAFETY_CONFLICT` |
| 410 | `ENDPOINT_RETIRED` for the former requester selector; `ATTACHMENT_NOT_AVAILABLE` for removed/unavailable bytes |
| 413/415/503 | `ATTACHMENT_TOO_LARGE`, `ATTACHMENT_TYPE_NOT_ALLOWED`, `STORAGE_UNAVAILABLE` |
| 500 | `INTERNAL_ERROR` with a generic message only |
