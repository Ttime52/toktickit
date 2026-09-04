# Lab 2 — Peer Review Record  (fill this in)

**Author:** <Vera Intharathang> — <67070501043> — GitHub: @Ttime52
**Peer reviewer:** <Kwanchanok Thungsuk> — <67070501006> — GitHub: @KwanchanokThungsuk

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict |
|----|--------|------------------|
|  #23  | feature/5-specification-docs | Approved |
|  #24  | feature/6-data-model-seed | Approved |
|  #25  | feature/7-requester-context | Approved |
|  #26  | feature/8-create-ticket |  |
|  #27  | feature/9-my-tickets |  |
|  #28  | feature/10-ticket-detail-attachments |  |
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
- Partner's response: 

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
- Partner's response:
- My comment: