"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Status } from "@/lib/attendance";

type Roster = { id: string; name: string; grade: string }[];

// Ask the browser to fire a "kiosk-sync" event when connectivity returns, even
// if the tab is backgrounded (Chromium only; a no-op elsewhere).
async function scheduleBackgroundSync() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    if (reg.sync) await reg.sync.register("kiosk-sync");
  } catch {
    // Background Sync unsupported — the in-page online/interval retry covers it.
  }
}

const ALT: Status[] = ["absent", "late", "excused"]; // cycled by the status pill
const SHORT: Record<Status, string> = { present: "P", absent: "A", late: "L", excused: "E" };
const LABEL: Record<Status, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};

export function KioskCheckin({
  sessionId,
  title,
  subtitle,
  roster,
  initial,
}: {
  sessionId: string;
  title: string;
  subtitle: string;
  roster: Roster;
  initial: Record<string, Status>;
}) {
  const MARKS_KEY = `kiosk:${sessionId}:marks`;
  const DIRTY_KEY = `kiosk:${sessionId}:dirty`;

  const [marks, setMarks] = useState<Record<string, Status>>(initial);
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // refs so the debounced flush / interval read fresh values without re-binding
  const marksRef = useRef(marks);
  const dirtyRef = useRef(dirty);
  useEffect(() => void (marksRef.current = marks), [marks]);
  useEffect(() => void (dirtyRef.current = dirty), [dirty]);

  const persistMarks = useCallback(
    (m: Record<string, Status>) => {
      try {
        localStorage.setItem(MARKS_KEY, JSON.stringify(m));
      } catch {}
    },
    [MARKS_KEY],
  );
  const persistDirty = useCallback(
    (d: Set<string>) => {
      try {
        localStorage.setItem(DIRTY_KEY, JSON.stringify([...d]));
      } catch {}
    },
    [DIRTY_KEY],
  );

  const flush = useCallback(async () => {
    const ids = [...dirtyRef.current];
    const records = ids
      .filter((id) => marksRef.current[id])
      .map((id) => ({ participantId: id, status: marksRef.current[id] }));
    if (records.length === 0) return;

    setSyncing(true);
    try {
      const res = await fetch("/api/attendance/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, records }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (res.ok && json.ok) {
        setDirty((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          persistDirty(next);
          return next;
        });
        setOnline(true);
        setError(null);
      } else {
        setError(res.status === 401 ? "Session expired — sign in again." : json.error || "Sync failed.");
      }
    } catch {
      setOnline(false); // network unreachable — keep the queue for later
      void scheduleBackgroundSync(); // Chromium: retry when connectivity returns
    } finally {
      setSyncing(false);
    }
  }, [sessionId, persistDirty]);

  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => void flush(), 700);
  }, [flush]);

  // hydrate from any queued local state, then try to flush. Deferred to a
  // microtask so the first client render matches the server (no localStorage
  // during SSR), then we overlay anything queued from a previous visit.
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const storedMarks = localStorage.getItem(MARKS_KEY);
        const storedDirty = localStorage.getItem(DIRTY_KEY);
        if (storedMarks) setMarks({ ...initial, ...JSON.parse(storedMarks) });
        if (storedDirty) setDirty(new Set(JSON.parse(storedDirty) as string[]));
      } catch {}
      setOnline(navigator.onLine);
      void flush();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // connection changes + periodic retry
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void flush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const iv = setInterval(() => {
      if (navigator.onLine && dirtyRef.current.size > 0) void flush();
    }, 15000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(iv);
    };
  }, [flush]);

  // Background Sync wakes this tab via a service-worker message — flush on cue.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "kiosk-flush") void flush();
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [flush]);

  function apply(next: Record<string, Status>, touched: string[]) {
    setMarks(next);
    persistMarks(next);
    setDirty((prev) => {
      const d = new Set(prev);
      for (const id of touched) d.add(id);
      persistDirty(d);
      return d;
    });
    setError(null);
    scheduleFlush();
  }

  function togglePresent(id: string) {
    const next = { ...marks };
    if (next[id] === "present") delete next[id];
    else next[id] = "present";
    apply(next, [id]);
  }

  function cycleAlt(id: string) {
    const cur = marks[id];
    const next = { ...marks };
    if (cur && ALT.includes(cur)) {
      const i = ALT.indexOf(cur);
      if (i + 1 < ALT.length) next[id] = ALT[i + 1];
      else delete next[id];
    } else {
      next[id] = ALT[0]; // absent
    }
    apply(next, [id]);
  }

  function markAllPresent() {
    const next: Record<string, Status> = {};
    for (const r of roster) next[r.id] = "present";
    apply(next, roster.map((r) => r.id));
  }

  const counts = useMemo(() => {
    const c = { present: 0, other: 0, unmarked: 0 };
    for (const r of roster) {
      const s = marks[r.id];
      if (s === "present") c.present++;
      else if (s) c.other++;
      else c.unmarked++;
    }
    return c;
  }, [marks, roster]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? roster.filter((r) => r.name.toLowerCase().includes(q)) : roster;
  }, [roster, query]);

  const pending = dirty.size;
  const badge = syncing
    ? { cls: "syncing", text: "Syncing…" }
    : error
      ? { cls: "err", text: error }
      : pending > 0
        ? online
          ? { cls: "pending", text: `Saving ${pending}…` }
          : { cls: "offline", text: `Offline · ${pending} pending` }
        : online
          ? { cls: "ok", text: "All saved" }
          : { cls: "offline", text: "Offline" };

  return (
    <div className="kiosk">
      <header className="kiosk-head">
        <div className="kiosk-title">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="kiosk-status">
          <span className={`kiosk-badge ${badge.cls}`}>
            <span className="kiosk-dot" aria-hidden="true" />
            {badge.text}
          </span>
          <Link href={`/attendance/${sessionId}`} className="kiosk-exit">
            Exit
          </Link>
        </div>
      </header>

      <div className="kiosk-toolbar">
        <span className="kiosk-count num">
          {counts.present} present · {counts.other} other · {counts.unmarked} unmarked
        </span>
        <div className="kiosk-tools">
          <input
            className="kiosk-search"
            type="search"
            placeholder="Find a name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="kiosk-allpresent" onClick={markAllPresent}>
            All present
          </button>
        </div>
      </div>

      <ul className="kiosk-list">
        {filtered.map((r) => {
          const s = marks[r.id];
          const state = s ?? "none";
          return (
            <li key={r.id} className={`kiosk-row ${state}`}>
              <button
                type="button"
                className="kiosk-main"
                onClick={() => togglePresent(r.id)}
                aria-pressed={s === "present"}
                aria-label={`Mark ${r.name} present`}
              >
                <span className="kiosk-check" aria-hidden="true">
                  {s === "present" ? "✓" : s ? SHORT[s] : ""}
                </span>
                <span className="kiosk-who">
                  <span className="kiosk-name">{r.name}</span>
                  <span className="kiosk-grade">Gr {r.grade}</span>
                </span>
                <span className="kiosk-state">{s ? LABEL[s] : "Tap = present"}</span>
              </button>
              <button
                type="button"
                className="kiosk-alt"
                onClick={() => cycleAlt(r.id)}
                aria-label={`Cycle absent/late/excused for ${r.name}`}
                title="Absent / Late / Excused"
              >
                {s && ALT.includes(s) ? SHORT[s] : "·"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
