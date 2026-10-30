# Holdplan

**3D interactive load-planning software for project logistics and airfreight.**

Visually place cargo into real freight rooms across transport modes — ULDs, aircraft holds, ISO containers, trailers, flatracks, and trucks — with validation for weight, center of gravity, contours, doors, stacking, and regional chargeable weight rules.

## Features

- Import packing lists (CSV / TSV / Excel-style)
- Real inner-volume rooms with accurate contours (not generic boxes)
- Interactive 3D placement with drag, orbit, and inspection
- Suggest layout (with aisle and this-side-up constraints)
- Validation: weight limits, CG, contour breaches, door clearance, stack rules
- Regional chargeable weight (IATA, express, EU LDM, UK, US DIM, NMFC, ocean, AU)
- Metric / imperial unit system
- Export PDF and shareable plans
- Local persistence (IndexedDB) — no account required
- Tauri 2 wrapper for native macOS build

## Stack

- React 19 + TanStack Start + Tailwind v4 + shadcn/Radix
- Zustand (with undo/redo) + IndexedDB
- React Three Fiber + drei + Three.js
- Tauri 2 (macOS)

## Getting started

```bash
npm install
npm run dev
```

Then open the local URL. A demo job is seeded on first load.

For a native macOS build:

```bash
npm run tauri:dev
# or
npm run tauri:build
```

See `QA-MAC.md` for the Mac owner checklist.

## Project structure

- `src/lib/holdplan/` — domain logic (geometry, validation, packer, chargeable, CSV, persist)
- `src/components/holdplan/` — UI (3D viewport, workspace, inspectors, room picker)
- `src-tauri/` — Tauri 2 macOS wrapper

## Status

Early-stage working prototype. Domain tests pass. Visual polish and Mac wrapper are in place. Not a certified weight-and-balance system; for planning use only.

## License

MIT
