# Lab 2 REST API Specification

**Version:** 1.0  
**Status:** Pre-implementation contract  
**Base path:** `/api`  
**Date:** 2026-09-02

This is the normative API contract for the Lab 2 Requester increment. All
requester-scoped endpoints require an explicit `requesterId` because Lab 2 has
no real authentication. The value identifies the temporary Development
Requester testing context; it is not a token, session, or authorization claim.

## 1. Conventions

- JSON uses camelCase and ISO 8601 UTC timestamps.
- IDs are positive integers.
- `Content-Type: application/json` is required for JSON requests.
- Successful Ticket and Attachment responses use `{ "data": ... }` and may
  include `meta`. Reference-list endpoints return arrays to preserve the Lab 1
  `GET /api/categories` contract.
- Error responses use the same safe shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "fields": {
      "summary": "Summary must be 5 to 120 characters."
    }
  }
}
```

`fields` is optional. The server MUST NOT include stack traces, SQL, local file
paths, storage keys, credentials, or other internal details. A production
request/correlation ID may be logged and returned as a separate safe field.

## 2. Endpoint list

| ID | Method and path | Purpose | Success | Error statuses |
|---|---|---|---:|---|
| API-REF-01 | `GET /api/development-requesters?active=true` | Load selector options | 200 | 400, 500 |
| API-REF-02 | `GET /api/categories?active=true` | Load active Categories | 200 | 400, 500 |
| API-REF-03 | `GET /api/related-systems?active=true` | Load active Related Systems | 200 | 400, 500 |
| API-TKT-01 | `POST /api/tickets` | Create a validated Ticket | 201; replay 200 | 400, 403, 409, 500 |
| API-TKT-02 | `GET /api/tickets` | Owned search/filter/sort/page | 200 | 400, 403, 500 |
| API-TKT-03 | `GET /api/tickets/:ticketId` | Retrieve one owned Ticket | 200 | 400, 403, 404, 500 |
| API-ATT-01 | `POST /api/tickets/:ticketId/attachments` | Upload one Attachment | 201 | 400, 403, 404, 409, 413, 415, 500, 503 |
| API-ATT-02 | `GET /api/tickets/:ticketId/attachments` | Retrieve owner-visible metadata | 200 | 400, 403, 404, 500 |
| API-ATT-03 | `GET /api/tickets/:ticketId/attachments/:attachmentId` | Retrieve one Attachment metadata record | 200 | 400, 403, 404, 500 |
| API-ATT-04 | `GET /api/tickets/:ticketId/attachments/:attachmentId/download` | Download active bytes | 200 binary | 400, 403, 404, 410, 500, 503 |
| API-ATT-05 | `DELETE /api/tickets/:ticketId/attachments/:attachmentId` | Soft-remove with reason | 200 | 400, 403, 404, 409, 500 |

`GET /api/health` remains the Lab 1 health endpoint and is not a Lab 2
Requester workflow endpoint.

## 3. Shared requester and reference contracts

### 3.1 Development Requesters

`GET /api/development-requesters?active=true`

- `active` is optional and defaults to `true`. Lab 2 supports only `true`; a
  value other than `true` is `400 INVALID_QUERY_PARAMETER`.
- Only `id`, `displayName`, and `email` are returned. Internal timestamps and
  inactive rows are not returned.
- No active rows is a successful empty array, not an error.

```json
[
  {
    "id": 1,
    "displayName": "Arun Chaiyasit",
    "email": "arun.chaiyasit@example.test"
  }
]
```

### 3.2 Categories and Related Systems

`GET /api/categories?active=true` and
`GET /api/related-systems?active=true` have the same contract:

```json
[
  { "id": 1, "name": "Account and Access" },
  { "id": 2, "name": "Hardware" }
]
```

Rows are active only and sorted by `id asc`. An empty reference list returns
`200 []`. The required Category names are Account and Access, Hardware,
Software, and Network. The seed contains at least six Related Systems.

The `active` query parameter is optional and defaults to `true` for both
reference-list endpoints. Lab 2 supports only `active=true`; an omitted value
has the same behavior as `active=true`, while any other value returns
`400 INVALID_QUERY_PARAMETER`.

## 4. Ticket representation

The full Ticket representation used by create/detail is:

```json
{
  "id": 101,
  "ticketNumber": "TT-2026-000101",
  "ticketDate": "2026-09-02T04:00:00.000Z",
  "requester": {
    "id": 1,
    "displayName": "Arun Chaiyasit",
    "email": "arun.chaiyasit@example.test"
  },
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
  "summary": "Laptop battery drains quickly",
  "requestedPriority": "MEDIUM",
  "itPriority": null,
  "description": "The laptop battery drops below 20 percent after a short meeting.",
  "currentStatus": "NEW",
  "attachments": [],
  "createdAt": "2026-09-02T04:00:00.000Z",
  "updatedAt": "2026-09-02T04:00:00.000Z"
}
```

`itPriority` is always `null` for a newly created Lab 2 Ticket and is neither
accepted in create input nor editable in the Requester UI. It is included only
as a future-compatible read-only field.

## 5. Create Ticket

### Request

`POST /api/tickets`

Headers:

```text
Content-Type: application/json
Idempotency-Key: 4f8c2a11-2f37-4fe0-a5a0-0b2b5ce9e101
```

The key is required, 16–64 ASCII characters, and should be a UUID. The request
body is:

```json
{
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 7,
  "summary": "Laptop battery drains quickly",
  "requestedPriority": "MEDIUM",
  "description": "The laptop battery drops below 20 percent after a short meeting."
}
```

The client MUST NOT send `id`, `ticketNumber`, `ticketDate`, `currentStatus`,
`itPriority`, `createdAt`, `updatedAt`, `storageKey`, or Attachment fields.

### Validation

| Field / rule | Contract |
|---|---|
| `requesterId` | Required positive integer identifying an active Development Requester. |
| `categoryId` | Required positive integer identifying an active Category. |
| `relatedSystemId` | Required positive integer identifying an active Related System. |
| `summary` | Required after trim; trimmed value is stored; length 5–120 characters. |
| `requestedPriority` | Optional; defaults to `MEDIUM`; allowed values `LOW`, `MEDIUM`, `HIGH`, `URGENT`. |
| `description` | Required after trim; trimmed value is stored; length 20–2,000 characters. |
| JSON / header | Malformed JSON, missing key, or invalid key is rejected. |

All validation runs before the transaction. Invalid input returns `400` with
`VALIDATION_ERROR` and optional field messages. An inactive/missing Requester or
inactive/missing reference returns `400` with `REQUESTER_CONTEXT_INVALID` or
`INVALID_REFERENCE`; no Ticket is created. `REFERENCE_NOT_FOUND` is reserved
for a future single-reference retrieval endpoint; the current create and
reference-list contracts use `INVALID_REFERENCE` for inactive or missing
references.

### Success

First use returns `201 Created`:

```json
{
  "data": {
    "id": 101,
    "ticketNumber": "TT-2026-000101",
    "ticketDate": "2026-09-02T04:00:00.000Z",
    "requester": { "id": 1, "displayName": "Arun Chaiyasit", "email": "arun.chaiyasit@example.test" },
    "category": { "id": 2, "name": "Hardware" },
    "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
    "summary": "Laptop battery drains quickly",
    "requestedPriority": "MEDIUM",
    "itPriority": null,
    "description": "The laptop battery drops below 20 percent after a short meeting.",
    "currentStatus": "NEW",
    "attachments": [],
    "createdAt": "2026-09-02T04:00:00.000Z",
    "updatedAt": "2026-09-02T04:00:00.000Z"
  },
  "meta": { "idempotentReplay": false }
}
```

The Ticket Number and Ticket Date are generated in the backend transaction. The
server stores exactly one Ticket with the selected `requesterId` relationship.

If the same key is replayed with an equivalent normalized payload, the server
returns `200 OK`, the same Ticket representation, and
`{ "idempotentReplay": true }`. The same key with a different payload returns
`409 IDEMPOTENCY_KEY_REUSED`.

## 6. Ticket list and query-parameter contract

### Request

`GET /api/tickets` requires `requesterId`:

```text
GET /api/tickets?requesterId=1&search=laptop&categoryId=2&requestedPriority=MEDIUM&currentStatus=NEW&sortBy=updatedAt&sortOrder=desc&page=1&pageSize=10
```

The server applies ownership filtering before all other search, filter, sort,
and pagination operations. This prevents another Requester's Ticket from
appearing even when a query is manipulated.

| Parameter | Required | Allowed values / behavior |
|---|---:|---|
| `requesterId` | Yes | Positive integer; active context. |
| `search` | No | Trimmed, case-insensitive match in `ticketNumber`, `summary`, `description`, `category.name`, or `relatedSystem.name`; max 100 characters. Empty after trim means no search. |
| `categoryId` | No | Positive integer exact filter. |
| `relatedSystemId` | No | Positive integer exact filter. |
| `requestedPriority` | No | One enum value: `LOW`, `MEDIUM`, `HIGH`, `URGENT`. |
| `currentStatus` | No | `NEW` in Lab 2. |
| `sortBy` | No | `ticketNumber`, `ticketDate`, `updatedAt`, `requestedPriority`, `currentStatus`, or `category`; default `updatedAt`. |
| `sortOrder` | No | `asc` or `desc`; default `desc`. |
| `page` | No | Positive 1-based integer; default `1`. |
| `pageSize` | No | `10`, `20`, or `50`; default `10`. |

Unknown parameters, malformed integers, unsupported enum values, invalid sort
fields, invalid directions, page < 1, or unsupported page sizes return
`400 INVALID_QUERY_PARAMETER`. Values are not silently clamped.

The secondary sort is always `id desc`, making equal primary values stable.
Search and filters are combined with AND. Multiple filters are exact matches.
When `sortBy=requestedPriority`, the order is `LOW < MEDIUM < HIGH < URGENT`;
category sorting is case-insensitive by category name; date fields sort
chronologically; and `currentStatus` has only `NEW` in Lab 2.

### Response

`200 OK` returns list items with enough information to identify and open a
Ticket:

```json
{
  "data": [
    {
      "id": 101,
      "ticketNumber": "TT-2026-000101",
      "ticketDate": "2026-09-02T04:00:00.000Z",
      "summary": "Laptop battery drains quickly",
      "category": { "id": 2, "name": "Hardware" },
      "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
      "requestedPriority": "MEDIUM",
      "itPriority": null,
      "currentStatus": "NEW",
      "attachmentCount": 1,
      "updatedAt": "2026-09-02T04:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

When `totalItems = 0`, `data` is `[]` and `totalPages = 0`; the response is
still `200`. The UI uses the presence of filters/search to distinguish a
first-use empty list from a no-results query.

## 7. Owned Ticket Detail

### Request and ownership

`GET /api/tickets/:ticketId?requesterId=1`

The server validates the integer path parameter, confirms the Ticket exists,
and checks ownership before returning the detail. A valid Ticket owned by a
different Requester returns `403 OWNERSHIP_FORBIDDEN` with no Ticket body. A
missing Ticket returns `404 TICKET_NOT_FOUND`.

### Response

`200 OK` returns the full Ticket representation from Section 4, including
owner-visible Attachment metadata. All Ticket fields are read-only in Lab 2.
The response never includes private `storageKey` values.

## 8. Attachment contracts

### 8.1 Common metadata shape

```json
{
  "id": 501,
  "ticketId": 101,
  "originalFilename": "battery-photo.png",
  "mimeType": "image/png",
  "sizeBytes": 245760,
  "uploadedAt": "2026-09-02T04:05:00.000Z",
  "state": "active",
  "removedAt": null,
  "unavailableAt": null,
  "unavailableReason": null,
  "removalReason": null,
  "previewable": true,
  "downloadUrl": "/api/tickets/101/attachments/501/download?requesterId=1"
}
```

`state` is `active`, `removed`, or `unavailable`, derived from the persisted
metadata in that order: `removed` when `removedAt` is present, `unavailable`
when `availabilityState = UNAVAILABLE`, otherwise `active`. For `removed` and
`unavailable`, `downloadUrl` is `null` and `previewable` is `false`.
`unavailableAt` and `unavailableReason` are nullable safe diagnostics for an
existing metadata row. The original filename is safe display metadata; the
server-generated storage key is never returned.

### 8.2 Upload

`POST /api/tickets/:ticketId/attachments?requesterId=1`

Request is `multipart/form-data` with exactly one field named `file`.

- The Ticket must exist and belong to `requesterId`.
- Allowed types: `image/jpeg`, `image/png`, `image/webp`, and `application/pdf`;
  JPG/JPEG, PNG, WEBP, and PDF extensions are accepted case-insensitively.
- Maximum size is exactly 5 MiB per file.
- At most five active Attachments may exist for a Ticket.
- The server MUST validate the actual file signature: JPEG begins `FF D8 FF`,
  PNG begins `89 50 4E 47 0D 0A 1A 0A`, WEBP begins `RIFF` and has `WEBP` at
  byte offset 8, and PDF begins `%PDF-`. Client-provided MIME and filename
  are not trusted for storage.
- The display filename uses only the basename, Unicode NFC normalization,
  trimmed safe characters (letters, numbers, spaces, `.`, `_`, `-`), with path
  separators/control characters replaced by `_`, a 120-character cap, and
  `attachment` as the empty-name fallback. The storage key remains opaque.

Success returns `201 Created`:

```json
{ "data": { "id": 501, "ticketId": 101, "originalFilename": "battery-photo.png", "mimeType": "image/png", "sizeBytes": 245760, "uploadedAt": "2026-09-02T04:05:00.000Z", "state": "active", "removedAt": null, "unavailableAt": null, "unavailableReason": null, "removalReason": null, "previewable": true, "downloadUrl": "/api/tickets/101/attachments/501/download?requesterId=1" } }
```

The server generates an opaque storage key and persists metadata only after the
bytes are safely stored. If metadata persistence fails, it attempts to delete
the just-written object and returns a safe `500` or `503`. If cleanup also
fails, the object remains inaccessible and no incomplete Attachment row is
exposed. If an existing metadata row loses access to its bytes, the server
records `availabilityState = UNAVAILABLE`, `unavailableAt`, and a safe reason.
A failed upload does not roll back the Ticket.

### 8.3 Metadata collection and item

`GET /api/tickets/:ticketId/attachments?requesterId=1` returns:

```json
{ "data": [ { "id": 501, "ticketId": 101, "originalFilename": "battery-photo.png", "mimeType": "image/png", "sizeBytes": 245760, "uploadedAt": "2026-09-02T04:05:00.000Z", "state": "active", "removedAt": null, "unavailableAt": null, "unavailableReason": null, "removalReason": null, "previewable": true, "downloadUrl": "/api/tickets/101/attachments/501/download?requesterId=1" } ] }
```

`GET /api/tickets/:ticketId/attachments/:attachmentId?requesterId=1` returns
the same single metadata object inside `{ "data": ... }`. Both endpoints
include removed metadata for the owner and apply the Ticket ownership check
first.

### 8.4 Download / preview

`GET /api/tickets/:ticketId/attachments/:attachmentId/download?requesterId=1`

- Active, owned file: `200`, original stored MIME type, safe
  `Content-Disposition: attachment` filename, and file bytes. The UI may add
  `disposition=inline` to this same authorized endpoint when opening a preview;
  in that case the response uses `Content-Disposition: inline` so supported
  image/PDF files open in a new browser tab without forcing a download.
- Missing Ticket/Attachment: `404`.
- Non-owner: `403` with no bytes.
- Removed or unavailable file: `410 ATTACHMENT_NOT_AVAILABLE` with no bytes.
- Storage dependency failure: `503 STORAGE_UNAVAILABLE` with no internal detail.

The UI may use the authorized response for image/PDF preview, but it must never
offer a preview or download for a non-active state.

### 8.5 Soft removal

`DELETE /api/tickets/:ticketId/attachments/:attachmentId?requesterId=1`

Request body:

```json
{ "reason": "Uploaded the wrong screenshot" }
```

`reason` is required after trim and must be 3–200 characters. Success returns
`200` with the metadata object in `data`, now with `state = "removed"`,
`removedAt`, and `removalReason`.

The database row is retained. The server removes or schedules removal of the
stored bytes; even if storage cleanup is delayed, all subsequent download and
preview attempts are blocked. A second removal returns `409
ATTACHMENT_ALREADY_REMOVED`.

## 9. Status code and error matrix

| Status | Meaning in this contract | Example error code |
|---:|---|---|
| 200 | Successful retrieval, soft removal, or idempotent create replay | `OK` / `IDEMPOTENT_REPLAY` |
| 201 | Ticket or Attachment created | `CREATED` |
| 400 | Malformed input, missing required value, invalid enum/ID/query/header, or inactive/missing create reference | `VALIDATION_ERROR`, `INVALID_QUERY_PARAMETER`, `REQUESTER_CONTEXT_INVALID`, `INVALID_REFERENCE` |
| 403 | Existing resource is owned by another Requester | `OWNERSHIP_FORBIDDEN` |
| 404 | Ticket or Attachment does not exist | `TICKET_NOT_FOUND`, `ATTACHMENT_NOT_FOUND` |
| 409 | Idempotency conflict, Ticket Number exhaustion, active Attachment limit, or repeated removal | `IDEMPOTENCY_KEY_REUSED`, `TICKET_NUMBER_EXHAUSTED`, `ATTACHMENT_LIMIT_REACHED`, `ATTACHMENT_ALREADY_REMOVED` |
| 410 | Removed/unavailable Attachment cannot be downloaded | `ATTACHMENT_NOT_AVAILABLE` |
| 413 | File exceeds 5 MiB | `ATTACHMENT_TOO_LARGE` |
| 415 | File type is not permitted | `ATTACHMENT_TYPE_NOT_ALLOWED` |
| 500 | Unexpected application/database failure with safe message | `INTERNAL_ERROR` |
| 503 | Storage dependency unavailable after safe cleanup handling | `STORAGE_UNAVAILABLE` |

## 10. Traceability

| API area | Acceptance criteria | Planned tests |
|---|---|---|
| Requester/reference lists | AC-01, AC-03, AC-04, AC-26 | API-01, API-02, UI-01, UI-03 |
| Ticket creation/defaults | AC-05 through AC-10 | UNIT-01, UNIT-02, UNIT-06, API-03 through API-07, UI-04 through UI-10 |
| Ticket list | AC-11 through AC-14 | UNIT-03, API-08 through API-11, UI-11, E2E-03 |
| Ticket detail/ownership | AC-15, AC-22 | UNIT-05, API-12, API-13, API-20, UI-13, UI-15 |
| Attachment lifecycle | AC-10, AC-16 through AC-22 | UNIT-04, API-14 through API-20, UI-10, UI-14, UI-15, E2E-04 |
