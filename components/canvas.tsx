/* SVGdio canvas renderer: custom SVG viewport with pan/zoom/select/drag/resize.
 * 60fps strategy: one memoized <g> per layer; drag writes direct DOM
 * translate3d (zero React renders mid-gesture, single commit on release);
 * resize/draw batch through rAF; no layout reads inside move handlers. */
"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Maximize } from "lucide-react";
import { layerCenter, pointsToPath, createLayer, type Layer, type Tool } from "@/lib/layers";

export interface CanvasProps {
  layers: Layer[];
  selectedIds: string[];
  tool: Tool;
  artboard: { width: number; height: number };
  /** Timeline preview overrides (interpolated values while playing/scrubbing). */
  overrides?: Map<string, Partial<Layer>>;
  onSelect: (ids: string[]) => void;
  onUpdate: (id: string, patch: Partial<Layer>) => void;
  onCreate: (layer: Layer) => void;
  onToolChange: (tool: Tool) => void;
  notify: (msg: string) => void;
}

/* ---------- memoized single layer node ---------- */

interface NodeProps {
  layer: Layer;
  selected: boolean;
  dragging: boolean;
  override?: Partial<Layer>;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
}

const LayerNode = memo(function LayerNode({
  layer,
  selected,
  dragging,
  override,
  onPointerDown,
}: NodeProps) {
  const l = useMemo(() => ({ ...layer, ...override }), [layer, override]);
  if (!l.visible) return null;
  const vars = {
    "--fill": l.fill,
    "--stroke": l.stroke,
  } as React.CSSProperties;
  return (
    <g
      data-layer-id={l.id}
      className={`layer-node${selected ? " selected" : ""}${dragging ? " dragging" : ""}`}
      style={{ ...vars, transform: `translate3d(${l.x}px, ${l.y}px, 0)` }}
      opacity={l.opacity}
      onPointerDown={(e) => onPointerDown(e, l.id)}
    >
      <g
        transform={
          l.rotation !== 0 ? `rotate(${l.rotation} ${l.width / 2} ${l.height / 2})` : undefined
        }
      >
        <ShapeShape l={l} />
      </g>
      {selected && (
          <rect
            x={-4}
            y={-4}
            width={Math.max(8, l.width + 8)}
            height={Math.max(8, (l.type === "line" ? 8 : l.height) + 8)}
            fill="none"
            stroke="#ffea00"
            strokeWidth={1.5 / 1}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
      )}
    </g>
  );
});

function ShapeShape({ l }: { l: Layer }) {
  switch (l.type) {
    case "rect":
      return (
        <rect
          x={0}
          y={0}
          width={l.width}
          height={l.height}
          rx={l.cornerRadius}
          fill="var(--fill)"
          stroke="var(--stroke)"
          strokeWidth={l.strokeWidth}
        />
      );
    case "ellipse":
      return (
        <ellipse
          cx={l.width / 2}
          cy={l.height / 2}
          rx={l.width / 2}
          ry={l.height / 2}
          fill="var(--fill)"
          stroke="var(--stroke)"
          strokeWidth={l.strokeWidth}
        />
      );
    case "line": {
      const pts = l.points ?? [
        { x: 0, y: 0 },
        { x: l.width, y: 0 },
      ];
      return (
        <g>
          <path
            d={pointsToPath(pts)}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(14, l.strokeWidth)}
            pointerEvents="stroke"
          />
          <path
            d={pointsToPath(pts)}
            fill="none"
            stroke={l.stroke === "none" ? "#e6dcf0" : "var(--stroke)"}
            strokeWidth={l.strokeWidth}
            strokeLinecap="round"
          />
        </g>
      );
    }
    case "text":
      return (
        <text
          x={0}
          y={l.fontSize ?? 24}
          fontSize={l.fontSize ?? 24}
          fontFamily="Manrope, system-ui, sans-serif"
          fill="var(--fill)"
        >
          {l.text ?? ""}
        </text>
      );
    case "path": {
      const d = l.pathData ?? pointsToPath(l.points ?? []);
      return (
        <path
          d={d}
          fill="var(--fill)"
          stroke="var(--stroke)"
          strokeWidth={l.strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      );
    }
  }
}

/* ---------- canvas ---------- */

export function Canvas({
  layers,
  selectedIds,
  tool,
  artboard,
  overrides,
  onSelect,
  onUpdate,
  onCreate,
  onToolChange,
  notify,
}: CanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 48, y: 40 });
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [spaceDown, setSpaceDown] = useState(false);
  const [draft, setDraft] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    tool: Tool;
  } | null>(null);
  const [penPoints, setPenPoints] = useState<{ x: number; y: number }[] | null>(null);
  const [penPreview, setPenPreview] = useState<{ x: number; y: number } | null>(null);
  const gestureRef = useRef<null | {
    kind: "pan" | "drag" | "draw" | "resize" | "rotate" | "scrub-pen";
    startX: number;
    startY: number;
    origPan: { x: number; y: number };
    ids: string[];
    orig: Map<string, { x: number; y: number }>;
    corner?: string;
    resizeOrig?: { x: number; y: number; width: number; height: number };
    raf: number;
    moved: boolean;
  }>(null);
  const dragNodeRefs = useRef(new Map<string, SVGGElement>());
  const fpsRef = useRef<HTMLSpanElement>(null);
  const byId = useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const primarySelected =
    selectedIds.length > 0 ? byId.get(selectedIds[selectedIds.length - 1]) : undefined;

  /* surface transform — pan/zoom write style directly, no re-render needed */
  useEffect(() => {
    const el = surfaceRef.current;
    if (el) el.style.transform = `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`;
  }, [pan, zoom]);

  const finishPen = useCallback(() => {
    if (!penPoints || penPoints.length < 2) {
      setPenPoints(null);
      setPenPreview(null);
      return;
    }
    const xs = penPoints.map((p) => p.x);
    const ys = penPoints.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    onCreate(
      createLayer("path", {
        x: Math.round(minX * 10) / 10,
        y: Math.round(minY * 10) / 10,
        width: Math.max(1, Math.round((Math.max(...xs) - minX) * 10) / 10),
        height: Math.max(1, Math.round((Math.max(...ys) - minY) * 10) / 10),
        points: penPoints.map((p) => ({
          x: Math.round((p.x - minX) * 10) / 10,
          y: Math.round((p.y - minY) * 10) / 10,
        })),
      }),
    );
    setPenPoints(null);
    setPenPreview(null);
    onToolChange("select");
    notify("Path created — Esc finished pen mode");
  }, [penPoints, onCreate, onToolChange, notify]);

  /* keyboard: space-pan, delete, escape, arrows */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
      )
        return;
      if (e.code === "Space") {
        setSpaceDown(true);
        e.preventDefault();
      } else if (e.key === "Escape") {
        if (penPoints) {
          finishPen();
        } else {
          onSelect([]);
          if (tool !== "select") onToolChange("select");
        }
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("svgdio:delete-selected"));
      } else if (e.key.startsWith("Arrow") && selectedIds.length > 0) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        for (const id of selectedIds) {
          const l = byId.get(id);
          if (l && !l.locked)
            onUpdate(id, {
              x: Math.round((l.x + dx) * 10) / 10,
              y: Math.round((l.y + dy) * 10) / 10,
            });
        }
      } else if ((e.key === "v" || e.key === "V") && !e.metaKey && !e.ctrlKey)
        onToolChange("select");
      else if (e.key === "r" || e.key === "R") onToolChange("rect");
      else if (e.key === "o" || e.key === "O") onToolChange("ellipse");
      else if (e.key === "l" || e.key === "L") onToolChange("line");
      else if (e.key === "t" || e.key === "T") onToolChange("text");
      else if (e.key === "p" || e.key === "P") onToolChange("pen");
      else if (e.key === "h" || e.key === "H") onToolChange("pan");
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, penPoints, tool, byId]);

  const toArtboard = useCallback(
    (clientX: number, clientY: number) => {
      const stage = stageRef.current;
      if (!stage) return { x: 0, y: 0 };
      const rect = stage.getBoundingClientRect();
      return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom };
    },
    [pan, zoom],
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        setZoom((z) => {
          const next = Math.min(4, Math.max(0.2, z * Math.exp(-e.deltaY * 0.002)));
          const k = next / z;
          setPan((p) => ({ x: mx - (mx - p.x) * k, y: my - (my - p.y) * k }));
          return next;
        });
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    stage.addEventListener("wheel", handler, { passive: false });
    return () => stage.removeEventListener("wheel", handler);
  }, []);

  const fpsFrames = useRef<number[]>([]);
  function fpsTick() {
    const now = performance.now();
    const arr = fpsFrames.current;
    arr.push(now);
    while (arr.length > 0 && now - arr[0] > 500) arr.shift();
    if (fpsRef.current && arr.length > 4) {
      const span = (arr[arr.length - 1] - arr[0]) / 1000;
      const fps = span > 0 ? Math.round((arr.length - 1) / span) : 0;
      fpsRef.current.textContent = `${fps}fps`;
    }
  }

  /* pointer handlers — one layout read per gesture (cached rect), then pure math */
  const onStagePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const stage = stageRef.current;
      if (!stage) return;
      stage.focus({ preventScroll: true });
      if (e.button === 1 || tool === "pan" || spaceDown) {
        stage.setPointerCapture(e.pointerId);
        gestureRef.current = {
          kind: "pan",
          startX: e.clientX,
          startY: e.clientY,
          origPan: { ...pan },
          ids: [],
          orig: new Map(),
          raf: 0,
          moved: false,
        };
        return;
      }
      if (e.button !== 0) return;
      const pt = toArtboard(e.clientX, e.clientY);
      const inside = pt.x >= 0 && pt.y >= 0 && pt.x <= artboard.width && pt.y <= artboard.height;

      if (tool === "pen") {
        if (!inside) return;
        const snapped = { x: Math.round(pt.x * 2) / 2, y: Math.round(pt.y * 2) / 2 };
        setPenPoints((prev) => (prev ? [...prev, snapped] : [snapped]));
        return;
      }
      if (tool === "text") {
        if (!inside) {
          notify("Click inside the artboard to place text");
          return;
        }
        onCreate(createLayer("text", { x: Math.round(pt.x), y: Math.round(pt.y) }));
        onToolChange("select");
        return;
      }
      if (tool === "rect" || tool === "ellipse" || tool === "line") {
        if (!inside) return;
        stage.setPointerCapture(e.pointerId);
        gestureRef.current = {
          kind: "draw",
          startX: pt.x,
          startY: pt.y,
          origPan: { ...pan },
          ids: [],
          orig: new Map(),
          raf: 0,
          moved: false,
        };
        setDraft({ x: pt.x, y: pt.y, w: 0, h: 0, tool });
        return;
      }
      // select tool on empty stage: start pan (background drag pans)
      if ((e.target as HTMLElement).closest("[data-layer-id]") == null) {
        stage.setPointerCapture(e.pointerId);
        gestureRef.current = {
          kind: "pan",
          startX: e.clientX,
          startY: e.clientY,
          origPan: { ...pan },
          ids: [],
          orig: new Map(),
          raf: 0,
          moved: false,
        };
      }
    },
    [tool, spaceDown, pan, artboard, toArtboard, onCreate, onToolChange, notify],
  );

  const onLayerPointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      if (tool !== "select" || spaceDown) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      const layer = byId.get(id);
      if (!layer || layer.locked) {
        if (layer?.locked) notify("Layer is locked — unlock it in the layer list");
        return;
      }
      let ids = selectedIds;
      if (!selectedSet.has(id)) {
        ids = e.shiftKey ? [...selectedIds, id] : [id];
        onSelect(ids);
      } else if (e.shiftKey) {
        ids = selectedIds.filter((s) => s !== id);
        onSelect(ids);
        return;
      }
      const stage = stageRef.current;
      if (stage) stage.setPointerCapture(e.pointerId);
      const orig = new Map<string, { x: number; y: number }>();
      for (const did of ids) {
        const l = byId.get(did);
        if (l && !l.locked) orig.set(did, { x: l.x, y: l.y });
      }
      gestureRef.current = {
        kind: "drag",
        startX: e.clientX,
        startY: e.clientY,
        origPan: { ...pan },
        ids: [...orig.keys()],
        orig,
        raf: 0,
        moved: false,
      };
      setDragIds([...orig.keys()]);
      // cache live DOM nodes once (single query, no per-move reads)
      dragNodeRefs.current.clear();
      const svg = stage?.querySelector("svg");
      if (svg) {
        for (const did of orig.keys()) {
          const node = svg.querySelector(`[data-layer-id="${did}"]`);
          if (node) dragNodeRefs.current.set(did, node as SVGGElement);
        }
      }
    },
    [tool, spaceDown, byId, selectedIds, selectedSet, onSelect, pan, notify],
  );

  const onStagePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const g = gestureRef.current;
      if (tool === "pen" && penPoints) {
        setPenPreview(toArtboard(e.clientX, e.clientY));
      }
      if (!g) return;
      if (g.raf) return;
      const cx = e.clientX;
      const cy = e.clientY;
      g.raf = requestAnimationFrame(() => {
        g.raf = 0;
        if (g.kind === "pan") {
          const dx = cx - g.startX;
          const dy = cy - g.startY;
          if (Math.abs(dx) + Math.abs(dy) > 2) g.moved = true;
          setPan({ x: g.origPan.x + dx, y: g.origPan.y + dy });
        } else if (g.kind === "drag") {
          const dx = (cx - g.startX) / zoom;
          const dy = (cy - g.startY) / zoom;
          if (Math.abs(dx) + Math.abs(dy) > 0.5) g.moved = true;
          // direct DOM writes — no React render until release
          for (const [id, o] of g.orig) {
            const node = dragNodeRefs.current.get(id);
            if (node) node.style.transform = `translate3d(${o.x + dx}px, ${o.y + dy}px, 0)`;
          }
          const sel = document.getElementById("svgdio-selection-box");
          if (sel && g.ids.length === 1) {
            const o = g.orig.get(g.ids[0]);
            if (o) {
              sel.style.transform = `translate3d(${o.x + dx}px, ${o.y + dy}px, 0)`;
            }
          }
          fpsTick();
        } else if (g.kind === "draw") {
          const pt = toArtboard(cx, cy);
          const x = Math.min(g.startX, pt.x);
          const y = Math.min(g.startY, pt.y);
          setDraft({
            x: Math.max(0, x),
            y: Math.max(0, y),
            w: Math.abs(pt.x - g.startX),
            h: Math.abs(pt.y - g.startY),
            tool: draft?.tool ?? "rect",
          });
          g.moved = true;
        } else if (g.kind === "resize" && g.resizeOrig && g.ids.length === 1) {
          const dx = (cx - g.startX) / zoom;
          const dy = (cy - g.startY) / zoom;
          g.moved = true;
          const o = g.resizeOrig;
          const corner = g.corner ?? "se";
          let { x, y, width, height } = o;
          if (corner.includes("e")) width = Math.max(4, o.width + dx);
          if (corner.includes("s")) height = Math.max(4, o.height + dy);
          if (corner.includes("w")) {
            width = Math.max(4, o.width - dx);
            x = o.x + o.width - width;
          }
          if (corner.includes("n")) {
            height = Math.max(4, o.height - dy);
            y = o.y + o.height - height;
          }
          onUpdate(g.ids[0], {
            x: Math.round(x * 10) / 10,
            y: Math.round(y * 10) / 10,
            width: Math.round(width * 10) / 10,
            height: Math.round(height * 10) / 10,
          });
        } else if (g.kind === "rotate" && g.ids.length === 1) {
          const l = byId.get(g.ids[0]);
          if (l) {
            g.moved = true;
            const c = layerCenter(l);
            const pt = toArtboard(cx, cy);
            const ang = (Math.atan2(pt.y - c.y, pt.x - c.x) * 180) / Math.PI + 90;
            onUpdate(g.ids[0], { rotation: Math.round(ang % 360) });
          }
        }
      });
    },
    [tool, penPoints, zoom, toArtboard, draft, onUpdate, byId],
  );

  const onStagePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const g = gestureRef.current;
      gestureRef.current = null;
      if (g?.raf) cancelAnimationFrame(g.raf);
      if (!g) return;
      if (g.kind === "pan" && !g.moved && tool === "select" && !spaceDown) {
        // plain click on empty stage clears selection
        if ((e.target as HTMLElement).closest("[data-layer-id]") == null) onSelect([]);
      }
      if (g.kind === "drag" && g.ids.length > 0) {
        const dx = (e.clientX - g.startX) / zoom;
        const dy = (e.clientY - g.startY) / zoom;
        dragNodeRefs.current.clear();
        if (g.moved) {
          for (const [id, o] of g.orig) {
            onUpdate(id, {
              x: Math.round((o.x + dx) * 10) / 10,
              y: Math.round((o.y + dy) * 10) / 10,
            });
          }
        }
        setDragIds([]);
      }
      if (g.kind === "draw" && draft && (draft.w > 4 || draft.h > 4)) {
        const t = draft.tool === "line" ? "line" : draft.tool === "ellipse" ? "ellipse" : "rect";
        const layer = createLayer(t, {
          x: Math.round(draft.x * 10) / 10,
          y: Math.round(draft.y * 10) / 10,
          width: Math.round(Math.max(4, draft.w) * 10) / 10,
          height: Math.round(Math.max(4, draft.h) * 10) / 10,
          points:
            t === "line"
              ? [
                  { x: 0, y: 0 },
                  { x: Math.round(Math.max(4, draft.w)), y: Math.round(Math.max(4, draft.h)) },
                ]
              : undefined,
        });
        onCreate(layer);
        onToolChange("select");
      }
      setDraft(null);
    },
    [tool, spaceDown, zoom, draft, onSelect, onUpdate, onCreate, onToolChange],
  );

  const beginResize = useCallback(
    (e: React.PointerEvent, corner: string) => {
      if (primarySelected == null || primarySelected.locked) return;
      e.stopPropagation();
      e.preventDefault();
      const stage = stageRef.current;
      if (stage) stage.setPointerCapture(e.pointerId);
      gestureRef.current = {
        kind: "resize",
        startX: e.clientX,
        startY: e.clientY,
        origPan: { x: 0, y: 0 },
        ids: [primarySelected.id],
        orig: new Map(),
        corner,
        resizeOrig: {
          x: primarySelected.x,
          y: primarySelected.y,
          width: primarySelected.width,
          height: primarySelected.height,
        },
        raf: 0,
        moved: false,
      };
    },
    [primarySelected],
  );

  const beginRotate = useCallback(
    (e: React.PointerEvent) => {
      if (primarySelected == null || primarySelected.locked) return;
      e.stopPropagation();
      e.preventDefault();
      const stage = stageRef.current;
      if (stage) stage.setPointerCapture(e.pointerId);
      gestureRef.current = {
        kind: "rotate",
        startX: e.clientX,
        startY: e.clientY,
        origPan: { x: 0, y: 0 },
        ids: [primarySelected.id],
        orig: new Map(),
        raf: 0,
        moved: false,
      };
    },
    [primarySelected],
  );

  const fitView = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const z = Math.min(
      (rect.width - 120) / artboard.width,
      (rect.height - 120) / artboard.height,
      1.5,
    );
    const clamped = Math.min(1.5, Math.max(0.2, z));
    setZoom(clamped);
    setPan({
      x: (rect.width - artboard.width * clamped) / 2,
      y: (rect.height - artboard.height * clamped) / 2,
    });
  }, [artboard]);

  useEffect(() => {
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const penPath =
    penPoints && penPoints.length > 0
      ? pointsToPath(penPreview ? [...penPoints, penPreview] : penPoints)
      : null;

  return (
    <div
      ref={stageRef}
      className={`stage${spaceDown || tool === "pan" ? " panning" : ""}${tool !== "select" && tool !== "pan" ? " tool-draw" : ""}`}
      tabIndex={0}
      onPointerDown={onStagePointerDown}
      onPointerMove={onStagePointerMove}
      onPointerUp={onStagePointerUp}
      onDoubleClick={() => {
        if (tool === "pen") finishPen();
      }}
      aria-label="SVG canvas"
    >
      <div ref={surfaceRef} className="stage-surface">
        <div className="artboard" style={{ width: artboard.width, height: artboard.height }}>
          <svg
            width={artboard.width}
            height={artboard.height}
            viewBox={`0 0 ${artboard.width} ${artboard.height}`}
          >
            {layers.map((l) => (
              <LayerNode
                key={l.id}
                layer={l}
                selected={selectedSet.has(l.id)}
                dragging={dragIds.includes(l.id)}
                override={overrides?.get(l.id)}
                onPointerDown={onLayerPointerDown}
              />
            ))}
            {draft && draft.w > 1 && draft.h > 1 && (
              <g style={{ transform: `translate3d(${draft.x}px, ${draft.y}px, 0)` }}>
                {draft.tool === "ellipse" ? (
                  <ellipse
                    cx={draft.w / 2}
                    cy={draft.h / 2}
                    rx={draft.w / 2}
                    ry={draft.h / 2}
                    fill="rgba(255,234,0,0.3)"
                    stroke="#ffea00"
                    strokeDasharray="5 4"
                  />
                ) : draft.tool === "line" ? (
                  <line
                    x1={0}
                    y1={0}
                    x2={draft.w}
                    y2={draft.h}
                    stroke="#ffea00"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                ) : (
                  <rect
                    width={draft.w}
                    height={draft.h}
                    rx={8}
                    fill="rgba(255,234,0,0.3)"
                    stroke="#ffea00"
                    strokeDasharray="5 4"
                  />
                )}
              </g>
            )}
            {penPath && (
              <path
                d={penPath}
                fill="none"
                stroke="#ffea00"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray={penPreview ? "none" : undefined}
              />
            )}
            {penPoints?.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#e6d400" stroke="#ccbb00" />
            ))}
          </svg>
        </div>
        {primarySelected && !primarySelected.locked && (
          <div
            id="svgdio-selection-box"
            className="selection-box"
            style={{
              width: Math.max(8, primarySelected.width),
              height: Math.max(8, primarySelected.type === "line" ? 8 : primarySelected.height),
              transform: `translate3d(${primarySelected.x}px, ${primarySelected.y}px, 0)`,
            }}
          >
            {(["nw", "ne", "sw", "se"] as const).map((c) => (
              <div
                key={c}
                className="resize-handle"
                style={{
                  left: c.includes("w") ? -6 : undefined,
                  right: c.includes("e") ? -6 : undefined,
                  top: c.includes("n") ? -6 : undefined,
                  bottom: c.includes("s") ? -6 : undefined,
                  cursor: c === "nw" || c === "se" ? "nwse-resize" : "nesw-resize",
                }}
                onPointerDown={(e) => beginResize(e, c)}
              />
            ))}
            <div
              className="resize-handle"
              title="Rotate"
              style={{ left: "50%", top: -26, marginLeft: -5, borderRadius: "50%", cursor: "grab" }}
              onPointerDown={beginRotate}
            />
          </div>
        )}
      </div>

      <div className="stage-hud">
        <i />
        <span>{layers.length} layers</span>
        <span className="warn">{tool !== "select" ? `● ${tool}` : ""}</span>
        <span ref={fpsRef} title="Frame rate during drag">
          —fps
        </span>
      </div>
      <div className="zoom-controls" role="toolbar" aria-label="Zoom">
        <button
          onClick={() => setZoom((z) => Math.max(0.2, +(z / 1.2).toFixed(2)))}
          aria-label="Zoom out"
        >
          <Minus size={13} />
        </button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((z) => Math.min(4, +(z * 1.2).toFixed(2)))}
          aria-label="Zoom in"
        >
          <Plus size={13} />
        </button>
        <button onClick={fitView} aria-label="Fit to view">
          <Maximize size={13} />
        </button>
      </div>
    </div>
  );
}
