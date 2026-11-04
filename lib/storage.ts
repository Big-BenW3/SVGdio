/* SVGdio persistence: localStorage with versioned migration + project JSON. */

import { emptyTimeline, type Timeline } from "./compile";
import type { Layer } from "./layers";

export const STORAGE_KEY = "svgdio.workspace.v1";
export const STORAGE_VERSION = 1;

export interface WorkspaceSnapshot {
  version: number;
  savedAt: string;
  layers: Layer[];
  timeline: Timeline;
  artboard: { width: number; height: number };
}

export function defaultSnapshot(): WorkspaceSnapshot {
  return {
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    layers: [],
    timeline: emptyTimeline(),
    artboard: { width: 800, height: 600 },
  };
}

function isLayer(v: unknown): v is Layer {
  if (typeof v !== "object" || v === null) return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.id === "string" &&
    typeof l.type === "string" &&
    ["rect", "ellipse", "line", "text", "path"].includes(l.type as string) &&
    typeof l.x === "number" &&
    typeof l.y === "number"
  );
}

/** Migrate any stored payload to the current shape. Unknown versions reset safely. */
export function migrate(raw: unknown): WorkspaceSnapshot {
  const fallback = defaultSnapshot();
  if (typeof raw !== "object" || raw === null) return fallback;
  const v = raw as Record<string, unknown>;
  if (v.version !== STORAGE_VERSION) {
    // v0 (unversioned, layers-only) -> v1
    if (Array.isArray(v.layers) && v.version == null) {
      return {
        ...fallback,
        layers: (v.layers as unknown[]).filter(isLayer),
        savedAt: new Date().toISOString(),
      };
    }
    return fallback;
  }
  const layers = Array.isArray(v.layers) ? (v.layers as unknown[]).filter(isLayer) : [];
  const t = v.timeline as Timeline | undefined;
  const timeline: Timeline =
    t && typeof t.duration === "number" && Array.isArray(t.tracks)
      ? { duration: Math.min(60, Math.max(0.2, t.duration)), tracks: t.tracks }
      : emptyTimeline();
  const a = v.artboard as { width?: number; height?: number } | undefined;
  const artboard = {
    width: typeof a?.width === "number" ? Math.min(2000, Math.max(100, a.width)) : 800,
    height: typeof a?.height === "number" ? Math.min(2000, Math.max(100, a.height)) : 600,
  };
  return { version: STORAGE_VERSION, savedAt: new Date().toISOString(), layers, timeline, artboard };
}

export function loadSnapshot(): WorkspaceSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSnapshot();
    return migrate(JSON.parse(raw) as unknown);
  } catch {
    return defaultSnapshot();
  }
}

export function saveSnapshot(snap: WorkspaceSnapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...snap, version: STORAGE_VERSION, savedAt: new Date().toISOString() }));
  } catch {
    // Storage full or unavailable — workspace stays in memory.
  }
}

export function exportProjectJSON(snap: WorkspaceSnapshot): string {
  return JSON.stringify({ app: "svgdio", ...snap }, null, 2);
}

export function importProjectJSON(text: string): WorkspaceSnapshot {
  const parsed = JSON.parse(text) as unknown;
  return migrate(parsed);
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}
