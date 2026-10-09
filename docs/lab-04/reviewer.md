# Lab 4 — Peer Review Record  (fill this in)

**Author:** <Vera Intharathang> — <67070501043> — GitHub: @Ttime52
**Peer reviewer:** <Kwanchanok Thungsuk> — <67070501006> — GitHub: @KwanchanokThungsuk

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict |
|----|--------|------------------|
|  #63  | feature/22-specification-docs-lab4 | Request changes and Approved |
|  #64  | feature/23-actions-taken-model | Request changes and Approved |
|  #65  | feature/24-actions-taken-api |  |
|  #66  | feature/25-actions-taken-ui |  |
|  #67  | feature/26-ticket-workflow |  |
|  #68  | feature/27-dashboards |  |
|  #69  | feature/28-final-regression-release |  |

PR #63 feature/22-specification-docs-lab4
https://github.com/Ttime52/toktickit/pull/63

- Reviewer comment I received: Please align the stale-write HTTP status mapping across specification.md, api-spec.md, ui-spec.md, and tests.md, and standardize Action terminology/field naming. Also make the client-editable Action Date/Time behavior explicit as a project design decision.
- How I responded: Align stale-write HTTP status code mappings across all files:
Malformed precondition -> 400 VALIDATION_ERROR
Missing If-Match/expectedTicketVersion -> 428 PRECONDITION_REQUIRED
Stale ETag/version -> 412 STALE_WRITE
Changed idempotency payload -> 409 IDEMPOTENCY_KEY_REUSED
Standardize terminology to "Action Taken" (including ActionTaken model and all 7 JSON fields).
Clarify actionAt behavior: editable by IT Staff/Admin, read-only for Requester. UI uses Asia/Bangkok and sends explicit UTC without auto-updating to current time on edit.
Add UI-to-API field mapping and update test cases to cover these behaviors and codes.
Resolve Administrator ambiguity to retain the existing IT Priority control.
- Reviewer comment I received: The latest fixes are clear and consistent across the Lab 4 documentation. The remaining test coverage notes are minor and do not block approval. Approved.

PR #64 feature/23-actions-taken-model
https://github.com/Ttime52/toktickit/pull/64

- Reviewer comment I received: Everything looks good overall. One small consistency issue remains: the spec uses TIMESTAMPTZ, while the Prisma schema/migration use TIMESTAMP(3). Please align these so the documentation matches the implementation.
- How I responded: Already fixed the Prisma schema/migration to use the timestamptz. ple re-check.
- Reviewer comment I received: Approved. Everything looks good overall. The remaining TIMESTAMP(3) vs TIMESTAMPTZ mismatch is minor and can be cleaned up later.
- How I responded: the TIMESTAMP(3) that mismatched is the Lab1-3 implementation so I didn't want to change that but if it will affect in further implementation, i will clean it up later. Thank for reviewing.

PR #65 feature/24-actions-taken-api
https://github.com/Ttime52/toktickit/pull/65

- Reviewer comment I received: 
- How I responded:

PR #66 feature/25-actions-taken-ui
https://github.com/Ttime52/toktickit/pull/66

- Reviewer comment I received: 
- How I responded:

PR #67 feature/26-ticket-workflow
https://github.com/Ttime52/toktickit/pull/67

- Reviewer comment I received: 
- How I responded:

PR #68 feature/27-dashboards
https://github.com/Ttime52/toktickit/pull/68

- Reviewer comment I received: 
- How I responded:

PR #69 feature/28-final-regression-release
https://github.com/Ttime52/toktickit/pull/69

- Reviewer comment I received: 
- How I responded:

## Pull Requests I reviewed for my partner

PR #71 feature/27-sprint4-contract-test-plan
https://github.com/KwanchanokThungsuk/toktickit/pull/71
- My comment: The Sprint 4 contract and test plan are comprehensive overall, but I found two areas that should be resolved before implementation:
1. The Lab requires duplicate Actions caused by repeated clicks or network retries to be prevented or safely handled. AC-15/E2E currently expect equivalent retries to produce only one Action, but the API contract still makes requestKey/backend uniqueness optional and otherwise relies mainly on the pending UI state. Please define one deterministic backend retry/idempotency behavior so the API contract, AC, and tests agree.
2. The Lab submission criteria explicitly require “append-only behavior.” The current DD-03 interprets this as applying only to Public Comments/Internal Notes, while Completed/Cancelled Actions can still have their business content edited without an audit history. Please clarify what the Lab 4 append-only requirement maps to and adjust the Action lifecycle/audit behavior accordingly.
Minor: reviewer.md currently labels Issues #64 and #65 as PRs and contains a lab3 branch name; this should be corrected as the Lab 4 review record is built.
- Partner's response: Thanks for the feedback. I addressed both issues in the Sprint 4 contract.
1. Action creation now has deterministic backend idempotency. Every create request requires a client-generated requestKey, and the backend enforces uniqueness by Ticket, authenticated creator, and request key. The first request creates the Action with 201; a retry with the same key returns the existing Action with 200 and does not create a duplicate.
2. The append-only behavior is now explicitly defined for Actions Taken. Draft Actions remain editable, while Completed and Cancelled Actions are terminal and immutable. Corrections or additional work must be recorded as a new Action, and there is no Action delete endpoint.
I also simplified the resolution gate so it requires at least one Completed Action with a nonblank Result and no Draft Actions. Follow-Up Required remains informational and does not independently block resolution.
The related specification, API contract, UI behavior, Acceptance Criteria, and planned tests were updated for consistency. I also corrected the Lab 4 reviewer metadata so Issues and PRs are no longer mislabeled and no Lab 3 branch references remain.
- My comment: The previous concerns are resolved. Approved.

PR #72 feature/28-actions-taken-foundation
https://github.com/KwanchanokThungsuk/toktickit/pull/72
- My comment: The Actions Taken backend foundation is strong overall, but I found three consistency/completion issues before approval:

1. The Action API currently returns the raw Prisma object (safeAction returns the object unchanged), so the actual response exposes internal fields such as requestKey/foreign-key IDs and uses creator, performer, and assignee, while the approved API contract defines createdBy, performedBy, and assignedTo and excludes private implementation data. Please serialize the documented Action DTO explicitly and cover the response shape in tests.
2. The Lab 4 required seed data calls for realistic Tickets covering the major Ticket statuses. The current clean seed only creates NEW, OPEN, and IN_PROGRESS Tickets. Please extend the seed/status coverage while keeping the existing zero/one/multiple Action fixtures.
3. docs/lab-04/reviewer.md still links PR #64/#65 and contains feature/27-lab3-spec-contract, although the actual Lab 4 PRs are #71/#72. Please correct the review evidence.
The migration preservation, authorization, Action lifecycle, idempotency, terminal immutability, and stale-update handling otherwise look aligned with the Lab 4 requirements.
- Partner's response: Thanks for the review. I’ve addressed both requested fixes:

1. The Actions Taken API now uses an explicit DTO serializer for all GET/POST/PATCH and retry/recovery paths, exposing createdBy, performedBy, and assignedTo while hiding internal fields such as requestKey and raw foreign-key IDs.
2. The seed now covers all eight Ticket statuses while preserving the existing 0/1/multiple Action fixtures, with updated seed integration coverage.
3. fixed reveiwer.md
I also re-ran the full local verification successfully: 17/17 test files passed and 100/100 tests passed. Build and Prisma validation also pass.
- My comment: The previous blockers are resolved: the API now returns the documented safe Action DTO without internal fields, and the seed data covers all required Ticket statuses while preserving zero/one/multiple Action fixtures. Authorization, idempotency, stale-update handling, terminal immutability, validation, and migration/regression coverage are also aligned with the Lab 4 requirements.
Approved.