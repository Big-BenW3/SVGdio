"use client";

import { useState, useEffect } from "react";
import { Sparkles, X } from "lucide-react";

const TIPS = [
  "Press V to select, R for rectangle, O for ellipse, L for line, T for text, P for pen, H for pan.",
  "Hold Space and drag to pan the canvas.",
  "Double-click a layer row to rename it.",
  "Drag a layer's resize handles to reshape; drag the rotate handle to turn it.",
  "Add a timeline track on any layer property, set two keyframes, then press Play.",
  "Export SVG + CSS from the topbar — standalone files, no runtime needed.",
];

export function TutorialNote() {
  const [tipIndex, setTipIndex] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("svgdio.tipsDismissed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (dismissed) return;
    const t = setTimeout(() => setTipIndex((i) => (i + 1) % TIPS.length), 7000);
    return () => clearTimeout(t);
  }, [tipIndex, dismissed]);

  if (dismissed) return null;

  return (
    <div className="tutorial-note" role="region" aria-label="Tip">
      <div className="tutorial-note-head">
        <span>
          <Sparkles size={12} /> Tip {tipIndex + 1}
        </span>
        <button className="icon-btn" onClick={() => setDismissed(true)} aria-label="Dismiss tip">
          <X size={12} />
        </button>
      </div>
      <div className="tutorial-note-body">{TIPS[tipIndex]}</div>
      <button
        className="tutorial-note-btn"
        onClick={() => setTipIndex((i) => (i + 1) % TIPS.length)}
      >
        Next tip
      </button>
      <button className="icon-btn" onClick={() => setDismissed(true)} aria-label="Dismiss tip">
        <X size={12} />
      </button>
    </div>
  );
}
