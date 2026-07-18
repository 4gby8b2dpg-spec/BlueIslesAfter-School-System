"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { commitImport, type ImportRowInput } from "@/app/(app)/import/actions";

// Existing participants passed from the server, for duplicate detection.
export type ExistingParticipant = {
  externalId: string | null;
  first: string;
  last: string;
  dob: string | null;
};

const FIELDS = [
  { key: "", label: "— Skip —" },
  { key: "full_name", label: "Full name (split to first + last)" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "external_id", label: "Student / external ID" },
  { key: "date_of_birth", label: "Date of birth" },
  { key: "grade", label: "Grade" },
  { key: "school", label: "School" },
  { key: "gender", label: "Gender" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

function suggest(header: string): FieldKey {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  if (/(^|\b)(dob|dateofbirth|birth|birthday|birthdate)/.test(h)) return "date_of_birth";
  if (/(firstname|first|given|fname)/.test(h)) return "first_name";
  if (/(lastname|last|surname|family|lname)/.test(h)) return "last_name";
  if (/(fullname|studentname|name)/.test(h)) return "full_name";
  if (/(studentid|externalid|sid|id)/.test(h)) return "external_id";
  if (/(grade|year|level)/.test(h)) return "grade";
  if (/(school|campus)/.test(h)) return "school";
  if (/(gender|sex)/.test(h)) return "gender";
  return "";
}

function normalizeDate(v: string): { ok: boolean; val: string | null } {
  const s = (v ?? "").trim();
  if (!s) return { ok: true, val: null };
  // MM/DD/YYYY or M/D/YY
  const mdy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (mdy) {
    const [, mm, dd, yy] = mdy;
    let year = Number(yy);
    if (year < 100) year += year > 30 ? 1900 : 2000;
    const d = new Date(year, Number(mm) - 1, Number(dd));
    if (!isNaN(d.getTime())) return { ok: true, val: iso(d) };
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return { ok: true, val: iso(d) };
  return { ok: false, val: null };
}
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

type MappedRow = {
  rowNumber: number;
  raw: Record<string, string>;
  fields: {
    first_name: string;
    last_name: string;
    external_id: string | null;
    date_of_birth: string | null;
    grade: string | null;
    school: string | null;
    gender: string | null;
  };
  problems: string[];
  duplicate: boolean;
};

export function ImportWizard({ existing }: { existing: ExistingParticipant[] }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const wbRef = useRef<XLSX.WorkBook | null>(null);
  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheet, setSheet] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<{ committed: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function loadSheet(wb: XLSX.WorkBook, name: string) {
    const ws = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<string[]>(ws, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    const hdrs = (aoa[0] ?? []).map((h) => String(h).trim()).filter(Boolean);
    const dataRows = aoa.slice(1).map((arr) =>
      Object.fromEntries(hdrs.map((h, i) => [h, String((arr as string[])[i] ?? "").trim()])),
    );
    setSheet(name);
    setHeaders(hdrs);
    setRows(dataRows);
    setMapping(Object.fromEntries(hdrs.map((h) => [h, suggest(h)])));
  }

  async function onFile(file: File) {
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: false });
      wbRef.current = wb;
      setFileName(file.name);
      setSheetNames(wb.SheetNames);
      loadSheet(wb, wb.SheetNames[0]);
    } catch {
      setError("Couldn't read that file. Use .xlsx, .xls, or .csv.");
    }
  }

  const mappedFields = new Set(Object.values(mapping));
  const hasName =
    mappedFields.has("full_name") ||
    (mappedFields.has("first_name") && mappedFields.has("last_name"));

  // ---- build mapped + validated rows for review ----
  const review = useMemo<MappedRow[]>(() => {
    if (step < 3) return [];
    const existExt = new Set(
      existing.map((e) => (e.externalId ?? "").toLowerCase()).filter(Boolean),
    );
    const existName = new Set(
      existing.map((e) => `${e.first}|${e.last}|${e.dob ?? ""}`.toLowerCase()),
    );
    return rows.map((raw, idx) => {
      const get = (fk: FieldKey) => {
        const col = Object.keys(mapping).find((h) => mapping[h] === fk);
        return col ? (raw[col] ?? "").trim() : "";
      };
      let first = get("first_name");
      let last = get("last_name");
      if (mappedFields.has("full_name")) {
        const full = get("full_name");
        const parts = full.split(/\s+/);
        first = first || parts[0] || "";
        last = last || (parts.length > 1 ? parts.slice(1).join(" ") : "");
      }
      const dobRaw = get("date_of_birth");
      const dob = normalizeDate(dobRaw);
      const extId = get("external_id") || null;

      const problems: string[] = [];
      if (!first) problems.push("missing first name");
      if (!last) problems.push("missing last name");
      if (dobRaw && !dob.ok) problems.push("unreadable date of birth");

      const dupByExt = extId ? existExt.has(extId.toLowerCase()) : false;
      const dupByName = existName.has(
        `${first}|${last}|${dob.val ?? ""}`.toLowerCase(),
      );
      return {
        rowNumber: idx + 2,
        raw,
        fields: {
          first_name: first,
          last_name: last,
          external_id: extId,
          date_of_birth: dob.val,
          grade: get("grade") || null,
          school: get("school") || null,
          gender: get("gender") || null,
        },
        problems,
        duplicate: dupByExt || dupByName,
      };
    });
  }, [step, rows, mapping, existing, mappedFields]);

  const errored = review.filter((r) => r.problems.length > 0);
  const dupes = review.filter((r) => r.problems.length === 0 && r.duplicate);
  const clean = review.filter((r) => r.problems.length === 0 && !r.duplicate);
  const willCommit = skipDuplicates ? clean : clean.concat(dupes);

  async function onCommit() {
    setCommitting(true);
    setError(null);
    const payloadRows: ImportRowInput[] = willCommit.map((r) => ({
      rowNumber: r.rowNumber,
      raw: r.raw,
      fields: r.fields,
    }));
    const res = await commitImport({
      fileName,
      sheetName: sheet || null,
      rowsTotal: rows.length,
      rowsSkipped: rows.length - payloadRows.length,
      rows: payloadRows,
    });
    setCommitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult({ committed: res.committed, skipped: rows.length - res.committed });
    setStep(4);
  }

  function reset() {
    wbRef.current = null;
    setStep(1);
    setFileName("");
    setSheetNames([]);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
    setError(null);
  }

  return (
    <section className="wizard card">
      {/* step indicator */}
      <ol className="steps" aria-label="Import steps">
        {["Upload", "Map", "Review"].map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const state = step > n || step === 4 ? "done" : step === n ? "current" : "todo";
          return (
            <li key={label} className={`step ${state}`}>
              <span className="step-num">{state === "done" ? "✓" : n}</span>
              {label}
            </li>
          );
        })}
      </ol>

      {error && (
        <p className="wz-error" role="alert">
          {error}
        </p>
      )}

      {/* STEP 1 — upload */}
      {step === 1 && (
        <div className="wz-body">
          <label
            className={dragOver ? "dropzone over" : "dropzone"}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
            }}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <strong>Drop a spreadsheet here</strong>
            <span>or click to choose · .xlsx, .xls, .csv</span>
            {fileName && (
              <span className="wz-file">
                {fileName}
                {sheetNames.length > 1 ? ` · sheet "${sheet}"` : ""} · {rows.length} rows
              </span>
            )}
          </label>

          {sheetNames.length > 1 && (
            <label className="wz-inline">
              Sheet:
              <select
                value={sheet}
                onChange={(e) => wbRef.current && loadSheet(wbRef.current, e.target.value)}
              >
                {sheetNames.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          )}

          <div className="wz-inline">
            Import as:
            <select defaultValue="participants" aria-label="What this file contains">
              <option value="participants">Participants</option>
              <option value="attendance" disabled>
                Attendance history — coming soon
              </option>
              <option value="enrollments" disabled>
                Enrollments — coming soon
              </option>
              <option value="programs" disabled>
                Programs — coming soon
              </option>
              <option value="survey_responses" disabled>
                Survey responses — coming soon
              </option>
            </select>
            <span className="wz-hint">Participants import is live; the others are on the way.</span>
          </div>

          <div className="wz-actions">
            <button className="btn-primary" disabled={rows.length === 0} onClick={() => setStep(2)}>
              Next: map columns →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 — map */}
      {step === 2 && (
        <div className="wz-body">
          <p className="wz-lead">
            Match each column in your file to a participant field. We&rsquo;ve guessed
            where we could.
          </p>
          <div className="map-grid">
            <div className="map-head">Your column</div>
            <div className="map-head">Maps to</div>
            <div className="map-head">Sample</div>
            {headers.map((h) => (
              <div key={h} className="map-row-contents">
                <div className="map-col">{h}</div>
                <div>
                  <select
                    value={mapping[h] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [h]: e.target.value as FieldKey }))
                    }
                  >
                    {FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="map-sample">{rows[0]?.[h] || "—"}</div>
              </div>
            ))}
          </div>
          {!hasName && (
            <p className="wz-warn">
              Map a <strong>Full name</strong>, or both <strong>First</strong> and{" "}
              <strong>Last name</strong>, to continue.
            </p>
          )}
          <div className="wz-actions">
            <button className="btn-ghost" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button className="btn-primary" disabled={!hasName} onClick={() => setStep(3)}>
              Next: review →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — review */}
      {step === 3 && (
        <div className="wz-body">
          <div className="review-summary">
            <div className="rs-tile good">
              <span className="rs-num num">{clean.length}</span> ready to import
            </div>
            <div className="rs-tile warn">
              <span className="rs-num num">{dupes.length}</span> likely duplicates
            </div>
            <div className="rs-tile crit">
              <span className="rs-num num">{errored.length}</span> with errors
            </div>
          </div>

          {dupes.length > 0 && (
            <label className="wz-check">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
              />
              Skip likely duplicates (match on student ID, or name + date of birth)
            </label>
          )}

          {(errored.length > 0 || dupes.length > 0) && (
            <div className="issue-scroll">
              <table className="issue-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {errored.concat(dupes).slice(0, 50).map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="num">{r.rowNumber}</td>
                      <td>
                        {[r.fields.first_name, r.fields.last_name].filter(Boolean).join(" ") ||
                          "—"}
                      </td>
                      <td>
                        {r.problems.length > 0 ? (
                          <span className="tag-crit">{r.problems.join(", ")}</span>
                        ) : (
                          <span className="tag-warn">likely duplicate</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="wz-actions">
            <button className="btn-ghost" onClick={() => setStep(2)}>
              ← Back
            </button>
            <button className="btn-primary" disabled={committing || willCommit.length === 0} onClick={onCommit}>
              {committing
                ? "Importing…"
                : `Commit import · creates ${willCommit.length} participant${willCommit.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4 — done */}
      {step === 4 && result && (
        <div className="wz-body wz-done">
          <div className="done-check" aria-hidden="true">
            ✓
          </div>
          <h3>Import complete</h3>
          <p>
            Created <strong>{result.committed}</strong> participant
            {result.committed === 1 ? "" : "s"}
            {result.skipped > 0 ? ` · ${result.skipped} skipped` : ""}.
          </p>
          <div className="wz-actions center">
            <button className="btn-primary" onClick={reset}>
              Import another file
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
