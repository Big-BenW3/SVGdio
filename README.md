# SVGdio — SVG & CSS Canvas Studio

A minimal, local-first studio for layer-based SVG composition and CSS motion. Draw shapes on a quiet black-and-bright-yellow canvas, style every layer in the inspector, sequence animation on the timeline, and export standalone SVG + CSS files with no runtime dependency.

No account, no login, no server, no database. Everything stays in this browser unless you deliberately export it.

---

## The product

SVGdio is a visual design tool built around a single idea: **layers are data, never strings.** You never hand-edit SVG markup. You draw, arrange, and style layers through the UI, and a small deterministic compiler turns them into clean SVG + CSS.

### What you can do

- **Draw on an infinite canvas** — rectangle, ellipse, line, text, pen path, and select/pan tools (`V / R / O / L / T / P / H` shortcuts)
- **Arrange layers** — drag, resize, rotate, bring forward / send backward, duplicate, delete
- **Style every layer** — fill, stroke, stroke width, opacity, corner radius, position, size, rotation via the inspector
- **Animate on the timeline** — tracks per layer-property (x, y, opacity, rotation, fill), keyframes, playhead scrub, play/pause, loop, easing presets, Smart-Animate-style interpolation
- **Export standalone files** — download `.svg`, `.css` keyframes, or project `.json` to re-import later
- **Import SVG** — paste markup or drop a `.svg` file; scripts, refs, and animations are stripped for safety
- **Starter templates** — hero card, bar chart, badge, bouncing ball (ships with layers + timeline)

### Theme

SVGdio ships with a pitch-black / bright-yellow nocturnal palette by default, plus a full light mode. Toggle between them from the topbar (sun/moon icon). Panes (Layers + Inspector) are adjustable by dragging their resizer handles, so you can make the canvas as wide as you need.

---

## First-time experience

When you open SVGdio for the first time you'll see a short guided tour (5 steps): welcome, tools, styling, timeline, export. After completing it, a small "tip" note appears in the bottom-right corner of the studio with rotating hints (keyboard shortcuts, pan gestures, export, etc.). Both the tour and tips are dismissed via localStorage and won't reappear once dismissed.

---

## Architecture

```
SVGdio/
├── app/
│   ├── layout.tsx          # Root layout, fonts, metadata
│   ├── globals.css         # Design tokens: black/yellow, dark + light, resizable panes
│   └── page.tsx            # Hero landing (FluxLines bg) + studio workspace shell
├── components/
│   ├── brand-mark.tsx      # SVGdio wordmark logo
│   ├── canvas.tsx          # Custom SVG viewport: pan/zoom/select/drag/resize/draw tools
│   ├── flux-lines.tsx      # WebGL animated background (hero landing)
│   ├── flux-lines.css      # FluxLines container styles
│   ├── inspector.tsx       # Property panel (live CSS-variable paint)
│   ├── layers.tsx          # Virtualized layer list (100+ rows)
│   ├── modals.tsx          # Export / Import / Templates dialogs
│   ├── onboarding.tsx      # Guided first-time tour
│   ├── timeline.tsx        # Track editor + playback + Smart-Animate preview
│   └── tutorial-note.tsx   # Persistent tip overlay
├── lib/
│   ├── compile.ts          # Layers -> SVG string; timeline -> @keyframes + animation CSS
│   ├── layers.ts           # Layer model, factory, geometry, SVG import parser + sanitize
│   ├── storage.ts          # localStorage persistence, migration, project JSON, copy/download
│   ├── templates.ts        # Starter templates (hero, chart, badge, motion)
│   └── inspector-helpers.ts# Inspector label helpers
├── public/
│   ├── favicon.svg
│   └── logo.svg
├── package.json
├── tsconfig.json
├── next.config.ts
├── eslint.config.mjs
├── README.md
├── plan.md
├── report.md
├── audit.md
└── TODO.md
```

### Tech stack

- **Next.js 15** (App Router) — client-side studio + static hero landing
- **React 19** — UI and interactivity
- **TypeScript** — strict typing throughout
- **WebGL2** (`components/flux-lines.tsx`) — animated hero background with mouse interaction
- **Lucide React** — iconography
- **pnpm** — package manager

No React Flow, no heavy canvas libraries. SVGdio uses a lightweight custom SVG renderer so every frame stays on the compositor.

### Design system

The visual identity is **minimal nocturnal**: pitch-black (`#000000`) background with bright yellow (`#ffea00`) accents, muted grey text, restrained borders. A full light mode (`#ffffff` background) mirrors it exactly.

Tokens live in `:root` and `[data-theme="light"]` in `app/globals.css`: `--bg`, `--panel`, `--accent` (yellow), `--accent-bright`, `--line`, `--white`, `--muted`, `--dim`, `--font-sans` (Manrope), `--font-mono` (DM Mono).

### Data model (`lib/layers.ts`)

```ts
export interface Layer {
  id: string;
  type: "rect" | "ellipse" | "line" | "text" | "path";
  name: string;
  visible: boolean;
  locked: boolean;
  x: number; y: number;           // position on artboard
  width: number; height: number;  // geometry
  rotation: number;               // degrees
  opacity: number;                // 0..1
  fill: string; stroke: string;   // css color or "none"
  strokeWidth: number;
  cornerRadius: number;           // rect only
  text?: string; fontSize?: number;   // text only
  points?: { x: number; y: number }[]; // line / path poly points
  pathData?: string;              // imported raw path
}
```

Layers are the source of truth. The compiler in `lib/compile.ts` is the only path to markup output, so exports are always clean and deterministic.

### Persistence

Workspaces are versioned (`svgdio.workspace.v1`) and saved to `localStorage` every 400ms after edits. Migration handles payload upgrades. Project JSON export/import is available via the modals. Data never leaves your device unless you export it.

---

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start dev server on `http://localhost:3100` |
| `pnpm build` | Production build |
| `pnpm start` | Serve production build |
| `pnpm typecheck` | TypeScript check (`tsc --noEmit`) |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |
| `pnpm format:check` | Prettier check |

Open `http://localhost:3100` to land on the hero page; click **Open studio** (or go to `/app`) to enter the workspace.

### Keyboard shortcuts (studio)

| Shortcut | Action |
|----------|--------|
| `V` | Select tool |
| `R` | Rectangle tool |
| `O` | Ellipse tool |
| `L` | Line tool |
| `T` | Text tool |
| `P` | Pen tool (click points, Esc / double-click to finish) |
| `H` | Pan tool |
| `Space` + drag | Pan the canvas |
| `Del` / `Backspace` | Delete selected layer(s) |
| `Esc` | Clear selection / finish pen |
| `Arrow keys` | Nudge selected layer (Shift = 10px) |

---

## Data and privacy

SVGdio is local-first. Your layers, timeline, and artboard state are stored under `localStorage` for this site only. Nothing is synced between devices, nothing is sent to a server, and nothing leaves your browser unless you deliberately click **Export** and download a file.

Browser data clearing, private-browsing sessions, or switching browsers/profiles can remove your workspace. Use **Export project JSON** to keep a portable backup you can re-import.

---

## Constraints (by design)

- No authentication, accounts, or sign-up
- No server, database, or remote storage
- No collaboration or sharing
- No AI generation
- User data remains on-device unless deliberately exported

---

## Roadmap context

See `plan.md` for build scope and success criteria, `TODO.md` for outcome-level acceptance, `report.md` for the build report, and `audit.md` for the technical quality audit.
