"use client";

import { useRef, useState, useTransition } from "react";
import { Sparkline } from "@/components/sparkline";
import { svgElementToPngDataUrl } from "@/lib/svg-to-png";
import { NARRATIVE_METRICS, type NarrativeMetricKey } from "@/lib/narrative-metrics";
import type { NarrativeBlock } from "@/lib/narratives";
import { saveNarrative, fetchKpiSnapshot, fetchChartSeries } from "@/app/(app)/reports/narratives/actions";

function newId() {
  return crypto.randomUUID();
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function NarrativeBuilder({
  narrativeId,
  initialTitle,
  initialBlocks,
  from,
  to,
}: {
  narrativeId: string | null;
  initialTitle: string;
  initialBlocks: NarrativeBlock[];
  from: string;
  to: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [blocks, setBlocks] = useState<NarrativeBlock[]>(initialBlocks);
  const [kpiMetric, setKpiMetric] = useState<NarrativeMetricKey>("attendance_rate");
  const [chartMetric, setChartMetric] = useState<NarrativeMetricKey>("attendance_rate");
  const [chartPreview, setChartPreview] = useState<{ label: string; points: (number | null)[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const chartHostRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function addText() {
    setBlocks((b) => [...b, { id: newId(), type: "text", body: "" }]);
  }

  function updateText(id: string, body: string) {
    setBlocks((b) => b.map((blk) => (blk.id === id ? { ...blk, body } : blk)));
  }

  async function addKpi() {
    const snap = await fetchKpiSnapshot(kpiMetric, from, to);
    if (!snap) return;
    setBlocks((b) => [...b, { id: newId(), type: "kpi", label: snap.label, value: snap.value }]);
  }

  async function previewChart() {
    const series = await fetchChartSeries(chartMetric, from, to);
    setChartPreview(series);
  }

  async function captureChart() {
    const svg = chartHostRef.current?.querySelector("svg");
    if (!svg || !chartPreview) return;
    const dataUrl = await svgElementToPngDataUrl(svg);
    setBlocks((b) => [...b, { id: newId(), type: "chart", label: chartPreview.label, dataUrl }]);
    setChartPreview(null);
  }

  function removeBlock(id: string) {
    setBlocks((b) => b.filter((blk) => blk.id !== id));
  }

  function moveBlock(id: string, dir: -1 | 1) {
    setBlocks((b) => {
      const i = b.findIndex((blk) => blk.id === id);
      if (i < 0) return b;
      return move(b, i, i + dir);
    });
  }

  function submit() {
    startTransition(() => {
      formRef.current?.requestSubmit();
    });
  }

  return (
    <form ref={formRef} action={saveNarrative} className="narrative-builder">
      {narrativeId && <input type="hidden" name="id" value={narrativeId} />}
      <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />

      <label className="narrative-title">
        <span>Title</span>
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Fall 2026 board update"
          required
        />
      </label>

      <div className="narrative-blocks">
        {blocks.length === 0 && <p className="empty">No blocks yet — add one below.</p>}
        {blocks.map((blk, i) => (
          <div key={blk.id} className="narrative-block">
            <div className="narrative-block-controls">
              <button type="button" onClick={() => moveBlock(blk.id, -1)} disabled={i === 0} aria-label="Move up">
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveBlock(blk.id, 1)}
                disabled={i === blocks.length - 1}
                aria-label="Move down"
              >
                ↓
              </button>
              <button type="button" className="danger" onClick={() => removeBlock(blk.id)}>
                Remove
              </button>
            </div>
            {blk.type === "text" && (
              <textarea
                value={blk.body}
                onChange={(e) => updateText(blk.id, e.target.value)}
                placeholder="Write a paragraph…"
                rows={4}
              />
            )}
            {blk.type === "kpi" && (
              <div className="narrative-kpi-tile">
                <span className="narrative-kpi-value">{blk.value}</span>
                <span className="narrative-kpi-label">{blk.label}</span>
              </div>
            )}
            {blk.type === "chart" && (
              <figure className="narrative-chart-block">
                <img src={blk.dataUrl} alt={blk.label} />
                <figcaption>{blk.label}</figcaption>
              </figure>
            )}
          </div>
        ))}
      </div>

      <div className="narrative-add-row">
        <button type="button" className="btn-ghost" onClick={addText}>
          + Text
        </button>

        <span className="narrative-add-group">
          <select value={kpiMetric} onChange={(e) => setKpiMetric(e.target.value as NarrativeMetricKey)}>
            {NARRATIVE_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost" onClick={addKpi}>
            + KPI
          </button>
        </span>

        <span className="narrative-add-group">
          <select value={chartMetric} onChange={(e) => setChartMetric(e.target.value as NarrativeMetricKey)}>
            {NARRATIVE_METRICS.filter((m) => m.key !== "enrolled").map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost" onClick={previewChart}>
            Preview chart
          </button>
        </span>
      </div>

      {chartPreview && (
        <div className="narrative-chart-preview" ref={chartHostRef}>
          {chartPreview.points.length >= 2 ? (
            <Sparkline points={chartPreview.points} label={chartPreview.label} grid />
          ) : (
            <p className="empty">Not enough weekly data in this range to chart.</p>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={captureChart}
            disabled={chartPreview.points.length < 2}
          >
            Capture into narrative
          </button>
        </div>
      )}

      <button type="button" className="btn-primary" onClick={submit} disabled={pending}>
        {pending ? "Saving…" : "Save narrative"}
      </button>
    </form>
  );
}
