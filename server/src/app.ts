import express, { Request, Response } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
// getPrisma() is your lazy database handle. Call it INSIDE a route when you
// need the DB (Issue 4). It is intentionally unused until then.
void getPrisma;

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());          // already wired: lets the Vite dev server call this API
app.use(express.json());

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// Make the test in tests/lab-01/health.test.ts pass.
// It must return HTTP 200 with JSON: { status: "ok", service: "TokTickIT API" }
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  // TODO(Issue 2): replace this stub with the required 200 response.
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

// ---------------------------------------------------------------------------
// Issue 3 - Development Requester selector
// The requester is a temporary Lab 2 testing context, not authentication.
// Keep the documented route and the short compatibility alias requested by
// the issue description on the same handler.
// ---------------------------------------------------------------------------
async function listActiveDevelopmentRequesters(
  req: Request,
  res: Response,
) {
  const active = req.query.active;

  if (active !== undefined && (typeof active !== "string" || active !== "true")) {
    res.status(400).json({
      error: {
        code: "INVALID_QUERY_PARAMETER",
        message: "The active query parameter must be true.",
      },
    });
    return;
  }

  try {
    const requesters = await getPrisma().developmentRequester.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true, email: true },
      orderBy: { id: "asc" },
    });

    res.status(200).json(requesters);
  } catch {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to load Development Requesters.",
      },
    });
  }
}

app.get("/api/development-requesters", listActiveDevelopmentRequesters);
app.get("/api/requesters", listActiveDevelopmentRequesters);

// ---------------------------------------------------------------------------
// Issue 4 - Category list
// Add:  GET /api/categories
//   -> read categories from PostgreSQL via getPrisma().category.findMany(...)
//   -> return each { id, name } in a predictable (id) order
//   -> on failure, respond 500 with a safe message (no internal details)
// TODO(Issue 4): implement the route here.
app.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await getPrisma().category.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });

    res.status(200).json(categories);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});
// ---------------------------------------------------------------------------

export default app;
