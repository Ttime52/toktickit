export const REPORT_TIME_ZONE = "Asia/Bangkok" as const;
export const DASHBOARD_WINDOW_KEY = "7d" as const;

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

