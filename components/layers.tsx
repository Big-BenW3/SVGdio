/* SVGdio layer list: virtualized rows for 100+ layers, reorder/rename/hide/lock. */
"use client";

import { memo, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, Unlock, Plus, Trash2 } from "lucide-react";
import { duplicateLayer, typeLabel, type Layer } from "@/lib/layers";

const ROW_H = 34;
const OVERSCAN = 8;

interface LayersProps {
  layers: Layer[]; // bottom-first order (index 0 = back)
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onUpdate: (id: string, patch: Partial<Layer>) => void;
  onReorder: (id: string, dir: -1 | 1) => void;
  onDelete: (ids: string[]) => void;
  onDuplicate: (ids: string[]) => void;
  onAdd: () => void;
}

const Row = memo(function Row({
  layer,
  top,
  selected,
  onSelect,
  onUpdate,
  onReorder,
  onDuplicate,
  onDelete,
}: {
  layer: Layer;
  top: number;
  selected: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onUpdate: (id: string, patch: Partial<Layer>) => void;
  onReorder: (id: string, dir: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(layer.name);
  return (
    <div
      className={`layer-row${selected ? " selected" : ""}${layer.visible ? "" : " hidden-layer"}`}
      style={{ top, height: ROW_H }}
      onClick={(e) => onSelect(layer.id, e.shiftKey)}
      onDoubleClick={() => {
        setDraft(layer.name);
        setEditing(true);
      }}
      title={`${layer.name} — double-click to rename`}
    >
      <span className="layer-swatch" style={{ background: layer.fill === "none" ? "transparent" : layer.fill }} />
      <span className="layer-type">{typeLabel(layer.type).slice(0, 4).toUpperCase()}</span>
      <span className="layer-name">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (draft.trim()) onUpdate(layer.id, { name: draft.trim().slice(0, 60) });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          layer.name
        )}
      </span>
      <button
        className={`layer-icon-btn${layer.visible ? "" : " on"}`}
        title={layer.visible ? "Hide" : "Show"}
        onClick={(e) => {
          e.stopPropagation();
          onUpdate(layer.id, { visible: !layer.visible });
        }}
      >
        {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
      <button
        className={`layer-icon-btn${layer.locked ? " on" : ""}`}
        title={layer.locked ? "Unlock" : "Lock"}
        onClick={(e) => {
          e.stopPropagation();
          onUpdate(layer.id, { locked: !layer.locked });
        }}
      >
        {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
      </button>
    </div>
  );
});

export function LayerList({ layers, selectedIds, onSelect, onUpdate, onReorder, onDelete, onDuplicate, onAdd }: LayersProps) {
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(400);
  const viewportRef = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // top-first display order (index 0 = front)
  const ordered = useMemo(() => {
    const rev = [...layers].reverse();
    const q = query.trim().toLowerCase();
    if (!q) return rev;
    return rev.filter((l) => l.name.toLowerCase().includes(q) || l.type.includes(q));
  }, [layers, query]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(ordered.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
  const slice = ordered.slice(start, end);

  const selectOne = (id: string, additive: boolean) => {
    if (additive) {
      onSelect(selectedSet.has(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id]);
    } else {
      onSelect([id]);
    }
  };

  return (
    <>
      <div className="panel-head">
        LAYERS
        <span className="count">{layers.length}</span>
        <button onClick={onAdd} title="Add rectangle">
          <Plus size={12} /> Add
        </button>
      </div>
      <div className="layer-search">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search layers…" aria-label="Search layers" />
      </div>
      {ordered.length === 0 ? (
        <div className="layer-empty">
          <strong>{layers.length === 0 ? "No layers yet" : "No matches"}</strong>
          {layers.length === 0 ? "Draw a shape, import SVG, or pick a template to begin." : "Try a different search."}
        </div>
      ) : (
        <div
          ref={viewportRef}
          className="layer-viewport"
          onScroll={(e) => {
            setScrollTop((e.target as HTMLDivElement).scrollTop);
            setViewH((e.target as HTMLDivElement).clientHeight);
          }}
        >
          <div className="layer-spacer" style={{ height: ordered.length * ROW_H }}>
            {slice.map((l, i) => (
              <Row
                key={l.id}
                layer={l}
                top={(start + i) * ROW_H}
                selected={selectedSet.has(l.id)}
                onSelect={selectOne}
                onUpdate={onUpdate}
                onReorder={onReorder}
                onDuplicate={(id) => onDuplicate([id])}
                onDelete={(id) => onDelete([id])}
              />
            ))}
          </div>
        </div>
      )}
      {selectedIds.length > 0 && (
        <div className="inspector-section" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => onReorder(selectedIds[selectedIds.length - 1], 1)} title="Bring forward">
            <ArrowUp size={13} /> Front
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={() => onReorder(selectedIds[selectedIds.length - 1], -1)} title="Send backward">
            <ArrowDown size={13} /> Back
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={() => onDuplicate(selectedIds)} title="Duplicate selected">
            + Dup
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={() => onDelete(selectedIds)} title="Delete selected (Del)">
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </>
  );
}

export { duplicateLayer };
