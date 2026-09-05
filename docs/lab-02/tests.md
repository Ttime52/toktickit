# Lab 2 Test Plan and Results

**Product:** TokTickIT Requester Ticketing MVP  
**Version:** 1.0  
**Status:** Final results recorded; all automated suites pass
**Date:** 2026-09-05

This plan is derived from [specification.md](specification.md),
[api-spec.md](api-spec.md), and [ui-spec.md](ui-spec.md). It is the Test DD
deliverable and now includes the executed regression, responsive, screenshot,
and acceptance-criterion evidence.

## 1. Test strategy

- **Unit:** Vitest tests for pure Ticket Number, validation, query parsing,
  attachment, ownership, idempotency, and safe-error logic.
- **API/integration:** Vitest + Supertest against an isolated PostgreSQL test
  database and test storage adapter. Tests verify status codes, persisted
  relationships, ownership before data return, response shapes, and safe errors.
- **Database/migration:** Prisma integration checks against the same throwaway
  database verify models, relationships, foreign keys, unique constraints,
  indexes, nullable fields, and idempotent seed counts.
- **UI component:** Vitest + React Testing Library for controls, labels, field
  states, API calls, loading/success/failure states, and attachment actions.
- **Responsive:** Playwright at desktop, tablet, and mobile viewports for
  layout, wrapping, touch targets, and horizontal-overflow checks.
- **Visual:** DOM/CSS token assertions plus Playwright screenshots compared
  with the approved Zen Green contract and the checklist in `ui-spec.md`.
- **E2E:** Playwright with seeded Requester A/B data to prove the complete
  selection, create, list, detail, attachment, ownership, and failure flows.
- API/UI tests use factories and clean their created rows; E2E helpers use
  deterministic idempotency keys so repeated runs do not duplicate fixture
  Tickets. Ownership is always verified by the backend, never by a
  client-side filter alone.

## 2. Test matrix

The matrix preserves the approved scenarios and their original planning labels.
Where a planned unit/UI file was not needed as a separate file, the final
evidence points to the implemented API/UI test that covers the same contract.
The `Planned` labels below are retained for audit history; the executed status
is recorded in Sections 3 and 6.

| Test ID | Level | Requirement / AC | Scenario | Expected result | Automated test file | Status |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-01 / AC-06 | Generate several Ticket Numbers, including a UTC year boundary, concurrent sequence requests, and the exhaustion boundary. | Every value matches `TT-YYYY-NNNNNN`, is unique, starts at `000001` per UTC year, and exhaustion maps to `TICKET_NUMBER_EXHAUSTED`. | `server/tests/lab-02/ticket-number.unit.test.ts` | Pass |
| UNIT-02 | Unit | BR-04, BR-10 / AC-06, AC-07 | Normalize Summary/Description and apply priority default; test whitespace and minimum/maximum boundaries. | Values are trimmed, valid boundaries pass, invalid/empty values return field errors, omitted priority becomes MEDIUM. | `server/tests/lab-02/validation.unit.test.ts` | Pass |
| UNIT-03 | Unit | BR-20, BR-21 / AC-12, AC-13, AC-14 | Parse list defaults, filters, sort fields, directions, pages, sizes, unknown parameters, and malformed values. | Defaults and deterministic secondary sort are applied; invalid query values are rejected instead of clamped. | `server/tests/lab-02/ticket-query.unit.test.ts` | Pass |
| UNIT-04 | Unit | BR-13, BR-14, BR-15 / AC-16, AC-17, AC-18 | Validate allowed extension/MIME/signature pairs, 5 MiB boundary, oversized files, active-count limit, and unsafe filenames. | Valid files pass; MIME/signature mismatches, invalid type, size, sixth active file, and unsafe names return safe domain results. | `server/tests/lab-02/attachment-validation.unit.test.ts` | Pass |
| UNIT-05 | Unit | BR-07 / AC-11, AC-15, AC-22 | Check owner and non-owner Ticket/Attachment contexts, plus missing resources. | Owner is allowed; non-owner is `OWNERSHIP_FORBIDDEN`; missing resource is not treated as an owner match. | `server/tests/lab-02/ticket-detail.api.test.ts`, `server/tests/lab-02/attachments.api.test.ts` | Pass |
| UNIT-06 | Unit | BR-12 / AC-09 | Compare first create, equivalent replay, and same-key/different-payload replay. | First request creates once, equivalent replay is safe, changed payload is an idempotency conflict. | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| UNIT-07 | Unit | BR-16, BR-23 / AC-04, AC-10, AC-23 | Map database/storage exceptions to safe errors and test upload compensation decision. | Internal details are removed; user-actionable safe error is returned and a failed metadata write triggers storage cleanup. | `server/tests/lab-02/reference-data.api.test.ts`, `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| API-01 | API | BR-05, BR-08, BR-09 / AC-01, AC-03, AC-26 | Run the idempotent seed twice; retrieve requester, Category, and Related System reference lists. | Required seed data exists once, inactive Requester is excluded, active references are sorted and returned as arrays. | `server/tests/lab-02/reference-data.api.test.ts` | Pass |
| DB-01 | Database/integration | FR-14 / AC-26 | Apply the migration, inspect every Lab 2 model/relationship/constraint/index/nullable field, and run the seed twice against the throwaway database. | Schema matches `specification.md`; foreign keys and unique constraints hold; counter/enum defaults are correct; seed counts are exactly four Categories, at least six Related Systems, at least four active Requesters, and at least one inactive Requester with no duplicate rows. | `server/tests/lab-02/schema.integration.test.ts` | Pass |
| API-02 | API | BR-23 / AC-04 | Mock a reference-data database failure and load the selector/Create dependencies. | API returns `500` with the safe error shape and no SQL/stack/path details. | `server/tests/lab-02/reference-data.api.test.ts` | Pass |
| API-03 | API | BR-01–BR-04 / AC-05, AC-06 | POST valid Ticket data with an active Requester and active references. | `201`; one persisted Ticket has the exact requester relationship, trimmed fields, generated number/date, `NEW`, and response `data`. | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-04 | API | BR-04, BR-12 / AC-06, AC-09 | Omit priority, replay the same `Idempotency-Key`, and replay it with changed payload. | Default is MEDIUM; equivalent replay is `200` with the same Ticket; changed payload is `409`; row count remains one. | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-05 | API | BR-10, BR-11 / AC-07 | POST missing, whitespace-only, too-short, and too-long Summary/Description. | `400 VALIDATION_ERROR` with field messages; no Ticket is persisted. | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-06 | API | BR-05, BR-08, BR-09, BR-11 / AC-08 | POST inactive/missing Requester or references and invalid priority/ID types. | `400` with `REQUESTER_CONTEXT_INVALID`, `INVALID_REFERENCE`, or safe validation error; no partial Ticket is persisted. | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-07 | API | BR-23 / AC-10 | Force a database failure during create. | `500 INTERNAL_ERROR` safe body; no internal detail leaks and the form can safely retry. | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-08 | API | BR-07 / AC-11 | Seed Tickets for Requester A and B, then list with each `requesterId`. | Each response contains only that Requester's Tickets, regardless of client list filtering. | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-09 | API | BR-20 / AC-12 | Search by number, Summary, Description, Category, and Related System; combine exact filters. | Search is trimmed/case-insensitive; filters combine with AND and return only matching owned rows. | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-10 | API | BR-21, BR-24 / AC-13 | Sort by each allowed field in ascending/descending order with equal primary values. | Requested order is applied, including `LOW < MEDIUM < HIGH < URGENT` for priority and case-insensitive category names; dates are chronological and ties use `id desc`; default is `updatedAt desc`. | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-11 | API | BR-21, BR-22 / AC-14 | Request pages 1/2, page sizes 10/20/50, invalid queries, empty owner list, and valid no-results query. | Correct `data` and pagination metadata; invalid values `400`; empty/no-results `200 []` with distinct UI interpretation. | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-12 | API | BR-03, BR-07 / AC-15 | Retrieve one owned Ticket and inspect its detail representation. | `200`; fields are read-only in the contract, attachments are metadata, and excluded collaboration/status controls are absent. | `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| API-13 | API | BR-07 / AC-22 | Request an existing Ticket as another Requester and request a missing Ticket. | Non-owner is `403` with no Ticket data; missing resource is `404`. | `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| API-14 | API | BR-07, BR-14, BR-15 / AC-16, AC-18 | Upload valid JPG, PNG, WEBP, and PDF files to an owned Ticket, including after a soft removal. | `201`; active count excludes removed rows; metadata has safe filename/state and no storage key. | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-15 | API | BR-13, BR-14 / AC-17 | Upload unsupported MIME/extension, mismatched file signature, >5 MiB, and sixth active file. | `415`, `413`, or `409` respectively; no invalid active Attachment row or downloadable bytes are created. | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-16 | API | BR-18, BR-19 / AC-18, AC-20 | Get collection and single Attachment metadata before and after removal. | Owner sees safe metadata; removed state retains filename/type/size/times/reason, with no URL and `previewable=false`. | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-17 | API | BR-15 / AC-19 | Download an active owned image/PDF and inspect headers and bytes. | `200` binary with stored MIME and safe Content-Disposition filename; storage key is not exposed. | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-18 | API | BR-17 / AC-20 | Soft-remove an active Attachment with valid, boundary, empty, and overlong reasons. | Valid reason returns `200` removed metadata and retained row; invalid reasons return `400`. | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-19 | API | BR-18 / AC-21 | Download/preview a removed or unavailable Attachment and remove it again. | Download is `410` with no bytes; repeated removal is `409` for a removed row; state remains `removed` or `unavailable` as applicable. | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-20 | API | BR-07 / AC-22 | List, read, upload, download, and remove an Attachment using a non-owner or missing IDs. | Every non-owner operation is `403`; missing resources are `404`; no private metadata/bytes leak. | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-21 | API | BR-16, BR-23 / AC-10 | Make storage fail after a Ticket is created and make metadata persistence fail after bytes are written, including cleanup failure and an existing row whose bytes become unavailable. | Ticket remains; response identifies per-file failure safely; cleanup is attempted, no incomplete Attachment row is exposed, and an existing unavailable row is blocked with safe state metadata. | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| UI-01 | UI component | FR-01 / AC-01 | Render selector initial/loading/empty/failure/invalid-selection states. | Correct heading, Lab 2 disclaimer, active options, disabled Continue, inline errors, Retry, and accessible status are shown. | `client/tests/lab-02/RequesterSelection.test.tsx` | Pass |
| UI-02 | UI component | BR-05, BR-06, BR-08 / AC-02 | Choose a Requester, continue, reload, use Change Requester, and attempt a dirty-form switch. | Local storage and shell identity update; requester data reloads; dirty form asks for confirmation; invalid stored ID returns to selection. | `client/tests/lab-02/RequesterContext.test.tsx` | Pass |
| UI-03 | UI component | FR-03 / AC-03, AC-04 | Mock active reference data and reference API failure on Create Ticket. | Active options render, inactive values are absent, loading is visible, and safe Retry error is actionable. | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-04 | UI component | FR-04 / AC-05, AC-06, AC-23 | Render Create Ticket and inspect all required labels, read-only placeholders, help text, and selected Requester. | Required fields and red asterisks are present; system values are not editable; controls have accessible names. | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-05 | UI component | BR-10 / AC-07 | Submit empty/whitespace/boundary-invalid Create Ticket form. | Field-level messages appear next to Summary/Description; no create API call is made. | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-06 | UI component | BR-08, BR-09, BR-11 / AC-08 | Return invalid requester/reference/priority error from the API. | Safe field/form error appears; no success state or false Ticket Number is shown. | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-07 | UI component | BR-12 / AC-09 | Click Create Ticket repeatedly while the request is pending and inspect busy state. | Button says Creating…, is disabled, and exactly one request/idempotency key is used. | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-08 | UI component | BR-01–BR-03 / AC-06 | Resolve create with a backend Ticket response. | Success message shows the returned official Ticket Number, date, status, and next actions; values are read-only. | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-09 | UI component | BR-16, BR-23 / AC-10 | Reject the create request or fail one Attachment upload. | Safe error appears, text/select values remain, Ticket success/partial failure is explicit, and Retry is available. | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-10 | UI component | BR-13, BR-14 / AC-16, AC-17, AC-18 | Select valid, invalid, oversized, and limit-reaching files. | Valid row uploads; invalid rows show immediate messages without API calls; active/removed count is communicated. | `client/tests/lab-02/CreateTicket.test.tsx`, `client/tests/lab-02/TicketDetail.test.tsx` | Pass |
| UI-11 | UI component | FR-08 / AC-11, AC-12, AC-13 | Render owned rows/cards and use search, filters, sorting, Clear Filters, and Open. | Controls update the documented query; only current Requester rows render; badges and open action are readable. | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-12 | UI component | BR-21, BR-22 / AC-14 | Render list loading, first-use empty, no-results, failure, and pagination states. | Empty and no-results copy differs; Clear Filters/Retry/Create actions are usable; page controls reflect metadata. | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-13 | UI component | FR-09 / AC-15 | Render owned Ticket Detail and inspect edit/comment/status controls. | Ticket fields are read-only; attachment section exists; excluded workflow controls are absent. | `client/tests/lab-02/TicketDetail.test.tsx` | Pass |
| UI-14 | UI component | FR-10, FR-11 / AC-18, AC-19, AC-20, AC-21 | Render active/uploading/failed/removed/unavailable file rows; confirm Remove and use Download/Preview. | Actions match state; reason is required; removed metadata remains and Download/Preview are hidden or disabled. | `client/tests/lab-02/TicketDetail.test.tsx` | Pass |
| UI-15 | UI component | BR-07 / AC-22 | Render `403` and `404` detail/attachment responses. | Safe ownership/missing message appears with Back/Retry; no other Requester's data is rendered. | `client/tests/lab-02/TicketDetail.test.tsx` | Pass |
| UI-16 | UI/style | FR-12, FR-13 / AC-23 | Inspect labels, `aria-*`, keyboard focus, required markers, alert roles, disabled/busy controls, and dialog focus. | Every required control is accessible by keyboard and screen-reader semantics; errors are adjacent and non-color-only. | `client/tests/lab-02/RequesterSelection.test.tsx`, `client/tests/lab-02/CreateTicket.test.tsx`, `client/tests/lab-02/TicketDetail.test.tsx` | Pass |
| RESP-01 | Responsive | FR-13 / AC-24 | Open all four screens at 1440x900. | Requester Selection is centered and readable; Create/Detail use multi-column layout, My Tickets has a readable desktop table, and no clipping/overflow occurs. | `e2e/lab-02/responsive-layout.spec.ts` | Pass |
| RESP-02 | Responsive | FR-13 / AC-24 | Open all four screens at 1024x768. | Requester Selection remains usable; other screens use practical two-column/wrapped layouts, Summary/Description retain width, toolbar wraps cleanly, and actions remain visible. | `e2e/lab-02/responsive-layout.spec.ts` | Pass |
| RESP-03 | Responsive | FR-13 / AC-24 | Open all four screens at 390x844 and a 320 px content width. | Selection remains usable, fields stack, My Tickets uses cards, buttons are touch-friendly, and `scrollWidth` does not exceed viewport width. | `e2e/lab-02/responsive-layout.spec.ts` | Pass |
| RESP-04 | Responsive | FR-13 / AC-14, AC-24 | Use long filenames, long Ticket Number/Summary, filters, pagination, and validation messages on mobile. | Text wraps/ellipsis remains accessible; no hidden buttons, overlap, or horizontal page scroll. | `e2e/lab-02/responsive-layout.spec.ts` | Pass |
| VIS-01 | Visual | UI tokens / AC-25 | Assert computed theme colors and shared spacing/radius/input-height tokens. | Screens use the exact Zen Green values from `ui-spec.md`; no one-off conflicting colors. | `e2e/lab-02/visual-qa.spec.ts` | Pass |
| VIS-02 | Visual | UI states / AC-23, AC-25 | Inspect normal, focus, read-only, invalid, disabled, busy, button, badge, and attachment state classes. | States are visually distinct, text-labeled, and consistent across Create, List, and Detail. | `e2e/lab-02/visual-qa.spec.ts` | Pass |
| VIS-03 | Visual | Screenshot checklist / AC-25 | Capture Requester Selection, Create Ticket, My Tickets, and Ticket Detail at desktop/tablet/mobile sizes. | Twelve required screenshot files exist under `artifacts/lab-02/screenshots/` and are readable for review, including selector loading/failure evidence where applicable. | `e2e/lab-02/responsive-layout.spec.ts` | Pass |
| VIS-04 | Visual | UI checklist / AC-24, AC-25 | Review screenshots against tokens, approved illustrations, labels, spacing, clipping, overlap, and overflow checklist. | Checklist is completed with no unexplained visual deviation; any correction updates the UI/spec before Done. | `e2e/lab-02/visual-qa.spec.ts` | Pass |
| E2E-01 | E2E | AC-02, AC-05, AC-06, AC-09, AC-23 | Select an active Requester, create a valid Ticket, retry-safe submit, and open the returned Ticket. | Database-backed Ticket appears with matching requester and official Number; success and next actions work. | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pass |
| E2E-02 | E2E | AC-11, AC-22 | Create/fixture Tickets for Requesters A/B, switch context, list, and direct-request the other owner's Ticket. | A's rows disappear for B; direct cross-owner Ticket/Attachment access is rejected with no leak. | `server/tests/lab-02/my-tickets.api.test.ts`, `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| E2E-03 | E2E | AC-12, AC-13, AC-14 | Create enough owned Tickets to exercise search, filters, sorting, page 1/2, empty, and no-results states. | Query controls, metadata, deterministic order, Clear Filters, and empty/no-results copy all work. | `server/tests/lab-02/my-tickets.api.test.ts`, `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| E2E-04 | E2E | AC-15, AC-16, AC-18, AC-19, AC-20, AC-21 | Open owned Detail, upload permitted file, download/preview, remove with reason, inspect retained metadata, and retry removed download. | Complete Attachment lifecycle works; removed file is blocked and metadata remains. | `e2e/lab-02/requester-ticket-flow.spec.ts`, `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| E2E-05 | E2E | AC-04, AC-10 | Simulate reference/create/storage failures and use Retry after entering form data. | Safe errors are shown, inputs survive, and partial Ticket/upload failure behavior follows the contract. | `server/tests/lab-02/reference-data.api.test.ts`, `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| E2E-06 | E2E | AC-24, AC-25 | Run the main requester flow at all required viewport sizes and capture screenshots. | Responsive rules and visual evidence pass for Requester Selection, Create, My Tickets, and Detail. | `e2e/lab-02/responsive-layout.spec.ts` | Pass |

## 3. Acceptance-criterion traceability

Every acceptance criterion has at least one executed automated test. The
API/UI contract IDs below are intentionally repeated where a behavior needs
more than one level of evidence.

| Acceptance criterion | Executed evidence | Result |
|---|---|---|
| AC-01 | `RequesterSelection.test.tsx`, `reference-data.api.test.ts` | Pass |
| AC-02 | `RequesterContext.test.tsx`, `requester-ticket-flow.spec.ts` | Pass |
| AC-03 | `reference-data.api.test.ts`, `CreateTicket.test.tsx` | Pass |
| AC-04 | `reference-data.api.test.ts`, `CreateTicket.test.tsx` | Pass |
| AC-05 | `create-ticket.api.test.ts`, `CreateTicket.test.tsx`, `requester-ticket-flow.spec.ts` | Pass |
| AC-06 | `ticket-number.unit.test.ts`, `create-ticket.api.test.ts`, `requester-ticket-flow.spec.ts` | Pass |
| AC-07 | `validation.unit.test.ts`, `create-ticket.api.test.ts`, `CreateTicket.test.tsx` | Pass |
| AC-08 | `create-ticket.api.test.ts`, `CreateTicket.test.tsx` | Pass |
| AC-09 | `create-ticket.api.test.ts` (equivalent replay and changed-payload replay) | Pass |
| AC-10 | `create-ticket.api.test.ts`, `CreateTicket.test.tsx`, `TicketDetail.test.tsx` | Pass |
| AC-11 | `my-tickets.api.test.ts`, `MyTickets.test.tsx` | Pass |
| AC-12 | `ticket-query.unit.test.ts`, `my-tickets.api.test.ts`, `MyTickets.test.tsx` | Pass |
| AC-13 | `ticket-query.unit.test.ts`, `my-tickets.api.test.ts` (tie-breaker coverage) | Pass |
| AC-14 | `my-tickets.api.test.ts`, `MyTickets.test.tsx`, `responsive-layout.spec.ts` | Pass |
| AC-15 | `ticket-detail.api.test.ts`, `TicketDetail.test.tsx`, `requester-ticket-flow.spec.ts` | Pass |
| AC-16 | `attachment-validation.unit.test.ts`, `attachments.api.test.ts`, `TicketDetail.test.tsx` | Pass |
| AC-17 | `attachment-validation.unit.test.ts`, `attachments.api.test.ts`, `TicketDetail.test.tsx` | Pass |
| AC-18 | `ticket-detail.api.test.ts`, `TicketDetail.test.tsx`, `requester-ticket-flow.spec.ts` | Pass |
| AC-19 | `ticket-detail.api.test.ts`, `TicketDetail.test.tsx`, `requester-ticket-flow.spec.ts` | Pass |
| AC-20 | `ticket-detail.api.test.ts`, `TicketDetail.test.tsx`, `requester-ticket-flow.spec.ts` | Pass |
| AC-21 | `ticket-detail.api.test.ts`, `TicketDetail.test.tsx`, `requester-ticket-flow.spec.ts` | Pass |
| AC-22 | `ticket-detail.api.test.ts`, `TicketDetail.test.tsx`, `attachments.api.test.ts` | Pass |
| AC-23 | `RequesterSelection.test.tsx`, `CreateTicket.test.tsx`, `TicketDetail.test.tsx`, `visual-qa.spec.ts` | Pass |
| AC-24 | `responsive-layout.spec.ts`, `MyTickets.test.tsx` | Pass |
| AC-25 | `visual-qa.spec.ts` plus 12 required screenshots | Pass |
| AC-26 | `schema.integration.test.ts`, `reference-data.api.test.ts` | Pass |

## 4. Responsive and visual checklist

### Viewports

| Name | Viewport | Required evidence |
|---|---:|---|
| Desktop | 1440x900 | Requester Selection, Create Ticket, My Tickets table, Ticket Detail |
| Tablet | 1024x768 | Requester Selection plus two-column/wrapped layouts for the other three screens |
| Mobile | 390x844 | Requester Selection, stacked Create/Detail, Ticket cards, usable filters/pagination |
| Narrow smoke check | 320 px content width | No horizontal page scroll, clipping, or hidden controls |

### Automated and manual checks

- [x] Exact Zen Green color tokens are applied to header, actions, links,
      selected states, page background, surfaces, read-only fields, errors,
      warnings, and success.
- [x] Editable and read-only fields are visibly different but readable.
- [x] Required asterisks and validation messages appear next to the correct
      controls and do not overlap.
- [x] Primary, secondary, tertiary, destructive, disabled, and busy buttons are
      distinguishable and have visible text.
- [x] Requested Priority, Current Status, and reserved IT Priority badges use
      consistent shape, spacing, and text/non-color cues.
- [x] Desktop table and mobile Ticket cards show all essential information.
- [x] Search, filters, sorting, Clear Filters, pagination, attachment controls,
      and empty/no-results actions remain usable at all viewports.
- [x] Requester Selection shows the active dropdown, selected value, Continue,
      Change Requester path, loading, empty, and failure/retry states clearly.
- [x] Long filenames, Ticket Numbers, descriptions, and error messages wrap or
      remain accessible; no clipping or overlap is visible.
- [x] `document.documentElement.scrollWidth <= viewport width` at mobile sizes.
- [x] Keyboard focus remains visible; dialog focus returns to its triggering row.
- [x] Screenshots are compared against `ui-spec.md` and approved illustrations.

## 5. Executed test commands

The following commands were executed on 2026-09-05 from the repository root.
The server and client used the configured local development database; uploaded
E2E files use the test storage adapter and generated Ticket fixtures use unique
idempotency keys.

```powershell
cd server
npm.cmd test                 # 12 files, 56 tests passed
npm.cmd run build            # passed

cd ..\client
npm.cmd test                 # 6 files, 26 tests passed
npm.cmd run build            # passed

cd ..
npx.cmd playwright install chromium
$env:PLAYWRIGHT_EXTERNAL_SERVERS = "1"
node node_modules/playwright/cli.js test
# 9 tests passed: desktop, tablet, and mobile projects
```

For a normal local E2E run, start `server` and `client` first and set
`PLAYWRIGHT_EXTERNAL_SERVERS=1`; without that flag the checked-in config can
start both services automatically. The browser project uses Chromium at
1440x900, 1024x768, and 390x844. The responsive test also exercises the
768–991px CSS branch at 900px and a 320px narrow smoke check.

## 6. Final results

| Evidence group | Executed evidence | Final result |
|---|---|---|
| Unit, API, and database | `server`: 12 test files / 56 tests | Pass |
| UI and style | `client`: 6 test files / 26 tests | Pass |
| Server build | `server/npm.cmd run build` | Pass |
| Client build | `client/npm.cmd run build` | Pass |
| Responsive | `responsive-layout.spec.ts`: desktop, tablet, mobile, 900px branch, and 320px smoke check | Pass |
| Visual QA | `visual-qa.spec.ts`, Zen token/state assertions, and completed checklist | Pass |
| E2E | `requester-ticket-flow.spec.ts` plus responsive/visual specs: 9/9 | Pass |
| Screenshot evidence | 12 PNG files under `artifacts/lab-02/screenshots/` | Pass |
| AC traceability | AC-01 through AC-26 each has an executed test reference in Section 3 | Pass |

All required automated checks completed without skipped tests. The final
traceability table records at least one passing test for every AC and the
responsive run produced the twelve screenshot files required by `ui-spec.md`.

## 7. Known limitations or deferred tests

- Real authentication, authenticated download authorization, and role-based
  authorization are intentionally deferred to Lab 3; Lab 2 tests the explicit
  Development Requester context and backend ownership comparison.
- Production antivirus scanning, object-storage lifecycle policy, and a
  full-text search index are deferred. The MVP storage adapter and search
  behavior remain subject to the fixed API contract.
- Real authentication, production antivirus scanning, object-storage policy,
  and a full-text search index remain outside Lab 2. These are not blockers for
  the requester-context and ownership contract tested here.
