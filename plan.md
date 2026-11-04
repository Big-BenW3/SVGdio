# SVGdio — Plan

## Goal
Build SVGdio as a visual SVG and CSS studio. Users create shapes on canvas without hand-writing code, arrange 100+ layers at 60fps, style with a property panel, sequence motion on a Timeline, and export clean SVG plus CSS keyframes.

## Success Criteria
- A new user can draw, import, or start from a template with no SVG knowledge.
- Dragging and resizing across 100+ layers stays smooth at 60fps on a typical laptop.
- Property panel edits (fill, stroke, opacity, transform) update the canvas instantly via CSS variables.
- Timeline with tracks, keyframes, playhead, scrub, and easing compiles to working `@keyframes` plus `animation` CSS.
- Export produces a standalone `.svg` file and a `.css` file with no runtime dependency.
- Deploys to Vercel as a static client app.

## Constraints
- Vercel deployment, no login, local-first like cbrain.
- No AI required for shape-to-code. Every shape is typed data, and a small compiler maps it to SVG elements. Same input always gives same output.
- Performance budget: animate only transform and opacity, GPU-composited, no layout reads in move handlers.

## Approach
Reuse cbrain canvas lessons: React Flow style layering is replaced here with a lighter custom SVG renderer for full control over frame cost.

- Layer model is the source of truth: id, type, geometry, style, transform, opacity, name, visibility, lock.
- Canvas renders one SVG group per layer, memoized, keyed by id. Drag writes only to transform via `translate3d`, batched with `requestAnimationFrame`.
- Property panel writes CSS variables and layer fields. No direct string editing of SVG by the user.
- Timeline model is separate: tracks per layer-property, keyframes with time, value, easing. Compiler interpolates between keyframes and emits CSS.
- Creation paths: shape tools (rect, ellipse, line, text, pen path), SVG paste or file import parsed into layers, and starter templates.

## Steps
1. Scaffold `SVGdio/` as Next.js app: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `components/`, `lib/`.
2. Define `lib/layers.ts`: layer types, defaults, id helper, geometry helpers, import parser for SVG strings and files.
3. Build canvas renderer in `components/canvas.tsx`: SVG viewport, pan/zoom, selection, drag/resize with pointer events, `translate3d` positioning, `will-change` only while dragging.
4. Build layer list in `components/layers.tsx`: reorder, rename, hide, lock, group, search, virtualized for 100+ rows.
5. Build property panel in `components/inspector.tsx`: fill, stroke, stroke width, opacity, corner radius, position, size, rotation, with CSS variable live updates.
6. Build shape tools: rect, ellipse, line, text, pen path with click-to-add points and escape to finish. Import path: paste modal plus `.svg` drop, validated before adding layers.
7. Build timeline in `components/timeline.tsx`: tracks, keyframe add/move/delete, playhead scrub, play/pause, duration and easing controls, Smart Animate style auto-interpolation between states.
8. Build compiler in `lib/compile.ts`: layers to SVG string, timeline to `@keyframes` and `animation` CSS, copy and download actions.
9. Persist workspace to `localStorage` under `svgdio.workspace.v1` with versioned migration, plus export/import of project JSON.
10. Polish empty states, templates gallery, keyboard shortcuts, reduced-motion support, and mobile list-first layout.

## Validation Plan
- `pnpm typecheck` and `pnpm build` pass in `SVGdio/`.
- Manual: load fixture with 100 layers, drag selection and single layer, confirm no visible jank and no layout thrash in devtools.
- Manual: draw each tool, import an SVG file, change props, confirm canvas and exported SVG match.
- Manual: create two keyframes on one property, play timeline, confirm generated CSS animates the same in a blank HTML file.
- Manual: reload page, confirm layers and timeline persist.

## Risks / Open Questions
- Text and complex path editing can blow up scope. Mitigation: v1 supports basic text and poly-path only, full bezier editing is a later milestone.
- Import of arbitrary SVG with scripts or external refs. Mitigation: sanitize on import, allow shapes/paths/text only, reject the rest with a message.
- Open: default canvas size and export precision (assumed 800x600, 2-decimal rounding).
- Non-goals: collaboration, accounts, AI generation, full Illustrator parity.
