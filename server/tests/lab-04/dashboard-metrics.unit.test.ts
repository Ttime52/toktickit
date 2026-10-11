import { describe, expect, it } from "vitest";

import {
  dashboardWindowFor,
  REPORT_TIME_ZONE,
  serializeDashboardWindow,
} from "../../src/dashboard-window.js";
import { parseDashboardQuery } from "../../src/dashboard-service.js";

describe("Issue 27 dashboard metric boundaries (UNIT-04)", () => {
  it("uses the Asia/Bangkok half-open 7-day calendar window", () => {
    const asOf = new Date("2026-10-07T16:59:59.999Z");
    const window = dashboardWindowFor(asOf);

    expect(REPORT_TIME_ZONE).toBe("Asia/Bangkok");
    expect(serializeDashboardWindow(window)).toEqual({
      key: "7d",
      start: "2026-09-30T17:00:00.000Z",
      end: "2026-10-07T17:00:00.000Z",
    });
  });

  it("moves the boundary to the next Bangkok calendar day after midnight", () => {
    const window = dashboardWindowFor(new Date("2026-10-07T17:00:00.000Z"));
    expect(window.start.toISOString()).toBe("2026-10-01T17:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-10-08T17:00:00.000Z");
  });

  it("accepts only the documented window and rejects forged selectors", () => {
    expect(parseDashboardQuery({})).toEqual({ ok: true, value: "7d" });
    expect(parseDashboardQuery({ window: "7d" })).toEqual({ ok: true, value: "7d" });

    const invalidWindow = parseDashboardQuery({ window: "30d" });
    expect(invalidWindow.ok).toBe(false);
    if (!invalidWindow.ok) expect(invalidWindow.error.code).toBe("INVALID_QUERY_PARAMETER");

    const forgedUser = parseDashboardQuery({ userId: "999" });
    expect(forgedUser.ok).toBe(false);
    if (!forgedUser.ok) expect(forgedUser.error.fields).toHaveProperty("userId");
  });
});

