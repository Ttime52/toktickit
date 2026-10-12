# Lab 4 — Peer Review Record

**Author:** <Vera Intharathang> — <67070501043> — GitHub: @Ttime52
**Peer reviewer:** <Kwanchanok Thungsuk> — <67070501006> — GitHub: @KwanchanokThungsuk

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict |
|----|--------|------------------|
|  #63  | feature/22-specification-docs-lab4 | Request changes and Approved |
|  #64  | feature/23-actions-taken-model | Request changes and Approved |
|  #65  | feature/24-actions-taken-api | Request changes and Approved |
|  #66  | feature/25-actions-taken-ui | Request changes and Approved |
|  #67  | feature/26-ticket-workflow | Request changes and Approved |
|  #68  | feature/27-dashboards | Request changes and Approved |
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

- Reviewer comment I received: Requesting changes because the implementation does not yet match the documented concurrency/idempotency contract.

Main blockers:

1. Idempotency-Key is optional but documented as required.
2. Ticket/Action If-Match preconditions are optional, with missing versions defaulting to current DB versions.
3. Idempotency uses a process-local Map instead of durable persistence.
4. Tests do not cover missing/malformed/stale preconditions, replay/conflict behavior, or rollback safety.
Authorization and basic create/read/update behavior look correct. The Lab 1/2 failures appear to be pre-existing baseline failures rather than regressions from this PR.
- How I responded: Summary

Enforced Idempotency-Key, If-Match, and expectedTicketVersion according to the API contract
Added durable idempotency persistence using PostgreSQL transactions
Properly handled replay/conflict and stale-write scenarios (HTTP 409, 412, 428)
Implemented Ticket/Action ETags and optimistic concurrency control
Added integration tests for preconditions, replays, conflicts, and rollback safety
Testing

npm run build passed
Lab 3/4: 39 tests passed
Lab 1/2: Still contains the original baseline failures as noted in the PR review
- Reviewer comment I received: everything look good. Approved.

PR #66 feature/25-actions-taken-ui
https://github.com/Ttime52/toktickit/pull/66

- Reviewer comment I received: The backend/setup side looks good and I was able to reproduce the fresh database setup after regenerating Prisma Client.
The remaining concerns are on the UI test coverage: stale-write recovery/idempotent retry, Staff/Admin integration, and documented validation boundaries are still not fully covered.
I’d like those tests added before approval.
- How I responded: Added UI test coverage. pls re-check.
- Reviewer comment I received: Thanks for the update. I re-checked the added UI coverage and the main concerns from my previous review are now addressed: stale-write recovery, idempotent retry behavior, and Staff/Admin integration are covered.
I’m approving this PR.

PR #67 feature/26-ticket-workflow
https://github.com/Ttime52/toktickit/pull/67

- Reviewer comment I received: I found one remaining contract mismatch in the workflow UI.
The Lab 4 UI spec requires the Resolved and Closed status changes to use a confirmation dialog with the required evidence, confirmation checkbox, and keyboard/focus behavior.
The current implementation renders those controls inline in the Work Controls section instead of using the required dialog.
Please update the Resolved/Closed workflow UI to match the documented confirmation-dialog behavior before approval.
- How I responded: Fixed the Resolved and Closed status changes to use a confirmation dialog with the required evidence, confirmation checkbox, and keyboard/focus behavior. Ready to re-review.
- Reviewer comment I received: Re-reviewed the Resolved/Closed workflow fix. The inline formal-transition controls have been replaced with an accessible confirmation dialog that provides the documented status context, evidence field, confirmation checkbox, Cancel/Confirm actions, focus trapping, and focus restoration. The Resolved dialog flow is covered by the focused client test, and the client build passes.
The only remaining suggestion is non-blocking: add direct regression coverage for the Closed dialog variant and Cancel-without-mutation behavior. Approved.
- How I responded: 
1. Added direct coverage for the Closed dialog variant and Closure Summary.
2. Added Cancel-without-mutation coverage, verifying no PATCH request is sent and status remains unchanged.
3. Existing focus-trap test remains covered.
- Reviewer comment I received: good good my friend.

PR #68 feature/27-dashboards
https://github.com/Ttime52/toktickit/pull/68

- Reviewer comment I received: Dashboard drill-down windows are not tied to the dashboard snapshot.
The dashboard captures a fixed asOf value for its metrics, but the drill-down links use relative filters such as updatedWithin=7d / resolvedWithin=7d, and the destination list recomputes the window at request time. This can cause the card count and drill-down results to disagree around the reporting boundary. The drill-down should preserve the exact server-captured window used for the dashboard metrics.
- How I responded: Implemented the dashboard drill-down snapshot fix. Please recheck again.
- Reviewer comment I received: Rechecked the dashboard drill-down snapshot fix on feature/27-dashboards.

The implementation now preserves the dashboard’s exact windowStart and windowEnd in the time-window drill-down links, and the destination queries use those supplied bounds instead of recomputing a later relative 7-day window.

This resolves the original concern where dashboard card counts and drill-down results could disagree around the reporting boundary.

The remaining test-coverage gaps are non-blocking from my side.

Approved.

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

PR #73 feature/29-actions-taken-ui
https://github.com/KwanchanokThungsuk/toktickit/pull/73
- My comment: The Actions Taken UI is well covered overall, but I found two consistency/recovery issues before approval:

1. AdminTicketInspection still describes the page as “Read-only inspection”, while Lab 4 now permits Administrators to create/update Actions Taken and this PR exposes those controls. Please update the page messaging so it matches the actual Lab 4 permissions.
2. TICKET_NOT_ACTIVE recovery is not fully connected to the real Ticket Detail state. The Actions panel preserves the local draft and refreshes the Actions list, but it does not refresh the parent Ticket status. Therefore, if another user closes/resolves/cancels the Ticket, the page can still show the stale active status while telling the user to reopen it. The component test currently simulates recovery by manually rerendering with CLOSED then OPEN, which does not represent the actual application wiring. Please refresh/synchronize the authoritative Ticket status after this conflict while preserving the Action draft.
- Partner's response: Addressed both review comments.

1. Admin messaging
    - Updated AdminTicketInspection so it no longer describes the whole page as read-only.
    - The page now clarifies that Ticket details are read-only, while Administrators can still update IT Priority and manage Actions Taken.
2. TICKET_NOT_ACTIVE recovery
    - ActionsTakenPanel now requests an authoritative Ticket refresh from the parent when an Action mutation returns TICKET_NOT_ACTIVE.
    - The panel still preserves the current Action draft and refreshes the Actions list.
    - Staff, Admin, and Requester Ticket Detail parents now refetch the Ticket detail and pass the refreshed currentStatus back into the Actions panel.
    - While the Ticket is inactive, Actions Taken stays read-only.
    - When the Ticket is reopened and the authoritative status becomes active again, write controls are restored without losing the local draft.

Tests were also updated to verify the real callback -> Ticket refetch -> refreshed status flow instead of relying only on manual prop rerendering.

Verification:
Full client suite: 15 files / 107 tests passed
Build passed
git diff --check passed
- My comment: the Administrator inspection messaging now matches the permitted Actions Taken behavior, and TICKET_NOT_ACTIVE recovery now refreshes the authoritative parent Ticket status while preserving the user's unsaved Action draft. The updated tests also cover the recovery wiring.
Approved.

PR #74 feature/30-complete-ticket-workflow
https://github.com/KwanchanokThungsuk/toktickit/pull/74
- My comment: The backend enforces the documented status-transition matrix, resolution gate, Requester advisory behavior, Administrator operational permissions, version-based stale-update protection, and Ticket cancellation behavior for Draft Actions. The Staff/Admin UI also exposes only permitted workflow transitions and refreshes authoritative Ticket state.
No blocking workflow issues found.
- Partner's response: Merged.

PR #75 feature/31-it-staff-requester-dashboards
https://github.com/KwanchanokThungsuk/toktickit/pull/75
- My comment: I found a few issues in the Dashboard → Ticket flow that should be fixed before approval.

1. Requester Recently Resolved drill-down fails
The dashboard sends recentlyResolvedFrom/To, but MyTickets also adds the default sortBy and sortOrder. The backend rejects this combination, so the page can return 400 INVALID_QUERY.
2. Requester filters can conflict after drill-down
If the user enters My Tickets with statusGroup=active and then selects a specific currentStatus, both filters are kept. The backend rejects statusGroup + currentStatus.
3. Admin cannot open Ticket Detail from the new dashboard
Admin dashboard links use #/staff/tickets/:id, which renders StaffTicketDetail and calls GET /api/staff/tickets/:id. However, that endpoint still uses the staff-only guard, so Administrators are rejected even though the UI routes them there.
Please normalize/clear mutually exclusive Requester filters, allow Administrator access to the operational Ticket Detail endpoint, and add tests for the full Dashboard → Ticket/List flows.
The rest of the dashboard metrics, ownership scoping, empty/error states, and drill-down definitions look good.
- Partner's response: Thanks for the review. I fixed all three Dashboard → Ticket flow issues:
Recently Resolved no longer sends conflicting sortBy / sortOrder.
Selecting a specific Requester status clears statusGroup.
Administrator can open operational Ticket Detail and use the related operational actions.
I also added Dashboard → destination flow coverage and authorization regression tests.
Verification is green:
Client: 133/133 tests passed
Server: 130/130 tests passed
Client/server builds passed
Prisma validation passed
git diff --check passed
Ready for re-review.
- My comment: The previous dashboard issues are fixed. One filter conflict still remains:
After opening Recently Resolved, selecting a Current Status keeps recentlyResolvedFrom/To and adds currentStatus. The backend rejects this combination with 400 Conflicting recently resolved filters.
Please clear the recently-resolved date filters when an exact status is selected (or otherwise prevent this conflicting combination), and add a test for this interaction.
Moreover, this commit accidentally includes server/cookies.txt, which was generated by curl. Please remove this file and add cookies.txt to .gitignore to avoid accidentally committing session cookies in the future.
Everything else from the previous review looks resolved.

- Partner's response: Fixed the remaining review items:
Selecting an exact Current Status after entering Recently Resolved now clears recentlyResolvedFrom, recentlyResolvedTo, and statusGroup, preventing the conflicting requester query.
Added regression coverage for the Dashboard → Recently Resolved → exact status flow.
Removed server/cookies.txt from tracking and added it to .gitignore.
Verification is green:
Client: 134/134
Server: 130/130
Client/server builds passed
Prisma validation passed
git diff --check passed
Ready for re-review.
- My comment: Rechecked the latest changes. The previous issues are resolved: Recently Resolved filters are now cleared correctly when selecting an exact status, Admin can open operational Ticket Detail, the related regression tests were added, and the generated cookies.txt file has been removed and ignored.
Approved.

PR #76 feature/32-lab4-tests-regression
https://github.com/KwanchanokThungsuk/toktickit/pull/76
- My comment: The added tests cover the remaining Action ordering/ownership, field boundaries and no-partial-mutation behavior, terminal Action immutability, forced-password authorization, and duplicate-submit protection. The test evidence and AC traceability were also updated consistently.
The remaining browser E2E, responsive/accessibility, performance, and final release evidence are clearly documented as future Issue 33 work.
No blocking issues found. Approved.
- Partner's response: Merged.

PR #77 feature/33-final-regression-accessibility-release
https://github.com/KwanchanokThungsuk/toktickit/pull/77
- My comment: The final regression and release evidence looks strong overall, but I found two remaining cleanup issues before approval:

1. server/tests/helpers/migration-test-database.ts still hard-codes PostgreSQL executables under /Applications/Postgres.app/.... This causes the migration/seed regression tests to fail on non-macOS environments even though the README only requires PostgreSQL generally. Since this is the final regression/release PR, please make these commands portable/configurable (for example, use psql, createdb, and dropdb from PATH) or document the required environment consistently.
2. docs/lab-04/reviewer.md still lists PR #71 as feature/27-lab3-spec-contract, while the actual branch was feature/27-sprint4-contract-test-plan. The PR #76 detail section is also still blank even though it is marked Approved in the summary. Please clean up the final peer-review evidence so it accurately matches the PR history.
The E2E, responsive, accessibility, screenshot, performance, and AI-use evidence otherwise look complete and consistent.
- Partner's response: Thanks for the review. I fixed the remaining cleanup items:

Replaced the macOS-specific PostgreSQL CLI paths with PATH-resolved psql, createdb, and dropdb.
Updated the Lab 3/4 migration regression tests to use the shared portable helper.
Corrected the Lab 4 reviewer evidence for PR docs: define Lab 4 engineering contract and test plan #71 and PR test(lab4): complete issue 32 regression coverage #76.
Also corrected my partner's name in the Lab 1, Lab 2, and Lab 3 reviewer headers; those are documentation-only fixes.
Relevant migration/seed checks, server build, Prisma validation, and git diff --check all pass.

Please recheck PR #77.
- My comment: Rechecked the latest changes. The previous issues are resolved: the PostgreSQL migration test helper now uses portable CLI commands from PATH instead of the macOS-only Postgres.app paths, and the peer-review evidence in reviewer.md has been corrected and completed.
No remaining blocking issues found.
