import { describe, expect, it } from "vitest";

import { STAFF_STATUS_TRANSITIONS } from "../../src/staff-ticket-detail-service.js";
import { TICKET_STATUSES, type TicketStatusValue } from "../../src/ticket-query.js";

const EXPECTED_TRANSITIONS: Record<TicketStatusValue, readonly TicketStatusValue[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
  CANCELLED: ["REOPENED"],
};

describe("Lab 4 status-transition matrix", () => {
  it("matches every normative allowed transition", () => {
    expect(STAFF_STATUS_TRANSITIONS).toEqual(EXPECTED_TRANSITIONS);
  });

  it("rejects every same-status and unlisted transition by matrix lookup", () => {
    for (const from of TICKET_STATUSES) {
      const allowed = new Set(STAFF_STATUS_TRANSITIONS[from]);
      for (const to of TICKET_STATUSES) {
        if (allowed.has(to)) continue;
        expect(STAFF_STATUS_TRANSITIONS[from]).not.toContain(to);
      }
    }
  });
});
