/* SVGdio starter templates: small curated layer sets. */

import { createLayer, type Layer } from "./layers";
import { emptyTimeline, type Timeline } from "./compile";

export interface Template {
  id: string;
  name: string;
  description: string;
  layers: () => Layer[];
  timeline?: () => Timeline;
  preview: string; // inline svg markup for the card
}

function heroLayers(): Layer[] {
  return [
    createLayer("rect", { name: "Backdrop", x: 90, y: 70, width: 620, height: 460, cornerRadius: 28, fill: "#17131e", stroke: "#2c2340", strokeWidth: 1.5 }),
    createLayer("ellipse", { name: "Glow", x: 440, y: 110, width: 220, height: 220, fill: "rgba(156,98,255,0.35)", stroke: "none" }),
    createLayer("ellipse", { name: "Orbit ring", x: 180, y: 170, width: 260, height: 260, fill: "none", stroke: "#b184ff", strokeWidth: 2, opacity: 0.7 }),
    createLayer("rect", { name: "Card", x: 250, y: 220, width: 300, height: 160, cornerRadius: 16, fill: "#221b2c", stroke: "#9c62ff", strokeWidth: 1.5 }),
    createLayer("text", { name: "Headline", x: 280, y: 258, width: 240, height: 40, text: "Ship it", fontSize: 40, fill: "#f6f3fa" }),
    createLayer("text", { name: "Subhead", x: 280, y: 312, width: 240, height: 30, text: "SVG + CSS, no runtime", fontSize: 16, fill: "#a79eaf" }),
    createLayer("line", { name: "Underline", x: 280, y: 352, width: 120, height: 1, stroke: "#9c62ff", strokeWidth: 4, points: [{ x: 0, y: 0 }, { x: 120, y: 0 }] }),
  ];
}

function chartLayers(): Layer[] {
  const bars = [150, 230, 180, 300, 260, 340, 210].map((h, i) =>
    createLayer("rect", {
      name: `Bar ${i + 1}`,
      x: 130 + i * 76,
      y: 460 - h,
      width: 48,
      height: h,
      cornerRadius: 8,
      fill: i % 2 === 0 ? "#9c62ff" : "#6d34e8",
      stroke: "none",
    }),
  );
  return [
    createLayer("rect", { name: "Panel", x: 80, y: 80, width: 640, height: 440, cornerRadius: 20, fill: "#14111a", stroke: "#2c2340", strokeWidth: 1.5 }),
    createLayer("text", { name: "Title", x: 120, y: 112, width: 300, height: 30, text: "Weekly throughput", fontSize: 22, fill: "#f6f3fa" }),
    createLayer("line", { name: "Baseline", x: 120, y: 460, width: 560, height: 1, stroke: "#3a3049", strokeWidth: 2, points: [{ x: 0, y: 0 }, { x: 560, y: 0 }] }),
    ...bars,
  ];
}

function badgeLayers(): Layer[] {
  return [
    createLayer("ellipse", { name: "Badge", x: 275, y: 150, width: 250, height: 250, fill: "#1d1826", stroke: "#9c62ff", strokeWidth: 3 }),
    createLayer("ellipse", { name: "Inner ring", x: 305, y: 180, width: 190, height: 190, fill: "none", stroke: "#b184ff", strokeWidth: 1.5, opacity: 0.6 }),
    createLayer("text", { name: "Mark", x: 355, y: 235, width: 90, height: 70, text: "◈", fontSize: 64, fill: "#b184ff" }),
    createLayer("text", { name: "Label", x: 330, y: 330, width: 140, height: 24, text: "SVGdio  v1.0", fontSize: 18, fill: "#a79eaf" }),
  ];
}

function motionLayers(): Layer[] {
  return [
    createLayer("rect", { name: "Stage", x: 90, y: 120, width: 620, height: 360, cornerRadius: 20, fill: "#14111a", stroke: "#2c2340", strokeWidth: 1.5 }),
    createLayer("ellipse", { name: "Ball", x: 150, y: 260, width: 80, height: 80, fill: "#9c62ff", stroke: "none" }),
    createLayer("rect", { name: "Floor", x: 150, y: 360, width: 500, height: 6, cornerRadius: 3, fill: "#3a3049", stroke: "none" }),
  ];
}

function motionTimeline(ballId: string): Timeline {
  const t = emptyTimeline();
  t.duration = 2;
  t.tracks = [
    { id: "trk-x", layerId: ballId, property: "x", keyframes: [{ id: "k1", time: 0, value: 150, easing: "ease-in-out" }, { id: "k2", time: 2, value: 570, easing: "ease-in-out" }] },
    { id: "trk-y", layerId: ballId, property: "y", keyframes: [{ id: "k3", time: 0, value: 260, easing: "ease-out" }, { id: "k4", time: 1, value: 180, easing: "ease-in-out" }, { id: "k5", time: 2, value: 260, easing: "ease-out" }] },
  ];
  return t;
}

const PREVIEWS: Record<string, string> = {
  hero: `<svg viewBox="0 0 200 86"><rect x="30" y="8" width="140" height="70" rx="10" fill="#17131e" stroke="#2c2340"/><circle cx="140" cy="30" r="16" fill="rgba(156,98,255,0.4)"/><rect x="62" y="30" width="76" height="34" rx="6" fill="#221b2c" stroke="#9c62ff"/><rect x="70" y="38" width="40" height="6" rx="3" fill="#f6f3fa"/><rect x="70" y="48" width="60" height="4" rx="2" fill="#a79eaf"/></svg>`,
  chart: `<svg viewBox="0 0 200 86"><rect x="30" y="8" width="140" height="70" rx="10" fill="#14111a" stroke="#2c2340"/><rect x="52" y="44" width="14" height="24" rx="3" fill="#9c62ff"/><rect x="72" y="34" width="14" height="34" rx="3" fill="#6d34e8"/><rect x="92" y="40" width="14" height="28" rx="3" fill="#9c62ff"/><rect x="112" y="28" width="14" height="40" rx="3" fill="#6d34e8"/><rect x="132" y="36" width="14" height="32" rx="3" fill="#9c62ff"/></svg>`,
  badge: `<svg viewBox="0 0 200 86"><circle cx="100" cy="43" r="30" fill="#1d1826" stroke="#9c62ff" stroke-width="2"/><circle cx="100" cy="43" r="22" fill="none" stroke="#b184ff" opacity="0.6"/><circle cx="100" cy="38" r="6" fill="#b184ff"/></svg>`,
  motion: `<svg viewBox="0 0 200 86"><rect x="30" y="14" width="140" height="58" rx="10" fill="#14111a" stroke="#2c2340"/><circle cx="70" cy="52" r="9" fill="#9c62ff"/><circle cx="100" cy="44" r="9" fill="rgba(156,98,255,0.45)"/><circle cx="130" cy="52" r="9" fill="rgba(156,98,255,0.2)"/><rect x="56" y="64" width="88" height="3" rx="1.5" fill="#3a3049"/></svg>`,
};

export const TEMPLATES: Template[] = [
  { id: "hero", name: "Hero card", description: "Backdrop, orbit, card + type", layers: heroLayers, preview: PREVIEWS.hero },
  { id: "chart", name: "Bar chart", description: "Panel with 7 bars", layers: chartLayers, preview: PREVIEWS.chart },
  { id: "badge", name: "Badge", description: "Mark + rings + label", layers: badgeLayers, preview: PREVIEWS.badge },
  {
    id: "motion",
    name: "Bouncing ball",
    description: "Layers + keyframed timeline",
    layers: motionLayers,
    timeline: () => motionTimeline("placeholder"),
    preview: PREVIEWS.motion,
  },
];

/** Build a template instance with fresh ids; rewires the motion timeline to the ball layer. */
export function instantiateTemplate(t: Template): { layers: Layer[]; timeline: Timeline | null } {
  const layers = t.layers();
  if (t.id === "motion") {
    const ball = layers.find((l) => l.name === "Ball");
    return { layers, timeline: ball ? motionTimeline(ball.id) : null };
  }
  return { layers, timeline: null };
}
