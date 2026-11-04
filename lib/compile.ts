/* SVGdio compiler: typed layers -> standalone SVG string,
 * visual timeline -> @keyframes + animation CSS.
 * Deterministic: same input, same output. */

import { CANVAS_DEFAULTS, pointsToPath, type Layer } from "./layers";

export type AnimatableProperty = "x" | "y" | "opacity" | "rotation" | "fill";
export type EasingName = "linear" | "ease" | "ease-out" | "ease-in-out" | "spring" | "snap";

export interface Keyframe {
  id: string;
  /** Seconds from timeline start. */
  time: number;
  value: number | string;
  easing: EasingName;
}

export interface TimelineTrack {
  id: string;
  layerId: string;
  property: AnimatableProperty;
  keyframes: Keyframe[];
}

export interface Timeline {
  duration: number; // seconds
  tracks: TimelineTrack[];
}

export const EASING_CSS: Record<EasingName, string> = {
  linear: "linear",
  ease: "ease",
  "ease-out": "cubic-bezier(0.23, 1, 0.32, 1)",
  "ease-in-out": "cubic-bezier(0.77, 0, 0.175, 1)",
  spring: "cubic-bezier(0.34, 1.3, 0.64, 1)",
  snap: "cubic-bezier(0.85, 0, 0.15, 1)",
};

export const PROPERTY_LABEL: Record<AnimatableProperty, string> = {
  x: "X",
  y: "Y",
  opacity: "Opacity",
  rotation: "Rotate",
  fill: "Fill",
};

export function emptyTimeline(): Timeline {
  return { duration: 2, tracks: [] };
}

/* ---------- numbers + colors ---------- */

export function round(n: number, precision = CANVAS_DEFAULTS.precision): number {
  const f = 10 ** precision;
  return Math.round(n * f) / f;
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function parseColor(c: string): [number, number, number] | null {
  const t = c.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(t);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split("").map((ch) => ch + ch).join("") : h;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/.exec(t);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

function mixColor(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return t < 0.5 ? a : b;
  const m = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `rgb(${m[0]}, ${m[1]}, ${m[2]})`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/* ---------- Smart-Animate style interpolation ---------- */

function easeScalar(easing: EasingName, t: number): number {
  switch (easing) {
    case "linear":
      return t;
    case "ease":
      return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    case "snap":
      return t * t * t;
    case "spring": {
      // Light overshoot approximation for preview only.
      const c = 1.4;
      return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
    }
    case "ease-in-out":
      return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    case "ease-out":
    default:
      return 1 - (1 - t) ** 3;
  }
}

/** Interpolated value of a track at `time` (seconds). Null when the track is empty. */
export function valueAt(track: TimelineTrack, time: number): number | string | null {
  const kfs = [...track.keyframes].sort((a, b) => a.time - b.time);
  if (kfs.length === 0) return null;
  if (time <= kfs[0].time) return kfs[0].value;
  if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (time >= a.time && time <= b.time) {
      const span = Math.max(1e-6, b.time - a.time);
      const t = easeScalar(a.easing, (time - a.time) / span);
      if (typeof a.value === "number" && typeof b.value === "number") return lerp(a.value, b.value, t);
      if (typeof a.value === "string" && typeof b.value === "string") return mixColor(a.value, b.value, t);
      return t < 0.5 ? a.value : b.value;
    }
  }
  return kfs[kfs.length - 1].value;
}

/* ---------- layers -> SVG ---------- */

function layerShape(layer: Layer): string {
  const r = (n: number) => round(n);
  const fill = layer.fill === "" ? "none" : layer.fill;
  const stroke = layer.stroke === "" ? "none" : layer.stroke;
  const common = `fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${r(layer.strokeWidth)}" opacity="${r(layer.opacity)}"`;
  switch (layer.type) {
    case "rect":
      return `<rect x="0" y="0" width="${r(layer.width)}" height="${r(layer.height)}" rx="${r(layer.cornerRadius)}" ${common}/>`;
    case "ellipse":
      return `<ellipse cx="${r(layer.width / 2)}" cy="${r(layer.height / 2)}" rx="${r(layer.width / 2)}" ry="${r(layer.height / 2)}" ${common}/>`;
    case "line": {
      const pts = layer.points ?? [
        { x: 0, y: 0 },
        { x: layer.width, y: 0 },
      ];
      const d = pointsToPath(pts);
      return `<path d="${escapeXml(d)}" fill="none" stroke="${escapeXml(stroke === "none" ? "#e6dcf0" : stroke)}" stroke-width="${r(layer.strokeWidth)}" stroke-linecap="round" opacity="${r(layer.opacity)}"/>`;
    }
    case "text": {
      const size = layer.fontSize ?? 24;
      const text = escapeXml(layer.text ?? "");
      return `<text x="0" y="${r(size)}" font-size="${r(size)}" font-family="Manrope, system-ui, sans-serif" fill="${escapeXml(fill)}" opacity="${r(layer.opacity)}">${text}</text>`;
    }
    case "path": {
      const d = layer.pathData ?? pointsToPath(layer.points ?? []);
      return `<path d="${escapeXml(d)}" ${common} stroke-linejoin="round" stroke-linecap="round"/>`;
    }
  }
}

function layerTransform(layer: Layer): string {
  const parts: string[] = [];
  if (layer.x !== 0 || layer.y !== 0) parts.push(`translate(${round(layer.x)} ${round(layer.y)})`);
  if (layer.rotation !== 0) parts.push(`rotate(${round(layer.rotation)} ${round(layer.width / 2)} ${round(layer.height / 2)})`);
  return parts.length > 0 ? ` transform="${parts.join(" ")}"` : "";
}

/** Standalone .svg file content. Hidden layers are skipped; locked layers are included. */
export function layersToSVG(layers: Layer[], width = CANVAS_DEFAULTS.width, height = CANVAS_DEFAULTS.height): string {
  const visible = layers.filter((l) => l.visible);
  const body = visible
    .map((l) => `  <g id="${escapeXml(slug(l.name))}"${layerTransform(l)}>\n    ${layerShape(l)}\n  </g>`)
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${body}\n</svg>\n`;
}

function slug(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s === "" ? "layer" : s.slice(0, 48);
}

/* ---------- timeline -> CSS ---------- */

function cssValueFor(property: AnimatableProperty, value: number | string, layer: Layer): string {
  switch (property) {
    case "x":
      return `translateX(${round(Number(value) - layer.x)}px)`;
    case "y":
      return `translateY(${round(Number(value) - layer.y)}px)`;
    case "opacity":
      return `${round(Number(value))}`;
    case "rotation":
      return `rotate(${round(Number(value))}deg)`;
    case "fill":
      return `${value}`;
  }
}

/**
 * Compile the timeline to CSS. One @keyframes block per animated layer;
 * x/y/rotation merge into a single `transform` per keyframe stop.
 */
export function timelineToCSS(timeline: Timeline, layers: Layer[]): { keyframesCSS: string; usageCSS: string } {
  const byId = new Map(layers.map((l) => [l.id, l]));
  const byLayer = new Map<string, TimelineTrack[]>();
  for (const t of timeline.tracks) {
    if (!byId.has(t.layerId)) continue;
    const list = byLayer.get(t.layerId) ?? [];
    list.push(t);
    byLayer.set(t.layerId, list);
  }
  const duration = Math.max(0.1, timeline.duration);
  const blocks: string[] = [];
  const usages: string[] = [];
  let n = 0;
  for (const [layerId, tracks] of byLayer) {
    const layer = byId.get(layerId);
    if (!layer) continue;
    const active = tracks.filter((t) => t.keyframes.length > 0);
    if (active.length === 0) continue;
    n += 1;
    const animName = `svigdio-${slug(layer.name)}-${n}`;
    const stops = new Set<number>();
    for (const t of active) for (const k of t.keyframes) stops.add(k.time);
    const ordered = [...stops].sort((a, b) => a - b);
    const lines: string[] = [];
    for (const stop of ordered) {
      const pct = round(Math.min(1, Math.max(0, stop / duration)) * 100, 1);
      const decls: string[] = [];
      const transforms: string[] = [];
      let easing = "ease-out";
      for (const t of active) {
        const v = valueAt(t, stop);
        if (v == null) continue;
        const kf = [...t.keyframes].sort((a, b) => a.time - b.time).find((k) => k.time >= stop) ?? t.keyframes[0];
        easing = EASING_CSS[kf.easing];
        if (t.property === "x" || t.property === "y" || t.property === "rotation") {
          transforms.push(cssValueFor(t.property, v, layer));
        } else if (t.property === "opacity") {
          decls.push(`opacity: ${cssValueFor(t.property, v, layer)}`);
        } else {
          decls.push(`fill: ${cssValueFor(t.property, v, layer)}`);
        }
      }
      if (transforms.length > 0) decls.unshift(`transform: ${transforms.join(" ")}`);
      lines.push(`  ${pct}% { ${decls.join("; ")}; animation-timing-function: ${easing}; }`);
    }
    blocks.push(`@keyframes ${animName} {\n${lines.join("\n")}\n}`);
    usages.push(`#${slug(layer.name)} {\n  animation: ${animName} ${round(duration, 2)}s both;\n}`);
  }
  return { keyframesCSS: blocks.join("\n\n"), usageCSS: usages.join("\n\n") };
}

/** Full CSS export: keyframes + usage, with a header comment. */
export function timelineToFullCSS(timeline: Timeline, layers: Layer[]): string {
  const { keyframesCSS, usageCSS } = timelineToCSS(timeline, layers);
  if (!keyframesCSS) return `/* SVGdio: no animated tracks yet. Add a track and two keyframes. */\n`;
  return `/* Exported from SVGdio — apply to the matching SVG element ids. */\n${keyframesCSS}\n\n${usageCSS}\n`;
}
