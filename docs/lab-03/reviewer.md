# Lab 3 — Peer Review Record  (fill this in)

**Author:** <Vera Intharathang> — <67070501043> — GitHub: @Ttime52
**Peer reviewer:** <Kwanchanok Thungsuk> — <67070501006> — GitHub: @KwanchanokThungsuk

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict |
|----|--------|------------------|
|  #44  | feature/13-specification-docs-lab3 | Request changes and Approved |
|  #45  | feature/14-user-model-migration | Request changes and Approved |
|  #46  | feature/15-auth-foundation | Request changes and Approved |
|  #47  | feature/16-requester-regression | Approved |
|  #48  | feature/17-staff-ticket-queue |  |
|  #49  | feature/18-staff-ticket-operations |  |
|  #50  | feature/19-admin-user-management |  |
|  #51  | feature/20-e2e-regression-qa |  |
|  #52  | feature/21-docs-release-lab3 |  |

PR #44 feature/13-specification-docs-lab3
https://github.com/Ttime52/toktickit/pull/44

- Reviewer comment I received: 
1. Create User activation state mismatch
UI Spec allows selecting Active/Inactive when creating a user, but POST /api/admin/users does not define an active request field and currently defaults to active. Please make the UI/API contract consistent.

2. Create User acceptance/test coverage
AC-28 currently verifies creation and one-role assignment, but does not explicitly cover the required initial password and activation state. Please update the AC and add corresponding tests/traceability.

Overall review:
I reviewed the other parts of the Lab 3 specification, API specification, UI specification, and test plan against the Lab 3 requirements. The remaining sections look consistent and cover the required functionality. I only found the two issues above that need clarification/update.
- How I responded: thx. I will fix it.
- Reviewer comment I received: Checked the requested changes. Everything looks good now. The two review issues have been addressed. Approved

PR #45 feature/14-user-model-migration
https://github.com/Ttime52/toktickit/pull/45

- Reviewer comment I received: I found one blocking issue regarding AC-09: the PR does not include the migration-regression.integration.test.ts referenced by docs/lab-03/tests.md for MIG-01 and MIG-02.
Please add the referenced migration/seed regression test, or update the test documentation to reflect the actual test evidence. The AC-09 coverage should demonstrate preservation of existing IDs/ownership/history, Ticket and Attachment relationships, itPriority backfill, required seed data, and safe/idempotent seed reruns without duplicate dat
- How I responded: Already add the migration.integration.test.ts. Pls recheck the PR.
- Reviewer comment I received: Everything looks good! Approved. 👍🏻

PR #46 feature/15-auth-foundation
https://github.com/Ttime52/toktickit/pull/46

- Reviewer comment I received: I reviewed the authentication flow and found a few things that need to be updated:

Requester identity
The client is still sending requesterId in the ticket/attachment flows. According to the Lab 3 spec, requester identity should come from the authenticated session and should not be provided by the client. Could you please update this flow to use the logged-in user's ID instead?

Legacy requester selection
The legacy requester-selection flow is still active in the client (RequesterContext, RequesterSelection, and fetchDevelopmentRequesters), and requester screens still use requesterId. Since Lab 3 replaces the Development Requester selector with authenticated identity, could you please remove or replace this flow so the requester is determined by the logged-in user?

Change Password validation
The Change Password UI currently says “At least 8 characters,” but the Lab 3 spec requires passwords to be 12–128 characters. Could you please update the client-side validation and displayed requirement to match the spec?
- How I responded: fixed it. Please review again kub.
- Reviewer comment I received: good good 😊 aprooved approved 🍎

PR #47 feature/16-requester-regression
https://github.com/Ttime52/toktickit/pull/47

- Reviewer comment I received: Approve — Reviewed the implementation against the Lab 3 documentation and relevant ownership, Public Comment, and Problem Appears Resolved requirements. No blocking implementation issues were found. The local regression test could not be executed because the review environment's database migration history differs from the PR branch.
- How I responded: Thx kub

PR #48 feature/17-staff-ticket-queue
https://github.com/Ttime52/toktickit/pull/48

- Reviewer comment I received: 
- How I responded:

PR #49 feature/18-staff-ticket-operations
https://github.com/Ttime52/toktickit/pull/49

- Reviewer comment I received: 
- How I responded:

PR #50 feature/19-admin-user-management
https://github.com/Ttime52/toktickit/pull/50

- Reviewer comment I received: 
- How I responded:

PR #51 feature/20-e2e-regression-qa
https://github.com/Ttime52/toktickit/pull/51

- Reviewer comment I received: 
- How I responded:

PR #52 feature/21-docs-release-lab3
https://github.com/Ttime52/toktickit/pull/52

- Reviewer comment I received: 
- How I responded:


## Pull Requests I reviewed for my partner

feature/17-lab3-spec-contract
https://github.com/KwanchanokThungsuk/toktickit/pull/51
- My comment: Overall the Lab 3 engineering contract covers the required scope well, but I found a few inconsistencies that should be resolved before approval.
- AC-09 allows Administrator access to the Ticket Queue, while the authorization matrix and API contract explicitly restrict the Queue to IT Staff. Please make the acceptance criterion consistent with the approved authorization rules.
- The authentication contract still leaves session expiration, cookie/CSRF decisions as future implementation choices. The Lab 3 sheet requires these decisions to be defined in the API/engineering contract before implementation.
- Public Comment and Internal Note maximum lengths are referenced but not actually defined. The Lab sheet requires justified length limits to be specified.
- Partner's response: docs: finalize lab 3 engineering contract
- My comment: The specification, API contract, ui-spec, and test traceability are now consistent with the required Lab 3 scope.

feature/18-authentication
https://github.com/KwanchanokThungsuk/toktickit/pull/52
- My comment: Authentication implementation is heading in the right direction, but I found a couple of issues that should be resolved before approval:
1. App.tsx still appears to contain the old RequesterProvider / RequesterSelection flow together with the new authenticated-user flow. Lab 3 requires the Development Requester selector and Change Requester behavior to be removed completely, with Requester identity coming from the authenticated account.
2. CreateTicket.tsx still performs the ticket POST directly and does not appear to include the authenticated credentials/CSRF mechanism used by the new API helpers. Please make this consistent with the Lab 3 authentication contract.
3. Please verify that the authentication tests cover the required negative/security cases such as invalid credentials, inactive users, mandatory first-password change, logout invalidation, and authenticated Requester ownership.
- Partner's response: Updated the implementation and tests based on the review feedback. All tests are passing. Please re-check the PR.
- My comment: Problems that should fix.
1. The Logout button is missing from the authenticated application shell. Lab 3 requires a Logout action that removes authenticated access. Please add the Logout button back and verify that after logout, protected pages/API cannot be accessed.
2. One authorization issue still needs to be addressed before approval. The Requester ticket and attachment endpoints currently use the authenticated user ID as the requester ID, but they do not verify that the authenticated user actually has the REQUESTER role. As a result, an IT Staff or Administrator account could call Requester APIs such as POST /api/tickets.
Lab 3 requires server-side role-based authorization, so please add a backend role check for Requester-only ticket/attachment operations and tests confirming that IT Staff and Administrator users receive 403 Forbidden.
- Partner's response: Fixed the remaining review feedback for Issue #18.
Added Logout and enforced REQUESTER-only authorization for requester ticket/attachment APIs. 🤤
- My comment: Things all fixed. Great jobbb👽

feature/19-staff-ticket-queue
https://github.com/KwanchanokThungsuk/toktickit/pull/53
- My comment: The Ticket Queue status filter does not include all Lab 3 ticket statuses. StaffTicketStatus and the Status dropdown currently only include NEW, OPEN, IN_PROGRESS, RESOLVED, and CLOSED, while Lab 3 requires WAITING_FOR_REQUESTER, REOPENED, and CANCELLED as well.

Please update the Queue status type/filter to support all required Lab 3 statuses and add/update the corresponding tests.
- Partner's response: fixed. pls recheck jubb🫪
- My comment: The previous issue with missing ticket statuses has been resolved. All good.

feature/20-staff-ticket-detail
https://github.com/KwanchanokThungsuk/toktickit/pull/54
- My comment: The ownership and Requester “Problem Appears Resolved” flows look aligned with the Lab 3 requirements, including backend authorization and negative-case coverage.
- Partner's response: Merged.
