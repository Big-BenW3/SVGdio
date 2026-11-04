/* SVGdio inspector: property panel. Range/color inputs write CSS variables
 * straight to the live layer node for instant paint, then commit to state. */
"use client";

import { typeLayerLabel } from "@/lib/inspector-helpers";
import type { Layer } from "@/lib/layers";

interface InspectorProps {
  layer: Layer | undefined;
  multiCount: number;
  onUpdate: (id: string, patch: Partial<Layer>) => void;
}

function liveVar(id: string, name: string, value: string): void {
  const node = document.querySelector(`[data-layer-id="${id}"]`);
  if (node) (node as SVGGElement).style.setProperty(name, value);
}

function Num({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <label>{label}<output>{value}</output></label>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </div>
  );
}

export function Inspector({ layer, multiCount, onUpdate }: InspectorProps) {
  if (!layer) {
    return (
      <div className="inspector-none">
        <strong>{multiCount > 0 ? `${multiCount} layers selected` : "Nothing selected"}</strong>
        {multiCount > 0 ? "Select a single layer to edit its properties." : "Click a layer on canvas or in the list."}
      </div>
    );
  }
  const l = layer;
  const set = (patch: Partial<Layer>) => onUpdate(l.id, patch);

  return (
    <>
      <div className="panel-head">
        INSPECTOR
        <span className="count">{typeLayerLabel(l.type)}</span>
      </div>
      <div className="panel-body">
        <div className="inspector-section">
          <h3>STYLE</h3>
          <div className="color-row">
            <div className="field">
              <label>Fill</label>
              <input
                type="color"
                value={toColorInput(l.fill)}
                disabled={l.type === "line"}
                onChange={(e) => {
                  liveVar(l.id, "--fill", e.target.value);
                  set({ fill: e.target.value });
                }}
              />
            </div>
            <div className="field">
              <label>Stroke</label>
              <input
                type="color"
                value={toColorInput(l.stroke === "none" ? "#e6dcf0" : l.stroke)}
                onChange={(e) => {
                  liveVar(l.id, "--stroke", e.target.value);
                  set({ stroke: e.target.value });
                }}
              />
            </div>
          </div>
          <div className="field-grid" style={{ marginTop: 8 }}>
            <Num label="Stroke w" value={l.strokeWidth} min={0} max={60} step={0.5} onChange={(v) => set({ strokeWidth: v })} />
            {l.type === "rect" ? (
              <Num label="Radius" value={l.cornerRadius} min={0} max={200} onChange={(v) => set({ cornerRadius: v })} />
            ) : (
              <div className="field">
                <label>Stroke on/off</label>
                <select value={l.stroke === "none" ? "none" : "on"} onChange={(e) => set({ stroke: e.target.value === "none" ? "none" : "#e6dcf0" })}>
                  <option value="on">Visible</option>
                  <option value="none">None</option>
                </select>
              </div>
            )}
            <div className="field full">
              <label>Opacity<output>{Math.round(l.opacity * 100)}%</output></label>
              <input type="range" min={0} max={1} step={0.01} value={l.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} />
            </div>
          </div>
          {l.type === "text" && (
            <div className="field-grid" style={{ marginTop: 8 }}>
              <div className="field full">
                <label>Text</label>
                <textarea value={l.text ?? ""} onChange={(e) => set({ text: e.target.value.slice(0, 500) })} />
              </div>
              <Num label="Font size" value={l.fontSize ?? 24} min={6} max={200} onChange={(v) => set({ fontSize: v })} />
            </div>
          )}
        </div>

        <div className="inspector-section">
          <h3>TRANSFORM</h3>
          <div className="field-grid">
            <Num label="X" value={l.x} step={1} onChange={(v) => set({ x: v })} />
            <Num label="Y" value={l.y} step={1} onChange={(v) => set({ y: v })} />
            <Num label="Width" value={l.width} min={1} max={2000} onChange={(v) => set({ width: Math.max(1, v) })} />
            <Num label="Height" value={l.height} min={l.type === "line" ? 0 : 1} max={2000} onChange={(v) => set({ height: Math.max(l.type === "line" ? 0 : 1, v) })} />
            <Num label="Rotation°" value={l.rotation} min={-360} max={360} onChange={(v) => set({ rotation: v })} />
          </div>
          <p className="transform-note">
            live: <code>--fill</code> <code>--stroke</code> on <code>[data-layer-id]</code>, position via <code>translate3d</code>
          </p>
        </div>

        <div className="inspector-section">
          <h3>LAYER</h3>
          <div className="field-grid">
            <div className="field full">
              <label>Name</label>
              <input type="text" value={l.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function toColorInput(v: string): string {
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return `#${v.slice(1).split("").map((c) => c + c).join("")}`;
  }
  const m = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/.exec(v);
  if (m) {
    const hx = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${hx(Number(m[1]))}${hx(Number(m[2]))}${hx(Number(m[3]))}`;
  }
  return "#9c62ff";
}
