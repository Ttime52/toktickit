# Lab 3 — Peer Review Record  (fill this in)

**Author:** <Vera Intharathang> — <67070501043> — GitHub: @Ttime52
**Peer reviewer:** <Kwanchanok Thungsuk> — <67070501006> — GitHub: @KwanchanokThungsuk

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict |
|----|--------|------------------|
|  #44  | feature/13-specification-docs-lab3 |  |
|  #  | feature/14-user-model-migration |  |
|  #  | feature/15-auth-foundation |  |
|  #  | feature/16-requester-regression |  |
|  #  | feature/17-staff-ticket-queue |  |
|  #  | feature/18-staff-ticket-operations |  |
|  #  | feature/19-admin-user-management |  |
|  #  | feature/20-e2e-regression-qa |  |
|  #  | feature/21-docs-release-lab3 |  |

PR # feature/13-specification-docs-lab3

- Reviewer comment I received: 
1. Create User activation state mismatch
UI Spec allows selecting Active/Inactive when creating a user, but POST /api/admin/users does not define an active request field and currently defaults to active. Please make the UI/API contract consistent.

2. Create User acceptance/test coverage
AC-28 currently verifies creation and one-role assignment, but does not explicitly cover the required initial password and activation state. Please update the AC and add corresponding tests/traceability.

Overall review:
I reviewed the other parts of the Lab 3 specification, API specification, UI specification, and test plan against the Lab 3 requirements. The remaining sections look consistent and cover the required functionality. I only found the two issues above that need clarification/update.
- How I responded: thx. I will fix it.

## Pull Requests I reviewed for my partner

feature/17-lab3-spec-contract
https://github.com/KwanchanokThungsuk/toktickit/pull/51
- My comment: Overall the Lab 3 engineering contract covers the required scope well, but I found a few inconsistencies that should be resolved before approval.
- AC-09 allows Administrator access to the Ticket Queue, while the authorization matrix and API contract explicitly restrict the Queue to IT Staff. Please make the acceptance criterion consistent with the approved authorization rules.
- The authentication contract still leaves session expiration, cookie/CSRF decisions as future implementation choices. The Lab 3 sheet requires these decisions to be defined in the API/engineering contract before implementation.
- Public Comment and Internal Note maximum lengths are referenced but not actually defined. The Lab sheet requires justified length limits to be specified.
- Partner's response: docs: finalize lab 3 engineering contract
- My comment: The specification, API contract, ui-spec, and test traceability are now consistent with the required Lab 3 scope.