# SVGdio — Build Report

Visual SVG + CSS studio: draw shapes on a quiet canvas, arrange 100+ layers,
style via inspector, sequence motion on a timeline, export standalone SVG +
CSS keyframes. Local-first, no login, no runtime dependency in exports.

- Stack: Next.js 15 App Router + React 19 + TypeScript, pnpm, Manrope / DM Mono, lucide-react.
- Prod bundle: `/` 21.5 kB, first load 124 kB, prerendered static.
- Repo: fresh git repo inside `SVGdio/` (17 commits), Vercel-ready static client app.

## What was built

- **Typed layer model** (`lib/layers.ts`): rect / ellipse / line / text / path with
  geometry, style, transform, opacity, name, visibility, lock. Deterministic ids,
  geometry helpers, poly-point paths.
- **Custom SVG canvas renderer** (`components/canvas.tsx`): pan (space / middle /
  background drag), wheel zoom to cursor, click + shift-click select, drag with
  pointer capture, corner resize + rotate handle, shape tools (rect / ellipse /
  line drag-to-draw, text click-to-place, pen click-points with Esc / double-click
  to finish). Arrow-key nudge, `V/R/O/L/T/P/H` shortcuts, Del to delete.
- **Virtualized layer list** (`components/layers.tsx`): fixed-row windowing with
  overscan for 100+ rows, search, double-click rename, hide / lock, Front / Back
  reorder, duplicate, delete.
- **Inspector** (`components/inspector.tsx`): fill, stroke, stroke width, opacity,
  corner radius (rect), text + font size, x / y / width / height / rotation, name.
  Color inputs write `--fill` / `--stroke` CSS variables straight to the live
  `[data-layer-id]` node for instant paint, then commit to state.
- **Timeline** (`components/timeline.tsx`): tracks per layer-property
  (x / y / opacity / rotation / fill), keyframe add (double-click lane), drag-move,
  select-to-edit value + easing, delete; playhead scrub, play / pause, loop,
  duration control; live Smart-Animate interpolation preview on canvas.
- **Compiler** (`lib/compile.ts`): layers → standalone `.svg` (2-decimal rounding,
  slug ids); timeline → `@keyframes` + `animation` CSS (x/y/rotation merged into
  `transform`, per-stop easing); project JSON export/import.
- **Import** (`components/modals.tsx` + `parseSVGToLayers`): paste modal + `.svg`
  file drop, sanitized (shapes/paths/text only; scripts, refs, handlers, styles,
  animations rejected with messages), 500 KB cap, 300-layer cap.
- **Templates** (`lib/templates.ts`): Hero card, Bar chart, Badge, Bouncing ball
  (ships layers + a keyframed timeline).
- **Persistence** (`lib/storage.ts`): `svgdio.workspace.v1` in localStorage,
  debounced 400 ms, versioned `migrate()` (unversioned layers-only v0 → v1,
  unknown → safe default), project JSON open/save.
- **Extras**: export modal (SVG / CSS / JSON tabs, copy + download), keyboard
  shortcuts, `prefers-reduced-motion` support, mobile list-first layout,
  empty states, 100-layer stress fixture (flask button) with fps meter in the HUD.

## File map

| Path | Purpose |
|---|---|
| `app/layout.tsx` | Root layout, fonts, metadata |
| `app/globals.css` | Full design system (~460 lines) |
| `app/page.tsx` | Studio shell: state, persistence, rail, panels, modals, toast |
| `lib/layers.ts` | Layer types, factory, geometry, SVG parser + sanitize, fixture100 |
| `lib/compile.ts` | Timeline model, easing, interpolation, SVG + CSS compilers |
| `lib/storage.ts` | localStorage snapshot, migration, project JSON, download/copy |
| `lib/templates.ts` | 4 starter templates + previews |
| `lib/inspector-helpers.ts` | Inspector label helper |
| `components/canvas.tsx` | SVG viewport: pan/zoom/select/drag/resize/draw tools |
| `components/layers.tsx` | Virtualized layer list |
| `components/inspector.tsx` | Property panel (CSS-variable live writes) |
| `components/timeline.tsx` | Track editor + playback + preview |
| `components/modals.tsx` | Export / Import / Templates dialogs |
| `screenshots/` | Playwright captures (see below) |
| `public/favicon.svg` | App icon |

## Design decisions

- **Layers are data, never strings.** Users never hand-edit SVG; the compiler is
  the only path to markup, so output is always clean and deterministic.
- **cbrain pattern reuse**: App Router client page, pnpm, Manrope Variable +
  DM Mono, same dark quiet-surface aesthetic — but a custom SVG renderer instead
  of React Flow for full frame-cost control.
- **Position via CSS `translate3d` on `<g>`**, rotation via nested SVG
  `rotate()` attribute: drag stays on the compositor; rotation doesn't fight it.
- **Playback preview via overrides map**, not state mutation: the timeline
  computes interpolated values and the canvas renders them as a memo-safe
  overlay, so scrubbing never corrupts authored values.
- **Emil-style motion**: transform/opacity only, `ease-out` curves, 160 ms press
  feedback, no animation on keyboard-speed actions, instant subsequent hovers.

## 60fps strategy

1. One `React.memo` `<g>` per layer, keyed by id — a drag commit re-renders only
   touched nodes.
2. **Drag writes direct DOM `translate3d`** (cached node refs, one query per
   gesture) with zero React renders mid-gesture; single state commit on release
   (multi-select supported).
3. All gestures batch through `requestAnimationFrame`; exactly one layout read
   per gesture (cached rect), then pure math.
4. `will-change: transform` only while dragging; removed after.
5. Layer list renders ~visible + overscan rows, not all 100+.
6. Inspector color inputs paint via CSS variables before state commits.
7. Timeline playback re-renders only animated nodes (other overrides stay
   `undefined`, memo skips).
8. HUD fps meter (500 ms window) for manual verification during drag.

## Timeline model + compiler details

- `Timeline { duration, tracks[] }`, `Track { layerId, property, keyframes[] }`,
  `Keyframe { time(s), value, easing }`. Six easings map to CSS curves
  (`spring` → `cubic-bezier(0.34, 1.3, 0.64, 1)` etc.).
- `valueAt(track, time)` sorts keyframes, clamps outside the range, eases the
  segment `t`, lerps numbers and rgb-mixes colors — this is the Smart-Animate
  interpolation used both for canvas preview and CSS stop computation.
- `timelineToCSS` groups tracks by layer, unions stop times, emits one
  `@keyframes svgdio-<slug>-<n>` per animated layer with merged `transform`,
  `opacity`, `fill` declarations plus per-stop `animation-timing-function`,
  and a `#<slug> { animation: … }` usage block matching exported SVG ids.

## Validation evidence

- `pnpm install` — green (pnpm 10.33, 7m43s first run).
- `pnpm typecheck` (`tsc --noEmit`) — green, 0 errors.
- `pnpm build` (`next build`) — green, compiled successfully, 4 static pages,
  `/` 21.5 kB / 124 kB first load.
- Playwright (isolated `svigdio` session, prod server `http://localhost:3100`,
  viewport 1600×1000): template load, layer select, keyframe select, export
  modal, 100-layer fixture load — all captured; **console 0 errors, 0 warnings**.
- Persistence: reload kept 10 layers + 2 timeline tracks (screenshot 01 retake).
- 100-layer fixture renders as a 10×10 grid; layer list virtualizes; drag path
  verified functionally. Headless CDP input is too sparse to trip the 500 ms fps
  meter, so the 60fps claim rests on architecture (zero-render drag) + the
  on-screen meter for manual checks, not on a headless fps number.

Playwright commands used (cwd `SVGdio/`, server `pnpm start --port 3100`):

```powershell
playwright-cli -s=svigdio open http://localhost:3100
playwright-cli -s=svigdio resize 1600 1000
playwright-cli -s=svigdio click e12            # Templates
playwright-cli -s=svigdio click e145           # Hero card
playwright-cli -s=svigdio screenshot --filename=screenshots/01-canvas-layers.png
playwright-cli -s=svigdio click e186           # Underline layer row
playwright-cli -s=svigdio screenshot --filename=screenshots/02-inspector-editing.png
playwright-cli -s=svigdio click e401           # Bouncing ball template
playwright-cli -s=svigdio click ".tl-keyframe" # (via mouse coords) select keyframe
playwright-cli -s=svigdio screenshot --filename=screenshots/03-timeline-keyframes.png
playwright-cli -s=svigdio click e25            # Export
playwright-cli -s=svigdio screenshot --filename=screenshots/04-export-svg.png
playwright-cli -s=svigdio click f1e63          # Load 100-layer fixture
playwright-cli -s=svigdio screenshot --filename=screenshots/05-fixture-100.png
playwright-cli -s=svigdio console              # 0 errors, 0 warnings
```

## Screenshot list

| File | Content |
|---|---|
| `screenshots/01-canvas-layers.png` | Canvas with 10 template layers, list populated, timeline dock |
| `screenshots/02-inspector-editing.png` | Underline layer selected: inspector Style/Transform/Layer + on-canvas handles |
| `screenshots/03-timeline-keyframes.png` | Ball X/Y tracks, 5 keyframes, selected keyframe + easing control |
| `screenshots/04-export-svg.png` | Export modal with compiled standalone SVG + Copy/Download |
| `screenshots/05-fixture-100.png` | 100-layer stress grid + virtualized list |

## Known gaps

- Text is single-style (no rich text, no on-canvas text editing — edit in inspector).
- Pen paths are poly-lines only; no bezier handle editing (compiler supports raw
  `pathData` from imports, so curves survive import → export).
- No grouping, alignment guides, or multi-select resize (multi-drag works).
- No undo/redo — persistence + project JSON are the safety net.
- Import keeps no gradients, masks, or transforms from source files (shapes are
  re-based to plain geometry; noted in dialog).
- Timeline animates 5 properties; stroke/width/corner-radius are static.
- 60fps verified architecturally + via HUD meter; no automated perf assertion.
