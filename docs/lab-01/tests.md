# Lab 1 — Test Plan and Evidence  (fill this in)

All test files live under server/tests/lab-01/ and client/tests/lab-01/.

| # | Tool | Test | Result |
|---|------|------|--------|
| 1 | Supertest | GET /api/health returns 200, status=ok | |
| 2 | Supertest | GET /api/categories returns 4 seeded categories in id order | |
| 3 | Vitest | Heading renders | |
| 4 | Vitest | Success state shows Online + category list | |
| 5 | Vitest | Error state shows Offline + message | |

Paste your passing terminal output / screenshot below.

------------------------------------------
# Test1
| 1 | Supertest | GET /api/health returns 200, status=ok | |

![alt text](image.png)

> toktickit-server@1.0.0 test
> vitest run


 RUN  v2.1.9 D:/GitHub/toktickit/server

 ↓ tests/lab-01/categories.test.ts (1) [skipped]
 ✓ tests/lab-01/health.test.ts (1)

 Test Files  1 passed | 1 skipped (2)
      Tests  1 passed | 1 todo (2)
   Start at  13:34:02
   Duration  643ms (transform 68ms, setup 0ms, collect 373ms, tests 14ms, environment 1ms, prepare 304ms)
------------------------------------------