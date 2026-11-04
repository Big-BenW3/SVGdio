# SVGdio — SVG & CSS Canvas Studio

Visual studio for layer-based SVG composition + CSS motion.

## Concept

- Canvas where users add, arrange, and style 100+ SVG layers.
- Property panel edits fill, stroke, opacity, transforms via CSS variables.
- Export clean SVG + CSS.

## Performance requirement

- Dragging 100+ layers must hold 60fps.
- Use hardware-accelerated transforms (`translate3d`, `will-change`), CSS variables for live updates, no layout thrash, layer virtualization / memoization.

## Timeline feature

- After-Effects-style track editor for CSS keyframe sequencing.
- Tracks per layer, keyframes for transform/opacity/fill, playhead + scrub, easing presets.
- Generates `@keyframes` + `animation` CSS from visual timeline. Figma Smart Animate-style auto-interpolation between states.

## Planned build

- `app/` canvas page + timeline dock.
- `components/` layer list, canvas renderer, property panel, timeline tracks.
- `lib/` layer model, transform engine, keyframe-to-CSS compiler, exporter.
