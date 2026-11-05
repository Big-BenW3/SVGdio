"use client";

import { useState } from "react";
import { ArrowRight, ArrowLeft, X, Sparkles, Play } from "lucide-react";

const STEPS = [
  {
    title: "Welcome to SVGdio.",
    desc: "A minimal SVG + CSS studio. Draw shapes, arrange layers, animate with the timeline, and export clean standalone files. No accounts, no server — everything stays in this browser.",
  },
  {
    title: "Pick a tool.",
    desc: "Use the left rail to choose Select, Rectangle, Ellipse, Line, Text, Pen, or Pan. Click the canvas to add text or drag to draw shapes.",
  },
  {
    title: "Style any layer.",
    desc: "Click a layer to open the inspector on the right. Adjust fill, stroke, opacity, size, rotation, and corner radius live on the canvas.",
  },
  {
    title: "Animate with the timeline.",
    desc: "The dock at the bottom holds tracks and keyframes. Add a track for any layer property, set two keyframes, and hit play. Export the resulting CSS.",
  },
  {
    title: "Export your work.",
    desc: "Hit Export in the topbar to download standalone SVG, CSS keyframes, or a project JSON you can re-import later.",
  },
];

export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];

  const next = () => setIndex((i) => Math.min(i + 1, STEPS.length - 1));
  const prev = () => setIndex((i) => Math.max(i - 1, 0));
  const finish = () => {
    try {
      localStorage.setItem("svgdio.onboarded", "1");
    } catch {}
    onFinish();
  };

  return (
    <div className="onboarding" aria-modal="true" role="dialog" aria-label="Guided tour">
      <div className="onboarding-backdrop" />
      <div className="onboarding-content">
        <div className="onboarding-head">
          <span className="onboarding-title">Guided tour · {index + 1} of {STEPS.length}</span>
          <div className="onboarding-steps">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`onboarding-step${i === index ? " active" : i < index ? " done" : ""}`}
              >
                {i + 1}
              </span>
            ))}
            <button className="icon-btn" onClick={finish} aria-label="Skip tour">
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="onboarding-body">
          <div className="onboarding-copy">
            <span className="onboarding-step-num">Step {index + 1}</span>
            <h2 className="onboarding-step-title">{step.title}</h2>
            <p className="onboarding-step-desc">{step.desc}</p>
            <div className="onboarding-actions">
              {index < STEPS.length - 1 ? (
                <button className="onboarding-btn" onClick={next}>
                  Next <ArrowRight size={14} />
                </button>
              ) : (
                <button className="onboarding-btn" onClick={finish}>
                  Start studio <Play size={14} />
                </button>
              )}
              {index > 0 && (
                <button className="onboarding-btn secondary" onClick={prev}>
                  <ArrowLeft size={14} /> Back
                </button>
              )}
            </div>
          </div>
          <div className="onboarding-preview">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "#666", fontSize: 11 }}>
              <Sparkles size={18} />
              <div>Canvas · layers · timeline · export</div>
            </div>
          </div>
        </div>
        <div className="onboarding-foot">
          <span>
            SVGdio &middot; Local-first SVG studio
          </span>
          <button className="icon-btn" onClick={finish} aria-label="Skip tour">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
