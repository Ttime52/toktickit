# Lab 2 Sprint Engineering Specification

**Product:** TokTickIT Requester Ticketing MVP
**Version:** 1.0
**Status:** Pre-implementation engineering contract for Issue 2
**Reviewed on:** 2026-09-02

This document is the source of truth for the Lab 2 increment. `MUST` denotes
observable behavior required for acceptance; `SHOULD` denotes a design choice
that may be changed only after the contract is updated. The detailed API and UI
contracts are in [api-spec.md](api-spec.md) and [ui-spec.md](ui-spec.md).

## 1. Sprint Goal

Deliver a professional, responsive Requester experience in which a selected
Development Requester can create an IT support ticket, receive a backend-
generated Ticket Number, find only their own tickets, inspect a read-only Ticket
Detail screen, and manage permitted attachments using a consistent Zen Green UI.

## 2. Stakeholder Request Interpretation

The IT department needs a Requester-facing ticketing flow for describing a
problem, choosing its category and related system, selecting a requested
priority, submitting evidence, and later locating and inspecting the request.
Lab 2 uses a seeded Development Requester selector to make ownership behavior
testable before real authentication exists. The selected `requesterId` is a
temporary test context, not a login, credential, session, token, or security
boundary. The backend still enforces that every requester-scoped operation is
limited to the selected Requester's own records.

## 3. Scope

### Included

- Development Requester Selection screen backed by active PostgreSQL seed data.
- Selected Requester context, shell identity display, and Change Requester flow.
- Active Category and Related System reference data.
- Create Ticket form and validated `POST /api/tickets` workflow.
- Backend-generated Ticket Number, Ticket Date, initial status, and safe errors.
- Duplicate-submission prevention using a disabled busy state and an
  `Idempotency-Key`.
- Requester-owned My Tickets search, filters, sorting, and pagination.
- Requester-owned read-only Ticket Detail screen.
- Attachment upload, metadata, active download/preview, and soft removal with a
  removal reason.
- Ownership checks for Ticket and Attachment operations.
- Loading, validation, submitting, success, empty, no-results, and failure UI
  states; responsive and accessible Zen Green presentation.
- Prisma migration, relationships, indexes, and repeatable seed data needed by
  the increment.
- Planned unit, API/integration, UI, responsive, visual, and E2E evidence.

### Excluded

- Real authentication or security features: login credentials, passwords,
  password hashing, sessions, tokens, authenticated identities, or real role
  based authorization.
- IT Staff dashboard, queue, claiming, reassignment, IT Priority changes, or
  other staff controls.
- Public Comments, Internal Notes, Actions Taken, or collaboration/work
  tracking.
- Ticket status transitions after the initial `NEW` status, including resolve,
  close, reopen, cancel, and resolution confirmation.
- Administration of users, Requesters, roles, Categories, or Related Systems.
- Hard deletion of Tickets or Attachments.

## 4. Functional Requirements

| ID | Functional requirement | Acceptance / planned-test trace |
|---|---|---|
| FR-01 | The app MUST load active Development Requesters from `GET /api/development-requesters?active=true` and provide a keyboard-accessible selector, Continue action, loading state, empty state, and safe failure state. | AC-01, AC-04; API-01, API-02, UI-01 |
| FR-02 | The app MUST persist the selected active Requester ID in `localStorage` under `toktickit.lab2.requesterId`, show the Requester in the application shell, and provide Change Requester. | AC-02, AC-11, AC-22; UI-02, E2E-01, E2E-02 |
| FR-03 | Create Ticket MUST load active Categories and Related Systems from PostgreSQL and MUST display the selected Requester as read-only context. | AC-02, AC-03, AC-08, AC-26; API-01, UI-03 |
| FR-04 | Create Ticket MUST provide Ticket Number, Ticket Date, Requester, Category, Related System, Summary, Requested Priority, Description, Attachments, and clear primary/secondary actions. System-generated values are read-only placeholders until the server responds. | AC-05, AC-06, AC-07, AC-23; UI-04, UI-05, VIS-02 |
| FR-05 | `POST /api/tickets` MUST validate the complete request on the server, persist the Ticket and relationships, generate official values, and return the created representation. | AC-05, AC-06, AC-07, AC-08; UNIT-01, API-03, API-05, API-06 |
| FR-06 | A create submission MUST use a valid `Idempotency-Key`; the client MUST disable Submit while busy and the server MUST prevent a retry with the same key from creating a second Ticket. | AC-09; UNIT-06, API-04, UI-07 |
| FR-07 | Attachments MUST be uploaded only through the Attachment endpoint after a Ticket exists. The UI and API MUST enforce type, size, count, ownership, safe storage, and per-file failure behavior. | AC-10, AC-16, AC-17, AC-18; UNIT-04, API-14, API-15, UI-10 |
| FR-08 | My Tickets MUST retrieve only Tickets owned by the selected Requester and MUST support the query contract for search, filters, sorting, pagination, Clear Filters, and Create Ticket. | AC-11, AC-12, AC-13, AC-14; UNIT-03, API-08, API-09, API-10, API-11, UI-11 |
| FR-09 | Ticket Detail MUST retrieve one owned Ticket, show Ticket information read-only, and omit comments, notes, Actions Taken, and status-change controls. | AC-15, AC-22; API-12, API-13, UI-13, UI-15 |
| FR-10 | An owner MUST be able to retrieve Attachment metadata and download/preview an active Attachment. Metadata MUST expose enough state for the UI without exposing a private storage key. | AC-16, AC-18, AC-19, AC-22; API-14, API-16, API-17, UI-14 |
| FR-11 | An owner MUST be able to soft-remove an active Attachment with a valid reason. Removed metadata remains visible, while download and preview are blocked. | AC-18, AC-20, AC-21, AC-22; API-18, API-19, API-20, UI-14 |
| FR-12 | All screens MUST provide field-level validation, loading, empty/no-results, success, and safe failure feedback. Create form values MUST survive an API failure; internal exception details MUST not be shown. | AC-04, AC-07, AC-10, AC-14, AC-23; UNIT-07, API-02, API-07, UI-09, UI-12, UI-14, UI-16 |
| FR-13 | The UI MUST follow [ui-spec.md](ui-spec.md), remain keyboard accessible, and work at desktop (>=992 px), tablet (768–991 px), and mobile (<768 px) widths without clipping or horizontal page scrolling. | AC-23, AC-24, AC-25; UI-16, RESP-01 through RESP-04, VIS-01 through VIS-04 |
| FR-14 | The database migration and idempotent seed MUST provide the required models, relationships, indexes, four Categories, at least six Related Systems, at least four active Requesters, and at least one inactive Requester. | AC-26; DB-01, API-01 |

## 5. Business Rules

| ID | Business rule | Acceptance / planned-test trace |
|---|---|---|
| BR-01 | The official Ticket Number MUST be generated by the backend from one transaction-safe counter row per UTC year. Allocation starts at `000001`, uses `TT-YYYY-NNNNNN` (UTC year and six-digit sequence), and returns `409 TICKET_NUMBER_EXHAUSTED` after `999999`. Clients MUST NOT supply or overwrite it. | AC-06; UNIT-01, API-03, DB-01 |
| BR-02 | `ticketDate` MUST be generated by the server in UTC at creation time and MUST be read-only thereafter. | AC-06; API-03, UI-08 |
| BR-03 | Every new Ticket MUST start with `currentStatus = NEW`; Lab 2 provides no status transition or requester status-edit control. | AC-06, AC-15; API-03, UI-08, UI-13 |
| BR-04 | `requestedPriority` MUST be one of `LOW`, `MEDIUM`, `HIGH`, or `URGENT`; omitted priority defaults to `MEDIUM`. `itPriority` is nullable, read-only, and reserved for a later IT Staff workflow. | AC-06, AC-08, AC-25; UNIT-02, API-06, VIS-02 |
| BR-05 | `requesterId` MUST identify an active seeded Development Requester for creation and requester-scoped reads. The selector is a test context and is not authentication. | AC-01, AC-02, AC-08, AC-26; API-01, API-06, UI-01 |
| BR-06 | The selected Requester ID MUST be stored locally. Change Requester MUST validate the new selection, clear in-memory requester-scoped results, reload data, and preserve database records. A dirty Create form requires confirmation before switching. | AC-02; UI-02, E2E-01 |
| BR-07 | A Ticket belongs to exactly one Requester. Every list, detail, metadata, upload, download, and removal request MUST verify `ticket.requesterId === requesterId`; a mismatch returns `403` without Ticket data. | AC-11, AC-15, AC-22; UNIT-05, API-08, API-13, API-20, E2E-02 |
| BR-08 | Inactive Requesters MUST not appear in the selector and MUST not be accepted as a new testing context. If a stored Requester becomes inactive, the app returns to selection safely. | AC-01, AC-02, AC-08; API-01, API-06, UI-02 |
| BR-09 | Category and Related System IDs MUST exist and be active at creation. Reference values are revalidated by the backend even if the UI loaded them earlier. | AC-03, AC-08; API-01, API-06 |
| BR-10 | Summary is required after `trim()`, stores the trimmed value, and MUST be 5–120 characters. Description is required after `trim()`, stores the trimmed value, and MUST be 20–2,000 characters. Inner whitespace is preserved. | AC-07; UNIT-02, API-05, UI-05 |
| BR-11 | Frontend validation is for immediate feedback only. The backend MUST repeat all validation, reject malformed IDs/enums/unknown references, and return field-level safe errors without creating a partial Ticket. | AC-07, AC-08; API-05, API-06 |
| BR-12 | `POST /api/tickets` MUST include a valid UUID-like `Idempotency-Key`. The same key and equivalent payload return the existing Ticket with `200`; the same key with a different payload returns `409`; no retry creates a second Ticket. | AC-09; UNIT-06, API-04, UI-07 |
| BR-13 | Allowed attachment types are JPG/JPEG (`image/jpeg`), PNG (`image/png`), WEBP (`image/webp`), and PDF (`application/pdf`). Extension and MIME checks are case-insensitive and must agree. The server MUST also validate the file signature: JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WEBP `RIFF....WEBP`, or PDF `%PDF-`. | AC-17; UNIT-04, API-15 |
| BR-14 | Each file MUST be no larger than 5 MiB (`5 * 1024 * 1024` bytes), and a Ticket may have at most five active Attachments. Soft-removed Attachments do not count toward the active limit. | AC-16, AC-17; UNIT-04, API-14, API-15 |
| BR-15 | The original filename is display metadata only. The server MUST use the basename, normalize Unicode to NFC, trim it, replace path separators/control characters with `_`, allow only letters, numbers, spaces, `.`, `_`, and `-`, cap it at 120 characters, and fall back to `attachment` when empty. It MUST generate an opaque storage key, prevent path traversal, and never expose the storage key to the client. | AC-18, AC-19; API-16, API-17 |
| BR-16 | Ticket creation and Attachment upload are separate operations. A rejected or failed upload MUST NOT erase a successfully created Ticket. If storage succeeds but metadata persistence fails, the server MUST attempt to delete the storage object; if cleanup also fails, the object MUST remain inaccessible and the response MUST report a safe per-file failure without exposing an incomplete Attachment row. If an existing metadata row loses access to its bytes, the server MUST record `availabilityState = UNAVAILABLE`, `unavailableAt`, and a safe reason; unavailable objects remain blocked. | AC-10, AC-16; API-07, API-14, UI-09, UI-10 |
| BR-17 | Removal requires a trimmed reason of 3–200 characters. Removal sets `removedAt`, `removedByRequesterId`, and `removalReason`; it MUST NOT delete the Attachment row. | AC-20; API-18, UI-14 |
| BR-18 | Removed or unavailable Attachments MUST return no download URL, `previewable = false`, and a blocked download response (`410`). A second removal of a removed Attachment returns `409`. | AC-18, AC-21; API-16, API-19, UI-14, UI-15 |
| BR-19 | Attachment metadata remains visible to the owner after soft removal, including filename, type, size, uploaded time, removed time, and reason. | AC-18, AC-20; API-16, API-18 |
| BR-20 | Ticket search is case-insensitive and trimmed and matches Ticket Number, Summary, Description, Category name, or Related System name. Filters are exact matches for Category, Related System, Requested Priority, and Current Status. | AC-12; UNIT-03, API-09, UI-11 |
| BR-21 | Ticket-list defaults are `page=1`, `pageSize=10`, `sortBy=updatedAt`, and `sortOrder=desc`; the secondary sort is `id desc`. Valid page sizes are 10, 20, and 50. `requestedPriority` sorting is `LOW < MEDIUM < HIGH < URGENT`; category sorting is case-insensitive by category name; date sorting is chronological; `currentStatus` has only `NEW` in Lab 2. Invalid or unknown query values return `400`. | AC-13, AC-14; UNIT-03, API-10, API-11 |
| BR-22 | An empty owned list and a valid no-results query return `200` with an empty `data` array and metadata, not `404`. The UI distinguishes first-use empty from filtered no-results. | AC-14; API-11, UI-11 |
| BR-23 | API failures return the documented safe error shape and do not reveal stack traces, SQL, file paths, or secrets. The Create form retains entered values after a failed request. | AC-04, AC-10, AC-23; UNIT-07, API-02, API-07, UI-09 |
| BR-24 | All persisted timestamps are timezone-aware UTC ISO 8601 values. Client display may localize them, but sorting and API comparisons use UTC. | AC-06, AC-13; API-03, API-10 |
| BR-25 | Lab 3 may replace the explicit `requesterId` context with an authenticated identity without changing Ticket ownership relationships or the requester-facing resource shapes. | AC-02, AC-22, AC-26; E2E-02 |

### Field and validation decision table

| Field | Source / mode | Required | Validation and storage |
|---|---|---:|---|
| Ticket Number | Backend / read-only | Generated | `TT-YYYY-NNNNNN`, unique; not accepted from client |
| Ticket Date | Backend / read-only | Generated | UTC creation timestamp |
| Requester | Selected context / read-only in Ticket form | Yes | Active `requesterId`; server rechecks ownership/context |
| Category | Active reference select | Yes | Existing active `categoryId` |
| Related System | Active reference select | Yes | Existing active `relatedSystemId` |
| Summary | Requester input | Yes | Trimmed, 5–120 characters |
| Requested Priority | Requester select | No (defaults) | `LOW`, `MEDIUM`, `HIGH`, `URGENT`; UI selects `MEDIUM` by default and the API applies the same default |
| Description | Requester textarea | Yes | Trimmed, 20–2,000 characters |
| Attachments | File input / separate upload | No | Allowed type, <=5 MiB each, <=5 active per Ticket |
| Current Status | Backend / read-only | Generated | `NEW` for every Lab 2 Ticket |

## 6. UI Specification Summary

The normative visual details are in [ui-spec.md](ui-spec.md). All screens use
the same shell, 4 px spacing scale, visible focus ring, field labels above
controls, red required asterisks, inline validation, and text plus non-color
indicators for status.

| Screen / mode | Structure and controls | Required states |
|---|---|---|
| Development Requester Selection | TokTickIT title, Lab 2 testing explanation, active Requester dropdown, Continue button. | Initial, loading, no active Requesters, API failure/retry, invalid selection. |
| Application shell | Brand, My Tickets and Create Ticket navigation, active-page indication, current Requester display, Change Requester action, mobile navigation. | Normal, loading transition, invalid stored context. |
| Create Ticket | Read-only generated/context row; Category, Related System, Requested Priority; full-width Summary and Description; Attachment section; primary Submit and secondary Cancel/Back. | Initial, reference loading, field validation, submitting/busy, success with official Ticket Number, API failure with values retained, invalid/uploading/failed attachment. |
| My Tickets | Search, Category/System/Priority/Status filters, sort, Clear Filters, Create Ticket, desktop table, mobile ticket cards, pagination. | Loading, first-use empty, no-results, API failure/retry, populated list. |
| Ticket Detail / view mode | Back navigation, Ticket Number/status header, read-only ticket fields, Attachment section with add/download/remove actions. | Loading, owned detail, missing Ticket, ownership failure, attachment uploading/removed/unavailable/error. |

### UI modes

- Create mode is the Create Ticket form, including separate Attachment upload
  after the Ticket has been created.
- View mode is Requester Ticket Detail; Ticket fields and generated values are
  read-only, while permitted Attachment actions remain available by state.
- Edit mode is explicitly out of scope for Lab 2. There is no editable Ticket
  detail form and no `PATCH /api/tickets` contract; Change Requester changes
  context only and does not edit stored Tickets.

The UI MUST not add Public Comments, Internal Notes, Actions Taken, or status
workflow controls. Requested Priority and Current Status badges are rendered
consistently; an IT Priority badge style is reserved for later labs and is not
editable or required in Lab 2.

## 7. Data Changes

### Models and fields

The existing `Category` model is extended with `isActive`. Prisma model names
are singular PascalCase; table names may use the explicit snake-case mappings
shown below.

| Model / table | Fields and constraints |
|---|---|
| `DevelopmentRequester` / `development_requesters` | `id Int PK`, `displayName String`, `email String UNIQUE`, `isActive Boolean DEFAULT true`, `createdAt DateTime`, `updatedAt DateTime`; index on `(isActive, displayName)`. |
| `Category` / `categories` | Existing `id Int PK`, `name String UNIQUE`, `createdAt`; add `isActive Boolean DEFAULT true`, `updatedAt DateTime`; index on `(isActive, name)`. Existing Lab 1 rows are preserved and set active. |
| `RelatedSystem` / `related_systems` | `id Int PK`, `name String UNIQUE`, `isActive Boolean DEFAULT true`, `createdAt DateTime`, `updatedAt DateTime`; index on `(isActive, name)`. |
| `Ticket` / `tickets` | `id Int PK`; `ticketNumber String UNIQUE`; `ticketDate DateTime`; `requesterId Int FK NOT NULL`; `categoryId Int FK NOT NULL`; `relatedSystemId Int FK NOT NULL`; `summary String`; `description String`; `requestedPriority RequestedPriority DEFAULT MEDIUM`; `itPriority ItPriority?`; `currentStatus CurrentStatus DEFAULT NEW`; `idempotencyKey String UNIQUE`; `createdAt DateTime`; `updatedAt DateTime`. Indexes on `(requesterId, updatedAt)`, `(requesterId, currentStatus)`, `(requesterId, categoryId)`, `(requesterId, relatedSystemId)`, and `(requesterId, requestedPriority)`. |
| `TicketNumberCounter` / `ticket_number_counters` | `year Int PK`; `nextValue Int DEFAULT 1`; exactly one row per UTC year. Allocation is performed inside the Ticket transaction under a row lock. |
| `Attachment` / `attachments` | `id Int PK`; `ticketId Int FK NOT NULL`; `uploadedByRequesterId Int FK NOT NULL`; `originalFilename String`; `storageKey String UNIQUE`; `mimeType String`; `sizeBytes Int`; `uploadedAt DateTime`; `availabilityState AttachmentAvailability DEFAULT AVAILABLE`; `unavailableAt DateTime?`; `unavailableReason String?`; `removedAt DateTime?`; `removedByRequesterId Int? FK`; `removalReason String?`. Indexes on `(ticketId, removedAt)` and `(ticketId, uploadedAt)`. |

Enums:

```text
RequestedPriority = LOW | MEDIUM | HIGH | URGENT
CurrentStatus     = NEW
ItPriority        = LOW | MEDIUM | HIGH | URGENT   # nullable/reserved
AttachmentAvailability = AVAILABLE | UNAVAILABLE
```

### Relationships and integrity

- One `DevelopmentRequester` has many `Tickets`; one `Ticket` has exactly one
  Requester.
- One `Ticket` has many `Attachments`; each Attachment belongs to one Ticket.
- One `Category` and one `RelatedSystem` may be referenced by many Tickets.
- `uploadedByRequesterId` and `removedByRequesterId` retain context metadata;
  both reference `DevelopmentRequester`.
- `TicketNumberCounter` has one row per UTC year and is updated atomically while
  allocating a Ticket Number; it is not requester-scoped.
- Attachment API state is derived in this order: `removed` when `removedAt` is
  present, `unavailable` when `availabilityState = UNAVAILABLE`, otherwise
  `active`. Unavailable metadata is retained so the owner can see a safe state
  without receiving bytes or a download URL.
- Foreign keys are required for all ownership and reference relationships.
  No Lab 2 API hard-deletes a Ticket, so historical relationships are retained.
- `ticketNumber`, `email`, `name`, and `storageKey` are unique. The unique
  `idempotencyKey` makes create retries safe.
- Ownership indexes begin with `requesterId` because every requester read is
  scoped by the selected Requester. This is the primary database-design
  decision: it supports both protection and the common My Tickets query without
  trusting a client-side filter.
- Required constraints include positive counter values, valid enum values, and
  the unique Ticket Number/idempotency/storage-key constraints. The migration
  MUST make the seed rerunnable without duplicate reference rows.
- Search initially uses case-insensitive PostgreSQL matching across the defined
  fields. A future migration may add a text-search index if measured data size
  requires it; that optimization is not needed for the MVP contract.

### Migration and seed decisions

- Add one Prisma migration after the Lab 1 Category migration; do not rewrite
  or delete the existing Category data.
- Seed with `upsert` by stable unique names/emails so running the seed repeatedly
  creates no duplicates.
- Required Categories: `Account and Access`, `Hardware`, `Software`, `Network`.
- Required Related Systems: `Email`, `Campus Wi-Fi`, `VPN`, `LEB2 App`, `Grade
  Submission App`, `Printer`, and `Corporate Laptop`.
- Seed at least four active Development Requesters and one inactive Requester.
  The inactive row is retained for negative tests but never appears in the
  selector.
- Tests use factories/fixtures for Tickets and Attachments rather than adding
  duplicate seed rows. Uploaded bytes use a test storage adapter and are not
  committed to Git.

## 8. API Contract

The complete contract is in [api-spec.md](api-spec.md). All paths are under the
server's `/api` prefix. Lab 1's `GET /api/health` and the existing successful
shape of `GET /api/categories` remain compatible.

### Endpoint summary

| Method and path | Purpose | Success | Main failure statuses |
|---|---|---:|---|
| `GET /api/development-requesters?active=true` | Load active selector options | 200 | 400, 500 |
| `GET /api/categories?active=true` | Load active Categories | 200 | 400, 500 |
| `GET /api/related-systems?active=true` | Load active Related Systems | 200 | 400, 500 |
| `POST /api/tickets` | Create one validated Ticket | 201; idempotent replay 200 | 400, 403, 409, 500 |
| `GET /api/tickets` | Owned search/filter/sort/page | 200 | 400, 403, 500 |
| `GET /api/tickets/:ticketId` | Retrieve one owned Ticket | 200 | 400, 403, 404, 500 |
| `POST /api/tickets/:ticketId/attachments` | Upload one permitted file | 201 | 400, 403, 404, 409, 413, 415, 500, 503 |
| `GET /api/tickets/:ticketId/attachments` | Retrieve owner-visible metadata | 200 | 400, 403, 404, 500 |
| `GET /api/tickets/:ticketId/attachments/:attachmentId` | Retrieve one attachment's metadata | 200 | 400, 403, 404, 500 |
| `GET /api/tickets/:ticketId/attachments/:attachmentId/download` | Download active file | 200 binary | 400, 403, 404, 410, 500, 503 |
| `DELETE /api/tickets/:ticketId/attachments/:attachmentId` | Soft-remove with reason | 200 | 400, 403, 404, 409, 500 |

Requester-scoped routes receive `requesterId` as a positive integer query
parameter, except create where it is in the JSON body. This explicit context is
deliberately temporary and is never described as authentication. The standard
JSON error shape is:

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

`message` is safe for display. `fields` is optional and only contains
user-actionable field messages. Unexpected errors use a generic message and do
not include stack traces, SQL, file paths, or secrets.

### Create and list shapes

`POST /api/tickets` accepts `requesterId`, `categoryId`, `relatedSystemId`,
`summary`, `requestedPriority`, and `description`. It does not accept
`ticketNumber`, `ticketDate`, `currentStatus`, `itPriority`, or attachment
storage fields. A successful response is `{ "data": <ticket>, "meta": ... }`,
where `ticketNumber`, `ticketDate`, `currentStatus`, and relationship data come
from the backend.

`GET /api/tickets` requires `requesterId` and returns:

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

The list query contract is `search`, `categoryId`, `relatedSystemId`,
`requestedPriority`, `currentStatus`, `sortBy`, `sortOrder`, `page`, and
`pageSize`; defaults and validation are normative in `api-spec.md`.

### Ownership, Attachment, and status decisions

- A valid but non-owning `requesterId` returns `403` and no private data.
- A syntactically valid but missing Ticket or Attachment returns `404`.
- A removed/unavailable Attachment returns metadata but its download returns
  `410`; an active file returns binary `200`.
- Unsupported type returns `415`, oversized file returns `413`, and active-count
  or repeated-removal conflicts return `409`.
- The create transaction saves the Ticket first. Attachment failures are shown
  per file and are retryable; they do not roll back a saved Ticket.

## 9. Acceptance Criteria

| ID | Given / When / Then criterion |
|---|---|
| AC-01 | **Given** seeded active and inactive Requesters, **when** the selector loads, **then** only active Requesters are listed and loading, empty, and failure states are observable and usable. |
| AC-02 | **Given** an active Requester is selected, **when** the user continues, changes Requester, or opens a requester page with no valid selection, **then** the selected ID is persisted, the shell shows the name, requester data reloads, and the selection screen guards the invalid context. |
| AC-03 | **Given** active and inactive reference data, **when** Create Ticket loads, **then** active Categories and Related Systems are available and inactive values cannot be selected. |
| AC-04 | **Given** a requester/reference API failure, **when** the screen renders or Retry is pressed, **then** a safe actionable error appears without internal details. |
| AC-05 | **Given** valid Ticket data and a selected Requester, **when** Submit completes, **then** one Ticket is persisted with the matching `requesterId`, Category, Related System, trimmed text, priority, and description, and the API returns `201`. |
| AC-06 | **Given** a successful create, **when** the response is shown, **then** the backend-generated unique Ticket Number, UTC Ticket Date, `NEW` status, and default/selected Requested Priority are displayed as read-only values. |
| AC-07 | **Given** missing, whitespace-only, too-short, or too-long Summary/Description, **when** the user submits, **then** field-level messages appear, the invalid request is rejected, and no Ticket is created. |
| AC-08 | **Given** an inactive/missing Requester, inactive/missing Category/System, or invalid priority, **when** the API receives the request, **then** it returns a safe validation/context error and creates nothing. |
| AC-09 | **Given** a user submits twice or retries the same create request, **when** the client is busy or the same `Idempotency-Key` is replayed, **then** only one Ticket exists and the UI does not enable a second concurrent submit. |
| AC-10 | **Given** create or upload failure, **when** the failure is displayed, **then** the error is safe, entered form values remain, and a Ticket already created remains visible with a per-file retry/failure explanation. |
| AC-11 | **Given** Requester A and Requester B each own Tickets, **when** either opens My Tickets, **then** the response and UI contain only the currently selected Requester's Tickets. |
| AC-12 | **Given** an owned Ticket list, **when** the user searches, filters by Category/System/Priority/Status, or clears filters, **then** results match the documented case-insensitive search and exact filters. |
| AC-13 | **Given** multiple owned Tickets, **when** the user selects a permitted sort, **then** the requested direction is applied with deterministic `id desc` secondary sorting and the default is `updatedAt desc`. |
| AC-14 | **Given** a page, page size, empty list, or no-results query, **when** My Tickets loads, **then** pagination metadata is correct, invalid query values return `400`, and empty/no-results states are distinct and usable. |
| AC-15 | **Given** an owned Ticket, **when** Ticket Detail opens, **then** all Ticket fields are read-only and no comments, notes, Actions Taken, or status workflow control is present. |
| AC-16 | **Given** an owned Ticket with fewer than five active Attachments, **when** the user uploads a permitted file <=5 MiB, **then** it is stored and its metadata appears in the Ticket Detail screen. |
| AC-17 | **Given** an unsupported type, file >5 MiB, or a sixth active file, **when** upload is attempted, **then** it is rejected with the documented status/message and no invalid active Attachment is created. |
| AC-18 | **Given** owned Attachment metadata, **when** the owner views it, **then** safe filename/type/size/time/state metadata is shown; removed metadata remains visible and removed/unavailable state has no download URL or preview. |
| AC-19 | **Given** an active owned Attachment, **when** Download/Preview is used, **then** the authorized file is returned with its stored MIME type and safe filename. |
| AC-20 | **Given** an active owned Attachment and a 3–200 character reason, **when** Remove is confirmed, **then** it becomes soft-removed, metadata and reason remain, and its bytes are no longer offered. |
| AC-21 | **Given** a removed Attachment, **when** Download/Preview or repeated Remove is attempted, **then** download/preview is blocked with `410` and repeated removal returns `409`. |
| AC-22 | **Given** a Ticket or Attachment owned by another Requester or a missing resource, **when** a direct request is made, **then** the API returns `403` for ownership mismatch or `404` for missing resource without leaking private data. |
| AC-23 | **Given** any required screen state, **when** it is rendered or used by keyboard, **then** labels, required markers, inline messages, focus indicators, busy/disabled controls, and non-color status cues are present and accessible. |
| AC-24 | **Given** desktop, tablet, and mobile viewports, **when** each screen is used, **then** the specified layout applies, controls remain touch-friendly, labels/messages/filenames do not clip, and there is no horizontal page scrolling. |
| AC-25 | **Given** the finished screens, **when** compared with `ui-spec.md`, **then** Zen Green tokens, field states, buttons, badges, spacing, table/card behavior, and screenshot checklist all conform. |
| AC-26 | **Given** a fresh or existing Lab 1 database, **when** the migration and seed run twice, **then** required models/relationships/constraints exist, all required reference data is present, and no duplicate seed records are created. |

Every criterion is mapped to at least one planned test in [tests.md](tests.md).

## 10. Definition of Done

### Part 1: Product completion

- [ ] All Included scope is implemented without adding excluded authentication,
  IT Staff, collaboration, or post-creation workflow.
- [ ] AC-01 through AC-26 are satisfied and linked to evidence.
- [ ] No required unit, API, UI, responsive, visual, or E2E test is skipped,
  disabled, commented out, or unrelated to the contract.
- [ ] Server validation, ownership checks, idempotency, defaults, attachment
  limits, soft removal, safe errors, and failure compensation are verified.
- [ ] Prisma migration applies cleanly after Lab 1 and seed is repeatable.
- [ ] My Tickets search, filters, sorting, pagination, empty, no-results, and
  failure states work for more than one Requester.
- [ ] Create Ticket, Ticket Detail, and Attachment UI match `ui-spec.md` at all
  required viewport classes and are keyboard accessible.
- [ ] Official Ticket Number and saved values are demonstrated as backend/
  database values, not client-generated substitutes.
- [ ] Active Attachment download works; removed Attachment metadata remains and
  its download/preview is blocked.
- [ ] `npm test`, documented build checks, and the final E2E/visual checks pass
  from the final `main` branch.
- [ ] README setup, migration, seed, test, and screenshot instructions are
  current.
- [ ] Final review audits each changed file, dependency, migration, and test.

### Part 2: Course delivery

- [ ] The four contract files existed before the Issue 2 implementation work
  was completed; a readable commit-date screenshot is included in the delivery
  PDF.
- [ ] Work used GitHub Issues, feature branches, and the required
  `lab2-staging` then `main` flow; no direct feature work was committed to
  `main` or `lab2-staging`.
- [ ] Each Issue entered staging through a peer-reviewed Pull Request.
- [ ] Review comments were answered, required fixes were made, and approvals
  are recorded in `docs/lab-02/reviewer.md`.
- [ ] `docs/lab-02/ai_use.md` records 6–10 selected prompts and reflection.
- [ ] The final Kanban state has all Lab 2 Issues in Done.
- [ ] The submission PDF contains readable links, rendered documents, terminal
  results, screenshots, and the required Answer Part 1–9 sections.

## 11. Assumptions and Decisions

- Lab 2 deliberately uses explicit `requesterId` context because authentication
  is a Lab 3 responsibility. This context is not represented as a security
  claim in UI copy or API documentation.
- Ticket numbers use one transaction-safe `TicketNumberCounter` row per UTC
  year. The sequence starts at `000001`, is allocated under the Ticket
  transaction/row lock, and cannot exceed `999999`; exhaustion returns the
  documented `409 TICKET_NUMBER_EXHAUSTED` error.
- The existing Lab 1 category-list response remains a JSON array for backward
  compatibility; Ticket and Attachment responses use the documented `{data,
  meta}` envelope.
- A small storage adapter is sufficient for Lab 2. Production object storage,
  antivirus scanning, and authenticated download URLs are future concerns; the
  adapter MUST still enforce the fixed type/size/safe-key rules here.
- Upload failure does not roll back a saved Ticket because the file store is a
  separate resource. The UI must make the partial-success state explicit and
  retryable.
- `Summary` and `Description` lengths are implementation decisions chosen to
  keep list scanning readable while allowing enough problem detail. Changing
  them requires updating validation, API, UI, and tests together.
- The target visual evidence viewports are 1440x900 (desktop), 1024x768
  (tablet), and 390x844 (mobile), with additional manual checking at 320 px
  content width.
- Lab 2 has explicit Create and View modes only. Ticket editing is deferred to
  a later lab, so no edit controls or update endpoint are required here.
- The contract is approved for implementation only after the student reviews
  the four files and records any correction in the Git history before the
  Issue 2 implementation PR is completed.
