/* SVGdio modals: export (SVG/CSS/JSON), import (paste + file), templates. */
"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Copy, Download, FileUp, X } from "lucide-react";
import { layersToSVG, timelineToFullCSS, type Timeline } from "@/lib/compile";
import { parseSVGToLayers, type Layer } from "@/lib/layers";
import { copyText, downloadFile, exportProjectJSON } from "@/lib/storage";
import { TEMPLATES, instantiateTemplate, type Template } from "@/lib/templates";

/* ---------- shared shell ---------- */

function Shell({
  title,
  onClose,
  children,
  foot,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  foot?: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          {title}
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

/* ---------- export ---------- */

export function ExportModal({
  layers,
  timeline,
  artboard,
  onClose,
  notify,
}: {
  layers: Layer[];
  timeline: Timeline;
  artboard: { width: number; height: number };
  onClose: () => void;
  notify: (msg: string) => void;
}) {
  const [tab, setTab] = useState<"svg" | "css" | "json">("svg");
  const [copied, setCopied] = useState(false);
  const svg = useMemo(
    () => layersToSVG(layers, artboard.width, artboard.height),
    [layers, artboard],
  );
  const css = useMemo(() => timelineToFullCSS(timeline, layers), [timeline, layers]);
  const json = useMemo(
    () =>
      exportProjectJSON({
        version: 1,
        savedAt: new Date().toISOString(),
        layers,
        timeline,
        artboard,
      }),
    [layers, timeline, artboard],
  );
  const current = tab === "svg" ? svg : tab === "css" ? css : json;

  const doCopy = async () => {
    const ok = await copyText(current);
    notify(
      ok ? `${tab.toUpperCase()} copied to clipboard` : "Copy failed — select the code manually",
    );
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };
  const doDownload = () => {
    const name =
      tab === "svg"
        ? "svigdio-export.svg"
        : tab === "css"
          ? "svigdio-motion.css"
          : "svigdio-project.json";
    const mime = tab === "svg" ? "image/svg+xml" : tab === "css" ? "text/css" : "application/json";
    downloadFile(name, current, mime);
    notify(`Downloaded ${name}`);
  };

  return (
    <Shell
      title="Export"
      onClose={onClose}
      foot={
        <>
          <button className="btn" onClick={doCopy}>
            {copied ? <Check size={13} /> : <Copy size={13} />} Copy
          </button>
          <button className="btn primary" onClick={doDownload}>
            <Download size={13} /> Download .{tab}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["svg", "css", "json"] as const).map((t) => (
          <button
            key={t}
            className="tl-btn"
            style={tab === t ? { borderColor: "var(--accent)", color: "#d7baff" } : undefined}
            onClick={() => setTab(t)}
          >
            {t === "svg" ? "SVG file" : t === "css" ? "CSS keyframes" : "Project JSON"}
          </button>
        ))}
      </div>
      <pre className="code-preview" style={{ maxHeight: 320 }}>
        {current}
      </pre>
      <p className="transform-note">
        {tab === "svg" && "Standalone .svg — drop it anywhere, no runtime needed."}
        {tab === "css" && "Apply to the exported SVG: element ids match the animation selectors."}
        {tab === "json" && "Full workspace snapshot — re-import via the Import dialog."}
      </p>
    </Shell>
  );
}

/* ---------- import ---------- */

export function ImportModal({
  onImport,
  onClose,
  notify,
}: {
  onImport: (layers: Layer[]) => void;
  onClose: () => void;
  notify: (msg: string) => void;
}) {
  const [text, setText] = useState("");
  const [rejected, setRejected] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const runImport = (svgText: string, label: string) => {
    const trimmed = svgText.trim();
    if (!trimmed) {
      setRejected(["Paste SVG markup or drop a .svg file first."]);
      return;
    }
    if (trimmed.length > 500000) {
      setRejected(["File too large (500KB max)."]);
      return;
    }
    const res = parseSVGToLayers(trimmed);
    setRejected(res.rejected);
    if (res.layers.length > 0) {
      onImport(res.layers);
      notify(
        `Imported ${res.layers.length} layer${res.layers.length === 1 ? "" : "s"} from ${label}`,
      );
      if (res.rejected.length === 0) onClose();
    } else {
      notify("Import blocked — nothing usable found");
    }
  };

  const readFile = (f: File) => {
    if (!/\.svg$/i.test(f.name) && f.type !== "image/svg+xml") {
      setRejected([`"${f.name}" is not an .svg file.`]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => runImport(String(reader.result ?? ""), f.name);
    reader.onerror = () => setRejected([`Could not read "${f.name}".`]);
    reader.readAsText(f);
  };

  return (
    <Shell
      title="Import SVG"
      onClose={onClose}
      foot={
        <>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <FileUp size={13} /> Choose file
          </button>
          <button
            className="btn primary"
            onClick={() => runImport(text, "pasted markup")}
            disabled={!text.trim()}
          >
            Import layers
          </button>
        </>
      }
    >
      <div
        className={`drop-zone${over ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) readFile(f);
        }}
        onClick={() => fileRef.current?.click()}
        style={{ cursor: "pointer" }}
      >
        Drop a <b>.svg</b> file here, or click to browse.
        <br />
        Shapes, paths and text are converted to layers — scripts and refs are stripped.
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".svg,image/svg+xml"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) readFile(f);
          e.target.value = "";
        }}
      />
      <div className="field" style={{ marginTop: 12 }}>
        <label>…or paste SVG markup</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="<svg …>…</svg>"
          style={{ minHeight: 120, fontFamily: "var(--font-mono)", fontSize: 10 }}
        />
      </div>
      {rejected.length > 0 && (
        <div className="import-warn">
          {rejected.slice(0, 6).map((r, i) => (
            <div key={i}>• {r}</div>
          ))}
          {rejected.length > 6 && <div>• …and {rejected.length - 6} more</div>}
        </div>
      )}
    </Shell>
  );
}

/* ---------- templates ---------- */

export function TemplatesModal({
  onPick,
  onClose,
}: {
  onPick: (t: Template) => void;
  onClose: () => void;
}) {
  return (
    <Shell title="Start from a template" onClose={onClose}>
      <div className="template-grid">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            className="template-card"
            onClick={() => {
              onPick(t);
              onClose();
            }}
          >
            <span
              dangerouslySetInnerHTML={{ __html: t.preview }}
              style={{ padding: 0, display: "block" }}
            />
            <span>{t.name}</span>
            <small>{t.description}</small>
          </button>
        ))}
      </div>
      <p className="transform-note">
        Templates replace nothing — layers are appended to your canvas.
      </p>
    </Shell>
  );
}

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export { instantiateTemplate };
export type { Template };
