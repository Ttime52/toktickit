export const REPORT_TIME_ZONE = "Asia/Bangkok" as const;
export const DASHBOARD_WINDOW_KEY = "7d" as const;

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_WINDOW_DURATION_MS = 7 * DAY_MS;

export interface DashboardWindow {
  key: typeof DASHBOARD_WINDOW_KEY;
  start: Date;
  end: Date;
}

export interface SerializedDashboardWindow {
  key: typeof DASHBOARD_WINDOW_KEY;
  start: string;
  end: string;
}

/**
 * Parses the immutable bounds carried by a Dashboard drill-down link.
 * Dashboard-generated values are canonical UTC ISO timestamps and always
 * represent one seven-day Asia/Bangkok reporting window. Returning null for
 * malformed or incomplete values lets API query parsers return a safe 400.
 */
export function parseDashboardWindowBounds(
  startValue: unknown,
  endValue: unknown,
): DashboardWindow | null {
  if (typeof startValue !== "string" || typeof endValue !== "string") {
    return null;
  }

  const start = new Date(startValue);
  const end = new Date(endValue);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start.toISOString() !== startValue ||
    end.toISOString() !== endValue ||
    end.getTime() - start.getTime() !== DASHBOARD_WINDOW_DURATION_MS
  ) {
    return null;
  }

  // Asia/Bangkok is UTC+07:00 for the product contract, so local midnight
  // always appears as 17:00 UTC at both ends of the serialized window.
  if (
    start.getUTCHours() !== 17 ||
    end.getUTCHours() !== 17 ||
    start.getUTCMinutes() !== 0 ||
    end.getUTCMinutes() !== 0 ||
    start.getUTCSeconds() !== 0 ||
    end.getUTCSeconds() !== 0 ||
    start.getUTCMilliseconds() !== 0 ||
    end.getUTCMilliseconds() !== 0
  ) {
    return null;
  }

  return { key: DASHBOARD_WINDOW_KEY, start, end };
}

/**
 * The product timezone is fixed to Asia/Bangkok (UTC+07:00). Converting the
 * instant to a shifted UTC date keeps the calendar boundary deterministic and
 * avoids using the browser/server local timezone.
 */
export function dashboardWindowFor(asOf: Date): DashboardWindow {
  const bangkokCalendarInstant = new Date(asOf.getTime() + BANGKOK_OFFSET_MS);
  const year = bangkokCalendarInstant.getUTCFullYear();
  const month = bangkokCalendarInstant.getUTCMonth();
  const day = bangkokCalendarInstant.getUTCDate();

  const startOfTodayUtc = Date.UTC(year, month, day) - BANGKOK_OFFSET_MS;
  return {
    key: DASHBOARD_WINDOW_KEY,
    start: new Date(startOfTodayUtc - 6 * DAY_MS),
    end: new Date(startOfTodayUtc + DAY_MS),
  };
}

export function serializeDashboardWindow(
  window: DashboardWindow,
): SerializedDashboardWindow {
  return {
    key: window.key,
    start: window.start.toISOString(),
    end: window.end.toISOString(),
  };
}

