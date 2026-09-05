# Lab 2 — Peer Review Record  (fill this in)

**Author:** <Vera Intharathang> — <67070501043> — GitHub: @Ttime52
**Peer reviewer:** <Kwanchanok Thungsuk> — <67070501006> — GitHub: @KwanchanokThungsuk

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict |
|----|--------|------------------|
|  #23  | feature/5-specification-docs | Approved |
|  #24  | feature/6-data-model-seed | Approved |
|  #25  | feature/7-requester-context | Approved |
|  #26  | feature/8-create-ticket | Request changes and Approved |
|  #27  | feature/9-my-tickets | Approved |
|  #28  | feature/10-ticket-detail-attachments | Request changes and Approved |
|  #29  | feature/11-e2e-visual-qa |  |
|  #30  | feature/12-docs-release |  |

PR #23 feature/5-specification-docs
https://github.com/Ttime52/toktickit/pull/23

- Reviewer comment I received: Great work getting the engineering contract together. The ACs, test plans, and API routes all match the Lab 2 requirements perfectly.
- How I responded: Thank you for merging!

PR #24 feature/6-data-model-seed
https://github.com/Ttime52/toktickit/pull/24

- Reviewer comment I received: I've reviewed the code and ran schema.integration.test.ts locally. All tests passed successfully. The database schema, tables, and constraints are fully implemented according to the lab requirements. The seed system also perfectly satisfies AC-26. Approved! This is ready to be merged into lab2-staging.
- How I responded: Thank you for the review!

PR #25 feature/7-requester-context
https://github.com/Ttime52/toktickit/pull/25

- Reviewer comment I received: tested the requester selection flow, persistence, validation, error/retry handling, backend and UI tests, and responsive layout. Everything passed and looks good.
- How I responded: Thank you reviewer.

PR #26 feature/8-create-ticket
https://github.com/Ttime52/toktickit/pull/26

- Reviewer comment I received: Reviewed & tested
AC-03/04: Active reference data and error/retry handling work correctly.
AC-05/06: Ticket creation, backend Ticket Number, UTC date, and NEW status work correctly.
AC-07/08: Validation and active Requester/Category/System checks work correctly.
AC-09: Idempotency tests passed and duplicate creation is prevented.
AC-10: Form data is preserved when the API/upload fails.
AC-16/17: Attachment type, signature, size, and 5-file limit validation work correctly.
One thing to verify: idempotency replay should still return the existing ticket with the same key/payload.
- How I responded: I already check the idempotency replay. It really need to fix. I will work on that. (feat: fix idempotentkey replay edge case)
- Reviewer comment I received: All relevant tests passed, including the idempotency replay fix and edge case. good good
- How I responded: Thank you so much kub.

PR #27 feature/9-my-tickets
https://github.com/Ttime52/toktickit/pull/27

- Reviewer comment I received: verall, the My Tickets implementation looks good and the main functionality works as expected. I tested the requester ownership filtering, search, filters, sorting, pagination, and empty states, and the tickets are correctly visible only to their corresponding requester.

A few minor suggestions:

The search placeholder currently mentions only ticket number, summary, and description, while the search also supports category and related system. Consider updating the placeholder to reflect that.

It may be worth adding test coverage for changing page size (10/20/50), responsive behavior on mobile/tablet, and sorting when multiple tickets have the same primary sort value.

These are minor improvements rather than blocking issues. Overall, I think the PR is in good shape.
- How I responded: Thank you for reviewing. I will consider the suggestion to be implemented in the next issue.

PR #28 feature/10-ticket-detail-attachments
https://github.com/Ttime52/toktickit/pull/28

- Reviewer comment I received: Tested the PR locally. All 56 tests passed, and the Ticket Detail and Attachment lifecycle flows are working as expected. The only issue I found is that View Ticket still shows “Ticket Detail is outside Issue 4” instead of navigating to the Ticket Detail page. Please update this flow; everything else looks good.
- How I responded: I will fix that. (
fix: fix navigate ticket detail)
- Reviewer comment I received: Tested the latest changes locally. Everything is working correctly now, including the View Ticket navigation to the Ticket Detail page. All 56 tests passed. Looks good to me
- How I responded: Thanks reviewer.

PR #29 feature/11-e2e-visual-qa
https://github.com/Ttime52/toktickit/pull/29

- Reviewer comment I received: 
- How I responded: 

PR #30 feature/12-docs-release
https://github.com/Ttime52/toktickit/pull/30

- Reviewer comment I received: 
- How I responded: 



## Pull Requests I reviewed for my partner

feature/5-lab2-spec-contract
https://github.com/KwanchanokThungsuk/toktickit/pull/13

- My comment: Everything looks fine but I have a suggestion: ui-spec.md, on topic 9.1 Layout, you might have "Current status" add to the filter bar. (so after this you should edit the api-spec.md and tests.md too.)
- Partner's response: Updated the specs to include the Current Status filter across ui-spec.md, api-spec.md, and tests.md as suggested. and I edited specification.md too.
- My comment: This is ok now. It's ready to merge.
- Partner's response: Thanks for review and mergeing 🫪

feature/6-data-model-seed
https://github.com/KwanchanokThungsuk/toktickit/pull/27

- My comment: Looks good. It aligned with the Lab 2 Sprint engineering contract.
- Partner's response: Merged.

feature/7-zen-green-foundation
https://github.com/KwanchanokThungsuk/toktickit/pull/28

- My comment: I see no problem. The test passed all correctly and the UI looks good.
- Partner's response: Thanks reviewer. ☺️

feature/8-requester-context
https://github.com/KwanchanokThungsuk/toktickit/pull/29

- My comment: The requester selector works well but I have a suggestion. According to the Lab 2 sheet, the Development Requester Selection screen must include the TokTickIT title and clearly explain that this selector is only for Lab 2 testing and is not a login/authentication screen. Currently it only says “Select Your Account,” which can make it look like a real login. Maybe you should add TokTickIT title and a short explanation that this selector is for Lab 2 testing only
- Partner's response: Ok I will fix it right here rigth now thanks.
- My comment: Very good. I will merge now.

feature/9-create-ticket-api
https://github.com/KwanchanokThungsuk/toktickit/pull/30

- My comment: I think this still needs some changes. requesterId should come from X-Requester-Id, not the request body, according to our API spec. There are also some missing backend validations such as description length, summary max length, requested priority, active category, and active related system. Also, ticket number generation is not inside the same transaction as ticket creation.
- Partner's response: feat: implement reference data and create ticket APIs with validation…- #30
- My comment: looks good. approved.

feature/10-create-ticket-ui
https://github.com/KwanchanokThungsuk/toktickit/pull/31

- My comment: UI overall looks good but, there are things need to fix. The Lab 2 sheet requires attachment validation on Create Ticket, but right now the file input does not check file type, 5 MB limit, max 5 files, or show an invalid-file error, and there is no test for it. Also the View Ticket button on the success screen currently does nothing. Moreover, the ui doesnt show files that are selected in attachments.
- Partner's response: feat: complete CreateTicket UI, attachment validation, and unit tests for Issue 10
- My comment: The attachment validation is fixed now, but the selected files are currently only validated and displayed in the UI. They are never uploaded after the ticket is created. There is still a TODO for uploading selectedFiles using the created ticket ID. According to the Lab 2 requirements, supporting attachments should actually be attached to the created ticket. Please complete the upload flow before merging.
- Partner's response: feat(ticket): implement attachment upload flow and fix lab 2 tests
- My comment: The upload flow is fixed now. One thing is still missing: the backend does not enforce file type, 5 MB limit, or max 5 active attachments. These are required by the Lab 2 sheet and should not rely only on frontend validation. Please add these checks and tests before merge.
- Partner's response: feat(ticket): enforce attachment validation rules and fix test suites
- My comment: The issues from my previous review are fixed now. The backend validates file type, 5 MB limit, and max 5 active attachments, and there are tests for these cases. Great job.

feature/11-my-tickets-api
https://github.com/KwanchanokThungsuk/toktickit/pull/32

- My comment: The filtering logic is implemented, but I don't see tests for categoryId, relatedSystemId, or requestedPriority yet. Please add coverage for these filters, including at least one combined-filter case. Moreover, api-spec.md says categories should be ordered by name ascending, but this changes it to id order and updates the test to match. Can we keep orderBy: { name: "asc" } so it still follows the API contract?
- Partner's response: I’ve fixed the comments on PR #11.
Added tests for categoryId, relatedSystemId, and requestedPriority filters.
Added a combined-filter test to verify the filters work with AND logic.
Changed the category ordering to name ASC to follow the api-spec.md contract.
Fixed the test setup to clear existing data before creating test data, avoiding duplicate/unique constraint errors.
- My comment: Looks good now. Fantastic job.

feature/12-my-tickets-ui
https://github.com/KwanchanokThungsuk/toktickit/pull/33

- My comment: Everything looks good. The main requirements for search, filters, sorting, pagination, requester switching, and the different UI states are covered.
- Partner's response: Merged.

feature/13-ticket-detail
https://github.com/KwanchanokThungsuk/toktickit/pull/34

- My comment: The ticket detail logic looks good and the ownership / 403 / 404 cases are covered, but this PR adds several .js and .jsx files even though the Lab 2 project is using TypeScript (.ts / .tsx). For example, RequesterTicketDetail.jsx and tickets.detail.get.js also import .ts files directly. Please change these new files to the TypeScript format used by the rest of the project before merging.
- Partner's response: 
fix: convert ticket detail to TypeScript
- My comment: The file type are correct now. Very good.