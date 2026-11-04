/* SVGdio layer model: typed source of truth for every shape on canvas.
 * Every shape is data; a small compiler maps it to SVG elements.
 * Same input always gives same output — no AI, no string editing. */

export type LayerType = "rect" | "ellipse" | "line" | "text" | "path";

export interface Layer {
  id: string;
  type: LayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Position of the layer origin on the artboard, in px. */
  x: number;
  y: number;
  /** Geometry size in px. For line/path this is the bounding box. */
  width: number;
  height: number;
  rotation: number; // degrees
  opacity: number; // 0..1
  fill: string; // css color or "none"
  stroke: string; // css color or "none"
  strokeWidth: number;
  cornerRadius: number; // rect only
  /** Text content (text layers). */
  text?: string;
  fontSize?: number;
  /** Poly points in layer-local coords (line + path layers). */
  points?: { x: number; y: number }[];
  /** Raw path data (imported path layers). Mutually exclusive with points. */
  pathData?: string;
}

export type Tool = "select" | "rect" | "ellipse" | "line" | "text" | "pen" | "pan";

export const CANVAS_DEFAULTS = { width: 800, height: 600, precision: 2 } as const;

let idCounter = 0;
export function uid(prefix = "layer"): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

const TYPE_DEFAULTS: Record<LayerType, Partial<Layer>> = {
  rect: { fill: "#9c62ff", stroke: "none", strokeWidth: 0, cornerRadius: 8 },
  ellipse: { fill: "#b184ff", stroke: "none", strokeWidth: 0, cornerRadius: 0 },
  line: { fill: "none", stroke: "#e6dcf0", strokeWidth: 3, cornerRadius: 0 },
  text: { fill: "#f6f3fa", stroke: "none", strokeWidth: 0, cornerRadius: 0 },
  path: { fill: "rgba(156,98,255,0.25)", stroke: "#b184ff", strokeWidth: 2.5, cornerRadius: 0 },
};

const TYPE_LABEL: Record<LayerType, string> = {
  rect: "Rect",
  ellipse: "Ellipse",
  line: "Line",
  text: "Text",
  path: "Path",
};

export function typeLabel(t: LayerType): string {
  return TYPE_LABEL[t];
}

export function createLayer(type: LayerType, partial: Partial<Layer> = {}): Layer {
  const base: Layer = {
    id: uid("layer"),
    type,
    name: `${TYPE_LABEL[type]} ${idCounter}`,
    visible: true,
    locked: false,
    x: 120,
    y: 120,
    width: type === "line" ? 160 : 140,
    height: type === "line" ? 0 : type === "text" ? 40 : 100,
    rotation: 0,
    opacity: 1,
    fill: "#9c62ff",
    stroke: "none",
    strokeWidth: 2,
    cornerRadius: 0,
    ...TYPE_DEFAULTS[type],
  };
  if (type === "text") {
    base.text = partial.text ?? "Hello, SVGdio";
    base.fontSize = partial.fontSize ?? 28;
    base.width = partial.width ?? 240;
    base.height = partial.height ?? 40;
  }
  if (type === "line" && !partial.points && !partial.pathData) {
    base.points = [
      { x: 0, y: 0 },
      { x: base.width, y: 0 },
    ];
  }
  if (type === "path" && !partial.points && !partial.pathData) {
    base.points = [
      { x: 0, y: 60 },
      { x: 45, y: 0 },
      { x: 90, y: 60 },
    ];
    base.width = 90;
    base.height = 60;
  }
  return { ...base, ...partial, id: partial.id ?? base.id, type };
}

/* ---------- geometry helpers ---------- */

export function layerCenter(l: Layer): { x: number; y: number } {
  return { x: l.x + l.width / 2, y: l.y + l.height / 2 };
}

/** Axis-aligned bounds of a layer, ignoring rotation. */
export function layerBounds(l: Layer): { x: number; y: number; width: number; height: number } {
  if ((l.type === "line" || l.type === "path") && l.points && l.points.length > 0 && !l.pathData) {
    const xs = l.points.map((p) => p.x);
    const ys = l.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: l.x + minX,
      y: l.y + minY,
      width: Math.max(1, Math.max(...xs) - minX),
      height: Math.max(1, Math.max(...ys) - minY),
    };
  }
  return { x: l.x, y: l.y, width: Math.max(1, l.width), height: Math.max(1, l.height) };
}

/** Convert poly points to an SVG path `d` string (M + L segments). */
export function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  const r = (n: number) => Math.round(n * 100) / 100;
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${r(p.x)},${r(p.y)}`).join(" ");
}

export function duplicateLayer(l: Layer, dx = 16, dy = 16): Layer {
  return {
    ...l,
    id: uid("layer"),
    name: `${l.name} copy`,
    x: l.x + dx,
    y: l.y + dy,
    points: l.points ? l.points.map((p) => ({ ...p })) : undefined,
  };
}

/* ---------- SVG import: parse + sanitize ---------- */

export interface ImportResult {
  layers: Layer[];
  rejected: string[];
  width: number;
  height: number;
}

const ALLOWED_TAGS = new Set(["rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text"]);
const BLOCKED_TAGS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "link",
  "style",
  "image",
  "video",
  "audio",
  "a",
  "animate",
  "animatetransform",
  "animatemotion",
  "set",
  "use",
]);

function numAttr(el: Element, name: string, fallback: number): number {
  const v = el.getAttribute(name);
  if (v == null || v === "") return fallback;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function strAttr(el: Element, name: string, fallback: string): string {
  const v = el.getAttribute(name);
  return v == null || v === "" ? fallback : v;
}

/** Strip anything that is not a plain color / none. Rejects url(), var(), expressions. */
function safeColor(v: string | null, fallback: string): string {
  if (v == null) return fallback;
  const t = v.trim().toLowerCase();
  if (t === "" || t === "none" || t === "transparent") return t === "" ? fallback : t;
  if (/^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)$/.test(t)) return v.trim();
  return fallback;
}

function elementToLayer(el: Element, index: number): Layer | null {
  const tag = el.tagName.toLowerCase();
  const fill = safeColor(el.getAttribute("fill"), "#9c62ff");
  const stroke = safeColor(el.getAttribute("stroke"), "none");
  const strokeWidth = Math.max(0, numAttr(el, "stroke-width", 2));
  const opacity = Math.min(1, Math.max(0, numAttr(el, "opacity", 1)));
  const common = { fill, stroke, strokeWidth, opacity, name: `${el.tagName} ${index + 1}` };

  if (tag === "rect") {
    return createLayer("rect", {
      ...common,
      x: numAttr(el, "x", 0),
      y: numAttr(el, "y", 0),
      width: Math.max(1, numAttr(el, "width", 100)),
      height: Math.max(1, numAttr(el, "height", 100)),
      cornerRadius: Math.max(numAttr(el, "rx", 0), numAttr(el, "ry", 0)),
    });
  }
  if (tag === "circle") {
    const r = Math.max(1, numAttr(el, "r", 20));
    const cx = numAttr(el, "cx", r);
    const cy = numAttr(el, "cy", r);
    return createLayer("ellipse", { ...common, x: cx - r, y: cy - r, width: r * 2, height: r * 2 });
  }
  if (tag === "ellipse") {
    const rx = Math.max(1, numAttr(el, "rx", 30));
    const ry = Math.max(1, numAttr(el, "ry", 20));
    return createLayer("ellipse", {
      ...common,
      x: numAttr(el, "cx", rx) - rx,
      y: numAttr(el, "cy", ry) - ry,
      width: rx * 2,
      height: ry * 2,
    });
  }
  if (tag === "line") {
    const x1 = numAttr(el, "x1", 0);
    const y1 = numAttr(el, "y1", 0);
    const x2 = numAttr(el, "x2", 100);
    const y2 = numAttr(el, "y2", 0);
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    return createLayer("line", {
      ...common,
      x: minX,
      y: minY,
      width: Math.max(1, Math.abs(x2 - x1)),
      height: Math.max(1, Math.abs(y2 - y1)),
      points: [
        { x: x1 - minX, y: y1 - minY },
        { x: x2 - minX, y: y2 - minY },
      ],
    });
  }
  if (tag === "polyline" || tag === "polygon") {
    const raw = el.getAttribute("points") ?? "";
    const nums = raw.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
    if (nums.length < 4) return null;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
    if (tag === "polygon" && pts.length > 0) pts.push({ ...pts[0] });
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return createLayer("path", {
      ...common,
      x: minX,
      y: minY,
      width: Math.max(1, Math.max(...xs) - minX),
      height: Math.max(1, Math.max(...ys) - minY),
      points: pts.map((p) => ({ x: p.x - minX, y: p.y - minY })),
    });
  }
  if (tag === "path") {
    const d = (el.getAttribute("d") ?? "").trim();
    if (!d || d.length > 20000) return null;
    if (!/^[MmLlHhVvCcSsQqTtAaZz0-9\s,.\-+eE()]*$/.test(d)) return null;
    return createLayer("path", {
      ...common,
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      pathData: d,
    });
  }
  if (tag === "text") {
    const text = (el.textContent ?? "").trim().slice(0, 500) || "Imported text";
    const fontSize = Math.min(200, Math.max(6, numAttr(el, "font-size", 24)));
    return createLayer("text", {
      ...common,
      x: numAttr(el, "x", 40),
      y: numAttr(el, "y", 60),
      width: Math.max(40, text.length * fontSize * 0.62),
      height: fontSize * 1.4,
      text,
      fontSize,
    });
  }
  return null;
}

/** Parse an SVG string into layers. Sanitizes: drops scripts, refs, styles, animations. */
export function parseSVGToLayers(svgText: string): ImportResult {
  const rejected: string[] = [];
  const layers: Layer[] = [];
  let width = CANVAS_DEFAULTS.width;
  let height = CANVAS_DEFAULTS.height;
  try {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    if (doc.querySelector("parsererror")) {
      return { layers, rejected: ["Could not parse SVG — invalid XML."], width, height };
    }
    const root = doc.documentElement;
    if (root.tagName.toLowerCase() !== "svg") {
      return { layers, rejected: ["Not an <svg> document."], width, height };
    }
    width = numAttr(root, "width", 0) || width;
    height = numAttr(root, "height", 0) || height;
    const vb = root.getAttribute("viewBox");
    if ((!root.getAttribute("width") || !root.getAttribute("height")) && vb) {
      const parts = vb.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
        width = Math.min(2000, parts[2]);
        height = Math.min(2000, parts[3]);
      }
    }
    const all = root.querySelectorAll("*");
    let shapeIndex = 0;
    all.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      if (BLOCKED_TAGS.has(tag)) {
        rejected.push(`<${el.tagName}> removed (not allowed in imports).`);
        return;
      }
      if (!ALLOWED_TAGS.has(tag)) return; // groups, defs, titles… walk through silently
      // Reject elements with event handlers or external refs.
      for (const attr of Array.from(el.attributes)) {
        const n = attr.name.toLowerCase();
        if (n.startsWith("on") || n === "href" || n.endsWith(":href")) {
          rejected.push(`<${el.tagName}> removed (external ref or handler).`);
          return;
        }
      }
      const layer = elementToLayer(el, shapeIndex);
      if (layer) {
        layers.push(layer);
        shapeIndex += 1;
      } else {
        rejected.push(`<${el.tagName}> skipped (unsupported geometry).`);
      }
      if (layers.length >= 300) return;
    });
    if (layers.length === 0 && rejected.length === 0) {
      rejected.push("No importable shapes found (rect, circle, ellipse, line, path, text).");
    }
  } catch {
    rejected.push("Could not parse SVG — invalid markup.");
  }
  return { layers, rejected, width, height };
}

/* ---------- 100-layer stress fixture ---------- */

const FIXTURE_FILLS = ["#9c62ff", "#b184ff", "#6d34e8", "#99e1bf", "#f0c987", "#ff7ad9", "#7ad9ff", "#e6dcf0"];

export function fixture100(): Layer[] {
  const layers: Layer[] = [];
  for (let i = 0; i < 100; i++) {
    const col = i % 10;
    const row = Math.floor(i / 10);
    const kind = i % 4;
    const type: LayerType = kind === 0 ? "rect" : kind === 1 ? "ellipse" : kind === 2 ? "line" : "path";
    layers.push(
      createLayer(type, {
        name: `Fixture ${i + 1}`,
        x: 40 + col * 72,
        y: 40 + row * 52,
        width: 56,
        height: type === "line" ? 0 : 36,
        fill: FIXTURE_FILLS[i % FIXTURE_FILLS.length],
        stroke: "none",
        cornerRadius: type === "rect" ? 6 : 0,
        points:
          type === "line"
            ? [
                { x: 0, y: 18 },
                { x: 56, y: 18 },
              ]
            : type === "path"
              ? [
                  { x: 0, y: 36 },
                  { x: 28, y: 0 },
                  { x: 56, y: 36 },
                ]
              : undefined,
      }),
    );
  }
  return layers;
}
