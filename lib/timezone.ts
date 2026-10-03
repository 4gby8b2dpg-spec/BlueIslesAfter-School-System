// Wall-clock helpers for time entries. Sites carry an IANA timezone (see
// sites.timezone in 0001), and staff think in local time, so shift times are
// shown and typed in the site's zone and stored as UTC timestamps.

// How far `tz` is ahead of UTC at the given instant, in milliseconds.
function offsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - instant.getTime();
}

/** Turn a "YYYY-MM-DDTHH:mm" wall-clock string in `tz` into a real Date. */
export function zonedToUtc(local: string, tz: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const naive = new Date(`${local}:00Z`).getTime();
  if (Number.isNaN(naive)) return null;
  // Two passes handle DST transitions correctly.
  const first = new Date(naive - offsetMs(new Date(naive), tz));
  return new Date(naive - offsetMs(first, tz));
}

/** "YYYY-MM-DDTHH:mm" in `tz`, for prefilling <input type="datetime-local">. */
export function toLocalInput(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Human-readable local time in `tz`, e.g. "Mon 6 Oct, 3:30 pm". */
export function formatLocal(iso: string, tz: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Local calendar month ("YYYY-MM") of an instant in `tz`. */
export function localMonth(iso: string, tz: string): string {
  return toLocalInput(iso, tz).slice(0, 7);
}
