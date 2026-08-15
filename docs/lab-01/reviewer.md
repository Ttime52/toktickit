# Lab 1 — Peer Review Record  (fill this in)

**Author:** <Vera Intharathang> — <67070501043> — GitHub: @<Ttime52>
**Peer reviewer:** <Kwanchanok Thungsuk> — <67070501006> — GitHub: @<KwanchanokThungsuk>

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict |
|----|--------|------------------|
|  #5  | feature/1-project-foundation | Approved |
|  #6  | feature/2-health-check | Approved |
|  #7  | feature/3-category-seed | Approved |
|  #8  | feature/4-category-list | Approved |

PR #5 feature/1-project-foundation
Reviewer comment I received: <Everything looks great Both the frontend and backend work fine. I also tested it locally on both the client and server, and the results are correct. No .env files or secrets were committed.>
How I responded: <Merged>

PR #6 feature/2-health-check
Reviewer comment I received: <The GET /api/health status has already been changed from 501 to 200, and everything else looks good according to Issue 2. I don't see any issues with your branch.>
How I responded: <Merged>

PR #7 feature/3-category-seed
Reviewer comment I received: <look good. The schema.prisma structure is correct, and seed.ts has no error and don't have .env file. Overall, everything looks great.>
How I responded: <Merged.>

PR #8 feature/4-category-list
Reviewer comment I received: <Both the frontend and backend are implemented correctly, and all tests (Vitest and Supertest) are passing successfully.>
How I responded: <Noted. Ready to merge.>

## Pull Requests I reviewed for my partner
feature/1-project-foundation
My comment: <There is no problem.
Opinion:
Frontend and Backend work successfully and Bootstrap is installed.
No secrets committed.>
Partner's response: <Merged>

feature/2-health-check
My comment: <Supertest passed successfully (HTTP returns 200) but the frontend didn't return an error message (backend status). pls fix that>
Partner's response: <fix(frontend): implement backend status and error UI>
My comment: <Supertest test passed successfully. The React page displays the backend status and error message correctly. Everything now passed the criteria. Great job!>

feature/3-category-seed
My comment: <The Prisma Category structure is correct. There is no problem with the seed and no database credentials committed>
Partner's response: <Merged>

feature/4-category-list
My comment: <GET /api/categories retrieves categories correctly. The frontend return the categories successfully and has useful error message. There is no problem with the Vitest and Supertest test.>
Partner's response: <Merged>
