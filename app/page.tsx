/* SVGdio studio: hero landing + canvas workspace with dark/light theme. */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  Hand,
  Minus,
  MousePointer2,
  PenTool,
  Shapes,
  Square,
  Type,
  FileUp,
  FolderOpen,
  Download,
  LayoutTemplate,
  FlaskConical,
  Trash2,
  Sun,
  Moon,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import { Canvas } from "@/components/canvas";
import { LayerList } from "@/components/layers";
import { Inspector } from "@/components/inspector";
import { TimelineDock } from "@/components/timeline";
import {
  ExportModal,
  ImportModal,
  TemplatesModal,
  instantiateTemplate,
  type Template,
} from "@/components/modals";
import { Onboarding } from "@/components/onboarding";
import { TutorialNote } from "@/components/tutorial-note";
import { BrandMark } from "@/components/brand-mark";
import FluxLines from "@/components/flux-lines";
import { createLayer, duplicateLayer, fixture100, type Layer, type Tool } from "@/lib/layers";
import type { Timeline } from "@/lib/compile";
import {
  defaultSnapshot,
  importProjectJSON,
  loadSnapshot,
  saveSnapshot,
  type WorkspaceSnapshot,
} from "@/lib/storage";

type Modal = null | "export" | "import" | "templates";

const RAIL_TOOLS: { id: Tool; icon: React.ReactNode; label: string; kbd: string }[] = [
  { id: "select", icon: <MousePointer2 size={16} />, label: "Select (V)", kbd: "V" },
  { id: "rect", icon: <Square size={16} />, label: "Rectangle (R)", kbd: "R" },
  { id: "ellipse", icon: <Circle size={16} />, label: "Ellipse (O)", kbd: "O" },
  { id: "line", icon: <Minus size={16} />, label: "Line (L)", kbd: "L" },
  { id: "text", icon: <Type size={16} />, label: "Text (T)", kbd: "T" },
  {
    id: "pen",
    icon: <PenTool size={16} />,
    label: "Pen (P) — click points, Esc to finish",
    kbd: "P",
  },
  { id: "pan", icon: <Hand size={16} />, label: "Pan (H) — or hold Space", kbd: "H" },
];

const MIN_PANEL = 180;
const MAX_PANEL = 420;

export default function StudioPage() {
  /* ---------- theme ---------- */
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem("svgdio.theme");
    return (stored === "light" ? "light" : "dark") as "dark" | "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("svgdio.theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  /* ---------- adjustable panes ---------- */
  const [leftWidth, setLeftWidth] = useState(264);
  const [rightWidth, setRightWidth] = useState(264);
  const [, setDrag] = useState<{ side: "left" | "right"; startX: number; startWidth: number } | null>(null);

  const onResizeStart = (side: "left" | "right") => (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = side === "left" ? leftWidth : rightWidth;
    setDrag({ side, startX, startWidth });
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (side === "left") {
        setLeftWidth(Math.min(MAX_PANEL, Math.max(MIN_PANEL, startWidth + dx)));
      } else {
        setRightWidth(Math.min(MAX_PANEL, Math.max(MIN_PANEL, startWidth - dx)));
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* ---------- workspace state ---------- */
  const [snap, setSnap] = useState<WorkspaceSnapshot>(defaultSnapshot);
  const loadedRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [overrides, setOverrides] = useState<Map<string, Partial<Layer>>>(new Map());
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(0);
  const toastTimer = useRef(0);
  const openRef = useRef<HTMLInputElement>(null);
  const [showHero, setShowHero] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const { layers, timeline, artboard } = snap;

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-mount load so SSR HTML matches first paint.
    setSnap(loadSnapshot());
    loadedRef.current = true;
    const onboarded = localStorage.getItem("svgdio.onboarded");
    if (!onboarded) setShowOnboarding(true);
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    const t = window.setTimeout(() => {
      saveSnapshot(snap);
      setSavedTick((v) => v + 1);
    }, 400);
    return () => window.clearTimeout(t);
  }, [snap]);

  const setLayers = useCallback((fn: (prev: Layer[]) => Layer[]) => {
    setSnap((s) => ({ ...s, layers: fn(s.layers) }));
  }, []);
  const setTimeline = useCallback((t: Timeline) => {
    setSnap((s) => ({ ...s, timeline: t }));
  }, []);

  const updateLayer = useCallback(
    (id: string, patch: Partial<Layer>) => {
      setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    },
    [setLayers],
  );

  const createOnCanvas = useCallback(
    (layer: Layer) => {
      setLayers((prev) => [...prev, layer]);
      setSelectedIds([layer.id]);
    },
    [setLayers],
  );

  const deleteIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const gone = new Set(ids);
      setLayers((prev) => prev.filter((l) => !gone.has(l.id)));
      setSnap((s) => ({
        ...s,
        timeline: { ...s.timeline, tracks: s.timeline.tracks.filter((t) => !gone.has(t.layerId)) },
      }));
      setSelectedIds((prev) => prev.filter((id) => !gone.has(id)));
    },
    [setLayers],
  );

  useEffect(() => {
    const onDelete = () => deleteIds(selectedIds);
    window.addEventListener("svgdio:delete-selected", onDelete);
    return () => window.removeEventListener("svgdio:delete-selected", onDelete);
  }, [selectedIds, deleteIds]);

  const duplicateIds = useCallback(
    (ids: string[]) => {
      const byId = new Map(layers.map((l) => [l.id, l]));
      const copies = ids
        .map((id) => byId.get(id))
        .filter((l): l is Layer => !!l)
        .map((l) => duplicateLayer(l));
      if (copies.length === 0) return;
      setLayers((prev) => [...prev, ...copies]);
      setSelectedIds(copies.map((c) => c.id));
    },
    [layers, setLayers],
  );

  const reorder = useCallback(
    (id: string, dir: -1 | 1) => {
      setLayers((prev) => {
        const i = prev.findIndex((l) => l.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= prev.length) return prev;
        const next = [...prev];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      });
    },
    [setLayers],
  );

  const importLayers = useCallback(
    (fresh: Layer[]) => {
      setLayers((prev) => [...prev, ...fresh]);
      setSelectedIds(fresh.map((l) => l.id));
    },
    [setLayers],
  );

  const pickTemplate = useCallback(
    (t: Template) => {
      const { layers: fresh, timeline: tplTimeline } = instantiateTemplate(t);
      setLayers((prev) => [...prev, ...fresh]);
      if (tplTimeline) {
        setSnap((s) => ({
          ...s,
          timeline: {
            duration: Math.max(s.timeline.duration, tplTimeline.duration),
            tracks: [...s.timeline.tracks, ...tplTimeline.tracks],
          },
        }));
      }
      setSelectedIds(fresh.map((l) => l.id));
      notify(`Template added: ${t.name}`);
    },
    [setLayers, notify],
  );

  const loadFixture = useCallback(() => {
    const fresh = fixture100();
    setSnap((s) => ({
      ...s,
      layers: fresh,
      timeline: { duration: s.timeline.duration, tracks: [] },
    }));
    setSelectedIds([]);
    notify("100-layer fixture loaded — drag a layer, watch the fps meter");
  }, [notify]);

  const clearAll = useCallback(() => {
    setSnap((s) => ({ ...s, layers: [], timeline: { duration: 2, tracks: [] } }));
    setSelectedIds([]);
    notify("Canvas cleared");
  }, [notify]);

  const openProjectFile = useCallback(
    (f: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const next = importProjectJSON(String(reader.result ?? ""));
          setSnap(next);
          setSelectedIds([]);
          notify(`Project opened — ${next.layers.length} layers`);
        } catch {
          notify("Could not open project — invalid JSON");
        }
      };
      reader.readAsText(f);
    },
    [notify],
  );

  const selectedLayer = useMemo(
    () => (selectedIds.length === 1 ? layers.find((l) => l.id === selectedIds[0]) : undefined),
    [layers, selectedIds],
  );

  return (
    <div className="studio" data-theme={theme}>
      {/* ---------- hero landing ---------- */}
      {showHero && (
        <section className="hero" aria-label="SVGdio hero">
          <div className="hero-bg">
            <FluxLines
              colors={["#ffea00", "#ffea00", "#ccbb00"]}
              speed={0.4}
              scale={1.7}
              turbulence={0.9}
              fluidity={0.12}
              rimWidth={0.18}
              sharpness={2.4}
              shimmer={1.4}
              glow={1.6}
              lineWidth={1}
              flowDirection="down"
              opacity={0.9}
              mouseInteraction
              clickSwirl
              intro
              lightMode={theme === "light"}
              transparent
              backgroundColor={theme === "light" ? "#ffffff" : "#000000"}
            />
          </div>
          <div className="hero-content">
            <div className="hero-kicker">
              <i />
              <span>SVG &middot; CSS canvas studio</span>
            </div>
            <h1 className="hero-title">Draw. Arrange. Animate. Export.</h1>
            <p className="hero-sub">
              A minimal studio for layer-based SVG composition. Build on a quiet canvas, style every
              layer in the inspector, sequence motion on the timeline, and download standalone SVG +
              CSS. No account, no server, nothing leaves your browser.
            </p>
            <div className="hero-actions">
              <button
                className="hero-btn"
                onClick={() => setShowHero(false)}
              >
                Open studio <ArrowUpRight size={15} />
              </button>
              <a className="hero-btn outline" href="#learn">
                Learn more
              </a>
            </div>
          </div>
        </section>
      )}

      {/* ---------- studio workspace ---------- */}
      {!showHero && (
        <>
          <header className="studio-topbar">
            <span className="studio-brand">
              <BrandMark className="studio-mark" />
              <span className="studio-word">
                SVG<em>dio</em>
              </span>
            </span>
            <span className="topbar-sep" />
            <span className="topbar-doc">
              <i />
              {artboard.width}×{artboard.height} · {layers.length} layers
            </span>
            <span className="topbar-spacer" />
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <span className="topbar-hint" title="Last autosaved">
              autosaved {savedTick > 0 ? "✓" : "…"}
            </span>
            <button
              className="topbar-btn"
              onClick={() => setModal("templates")}
              title="Starter templates"
            >
              <LayoutTemplate size={14} /> Templates
            </button>
            <button
              className="topbar-btn"
              onClick={() => setModal("import")}
              title="Import SVG (paste or file)"
            >
              <FileUp size={14} /> Import
            </button>
            <button
              className="topbar-btn"
              onClick={() => openRef.current?.click()}
              title="Open project JSON"
            >
              <FolderOpen size={14} /> Open
            </button>
            <button
              className="topbar-btn primary"
              onClick={() => setModal("export")}
              title="Export SVG + CSS"
            >
              <Download size={14} /> Export
            </button>
            <input
              ref={openRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) openProjectFile(f);
                e.target.value = "";
              }}
            />
          </header>

          <div className="studio-main">
            <nav className="tool-rail" aria-label="Tools">
              {RAIL_TOOLS.map((t) => (
                <button
                  key={t.id}
                  className={`rail-btn${tool === t.id ? " active" : ""}`}
                  title={t.label}
                  aria-label={t.label}
                  aria-pressed={tool === t.id}
                  onClick={() => setTool(t.id)}
                >
                  {t.icon}
                </button>
              ))}
              <span className="rail-sep" />
              <button
                className="rail-btn"
                title="Add rectangle"
                aria-label="Add rectangle"
                onClick={() => createOnCanvas(createLayer("rect"))}
              >
                <Shapes size={16} />
              </button>
              <button
                className="rail-btn"
                title="Load 100-layer stress fixture"
                aria-label="Load fixture"
                onClick={loadFixture}
              >
                <FlaskConical size={16} />
              </button>
              <span className="rail-spacer" />
              <button
                className="rail-btn"
                title="Delete all layers + tracks"
                aria-label="Clear all"
                onClick={clearAll}
              >
                <Trash2 size={16} />
              </button>
            </nav>

            <aside
              className="side-panel left"
              aria-label="Layers panel"
              style={{ width: leftWidth, position: "relative" }}
            >
              <div className="panel-head" style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                  LAYERS
                  <div
                    className="panel-resizer left"
                    onPointerDown={onResizeStart("left")}
                    style={{ touchAction: "none" }}
                  />
                </div>
                <span className="count">{layers.length}</span>
                <button onClick={() => createOnCanvas(createLayer("rect"))} title="Add rectangle">
                  <Plus size={12} /> Add
                </button>
              </div>
              <LayerList
                layers={layers}
                selectedIds={selectedIds}
                onSelect={setSelectedIds}
                onUpdate={updateLayer}
                onReorder={reorder}
                onDelete={deleteIds}
                onDuplicate={duplicateIds}
                onAdd={() => createOnCanvas(createLayer("rect"))}
              />
            </aside>

            <div className="stage-wrap">
              <Canvas
                layers={layers}
                selectedIds={selectedIds}
                tool={tool}
                artboard={artboard}
                overrides={overrides}
                onSelect={setSelectedIds}
                onUpdate={updateLayer}
                onCreate={createOnCanvas}
                onToolChange={setTool}
                notify={notify}
              />
              {layers.length === 0 && (
                <div className="empty-canvas-cta">
                  <button className="btn" onClick={() => setModal("templates")}>
                    Templates
                  </button>
                  <button className="btn" onClick={() => setModal("import")}>
                    Import SVG
                  </button>
                  <button className="btn" onClick={() => createOnCanvas(createLayer("rect"))}>
                    Draw rect <span className="kbd">R</span>
                  </button>
                </div>
              )}
              <TimelineDock
                timeline={timeline}
                layers={layers}
                selectedIds={selectedIds}
                onChange={setTimeline}
                onPreview={setOverrides}
                notify={notify}
              />
            </div>

            <aside
              className="side-panel right"
              aria-label="Inspector panel"
              style={{ width: rightWidth, position: "relative" }}
            >
              <div className="panel-head" style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                  INSPECTOR
                  <div
                    className="panel-resizer right"
                    onPointerDown={onResizeStart("right")}
                    style={{ touchAction: "none" }}
                  />
                </div>
                <span className="count">
                  {selectedLayer ? (selectedLayer.type.charAt(0).toUpperCase() + selectedLayer.type.slice(1)) : "—"}
                </span>
              </div>
              <Inspector
                layer={selectedLayer}
                multiCount={selectedIds.length}
                onUpdate={updateLayer}
              />
            </aside>
          </div>

          <div className={`toast${toast ? " show" : ""}`} role="status">
            {toast}
          </div>
          {showOnboarding && (
            <Onboarding onFinish={() => setShowOnboarding(false)} />
          )}
          {!showOnboarding && <TutorialNote />}
          {modal === "export" && (
            <ExportModal
              layers={layers}
              timeline={timeline}
              artboard={artboard}
              onClose={() => setModal(null)}
              notify={notify}
            />
          )}
          {modal === "import" && (
            <ImportModal onImport={importLayers} onClose={() => setModal(null)} notify={notify} />
          )}
          {modal === "templates" && (
            <TemplatesModal onPick={pickTemplate} onClose={() => setModal(null)} />
          )}
        </>
      )}
    </div>
  );
}
