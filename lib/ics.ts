// Minimal RFC 5545 iCalendar writer. Hand-rolled rather than pulling a
// dependency — we only ever emit VEVENTs with a fixed field set.

export type FeedEvent = {
  uid: string;
  kind: "session" | "event";
  title: string;
  room: string | null;
  site: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  status: string | null;
};

// RFC 5545 §3.3.11: backslash, semicolon and comma are escaped; newlines
// become literal \n. (Colons are NOT escaped in text values.)
function esc(v: string) {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// UTC form: 20260720T153000Z
function utc(d: Date) {
  return `${d.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}
// Date-only form for all-day events: 20260720
function dateOnly(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// RFC 5545 §3.1: lines are folded at 75 octets, continuations start with a
// single space. We measure bytes, not chars, so multi-byte names fold safely.
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // don't split a multi-byte character: back off to a lead byte
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74; // continuation lines carry a leading space
  }
  return out.join("\r\n ");
}

export function buildIcs({
  name,
  events,
  domain = "blueisles.app",
}: {
  name: string;
  events: FeedEvent[];
  domain?: string;
}) {
  const stamp = utc(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BlueIsles//After-School//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${esc(name)}`),
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];

  for (const ev of events) {
    const start = new Date(ev.starts_at);
    if (Number.isNaN(start.getTime())) continue;
    // default an hour when no end is recorded, so clients render a block
    const end = ev.ends_at ? new Date(ev.ends_at) : new Date(start.getTime() + 3_600_000);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}@${domain}`);
    lines.push(`DTSTAMP:${stamp}`);
    if (ev.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(start)}`);
      lines.push(`DTEND;VALUE=DATE:${dateOnly(new Date(start.getTime() + 86_400_000))}`);
    } else {
      lines.push(`DTSTART:${utc(start)}`);
      lines.push(`DTEND:${utc(end)}`);
    }
    lines.push(fold(`SUMMARY:${esc(ev.title)}`));

    const where = [ev.room, ev.site].filter(Boolean).join(", ");
    if (where) lines.push(fold(`LOCATION:${esc(where)}`));

    const desc = ev.kind === "session" ? "Program session" : "Calendar event";
    const detail = ev.status ? `${desc} · ${ev.status}` : desc;
    lines.push(fold(`DESCRIPTION:${esc(detail)}`));

    // cancelled sessions should disappear from subscribers' calendars
    if (ev.status === "cancelled") lines.push("STATUS:CANCELLED");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
