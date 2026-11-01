# Holdplan — project status

**Date:** 17 September 2026  
**Version:** 0.1.0 (planning aid — not certified W&B)  
**Bundle id:** `ch.holdplan.app`  
**Live product:** web planner in the in-browser preview  
**Owner next step:** run `QA-MAC.md` on a MacBook (~15 min)

---

## One-line verdict

The 3D planner is **usable today** as a local web app. Trucks, chargeable weight, imperial units, dark ops-desk UI, domain tests, and a Tauri 2 Mac scaffold are in. The unsigned `.app` must be compiled on a Mac. Do not treat this as certified weight-and-balance.

---

## What it is

Holdplan is a 3D load-planning tool for project logistics and airfreight.

From a packing list you pick a real inner-volume “room” (ISO box, ULD with crown, aircraft main deck, flatrack, EU/UK/US/AU truck), place cargo in an interactive hangar view, check weight / CG / contour / door / stack, run **Suggest**, and export a PDF plus a share link.

It is **not** a TMS, WMS, airline W&B computer, or lashing certificate.

---

## Status dashboard

| Area | Status | Notes |
|---|---|---|
| Web planner (jobs, cargo, 3D, validate, PDF, share) | **Shipped** | Live in the in-browser preview |
| Trucks + regional chargeable + imperial default | **Shipped** | Pass 01b |
| Dark ops-desk visual (Zurich project desk) | **Shipped** | Pass 02 |
| Tauri 2 Mac wrap (unsigned local `.app`) | **Scaffolded** | Must be built on a Mac |
| Domain tests (`npm test`) | **Pass** | 104 tests, 0 fail (app suite; platform `scripts/` tests run via `npm run test:platform`) |
| Typecheck | **Pass** | Last run 17 Sep 2026 |
| Production smoke vs live preview | **Pass** | `divergesFromBaseline: false` |
| Mac hardware QA (trackpad, `.app`, PDF open) | **Owner’s turn** | Checklist in `QA-MAC.md` |

**Current default:** display **in · lb**, snap 1″, walls X-ray, cargo colour by validation. Internal math is always mm / kg.

---

## Build history

### Pass 01 — MVP planner (complete)

Three-pane workspace:

- Jobs list + seeded demo **Turbine rotor – ZRH charter**
- Cargo rail (manual add + CSV import)
- Room picker (ISO, ULD, aircraft, flatrack)
- 3D place / drag / rotate, Suggest layout, undo / redo
- Metrics: payload, volume, CG, floor, chargeable
- Validation: envelope, crown, door, collision, payload, stack
- PDF export + local share view
- Persistence in IndexedDB (no login, no cloud)

### Pass 01b — Trucks, chargeable, imperial (complete)

- ~22 trucks with published inner measurements (see catalogue below)
- Curtainsiders skip door-fit (side access)
- Chargeable rules: IATA, express, EU 1:333, EU LDM, UK, US DIM, US NMFC, ocean W/M, AU
- Default display **in · lb**, toggle to **mm · kg**
- Demo also packs EU 13.6 CS and US 53′ van

### Pass 02 — Visual polish + macOS wrap (complete)

- Palette: canvas `#0E1116`, panels `#161B22`, accent aviation yellow `#E6B325`, hangar void `#0B0E13`
- IBM Plex; 48 px header; ~320 px cargo / ~300 px inspector; 44 px metrics
- Header: H mark, job name, room, status pill, Demo, icon tooltips
- 3D: hangar lights, contact shadows, 100 / 1000 mm grid, glass contour + yellow edges, emissive door, amber selection, red fail + corner reason, CG axis
- Camera Persp / Top / Side / Front; walls Solid / X-ray / Hidden
- Tauri 2: 1440×900 (min 1280×800), overlay titlebar, menus Holdplan / Edit / View / Window, monochrome H icon
- Scripts: `npm run tauri:dev` / `tauri:build` → `Holdplan.app` (+ dmg). Unsigned. Does not break the web preview.

Linux cannot emit `Holdplan.app` (no WebKit / GTK). Owner builds on Mac.

### Pass 03 — Test and fix (complete)

Automated tests next to domain code (`node --test` on `src/lib/holdplan/*.test.ts`):

| Suite | What it proves |
|---|---|
| Envelope / door / crown | Piece in, 1 mm out, PMC usable height, door fit |
| Collision | Any positive overlap fails; kissing face (0 mm) passes |
| Weight / CG | Payload over max, aircraft slot kg, CG centre vs heavy end |
| Packer | 12 crates on 40′, oversized leftover + reason, this-side-up, envelope, door, curtainsider, payload leftover |
| Import | qty / mm / kg, skip bad rows, Excel TSV, EU `;` CSV + UTF-8 BOM |
| Persist | JSON roundtrip keeps x / y / z, yaw, room id; unknown rooms dropped |
| Geometry | PMC crown, flatrack overhang, yaw 90°, door fit |
| Chargeable | IATA / LDM / NMFC / DIM vs actual |

Web checks run in the sandbox: demo job, PMC fail reason, flatrack keeps cargo list, 5-line import, Suggest then undo, 1280×800 still shows cargo + 3D + inspector.

---

## Bugs found and fixed

| # | Bug | Fix |
|---|---|---|
| 1 | Inspector infinite re-render (`<label>` wrapping Radix Select) | Field is a `<div>`; nested cargo-list control is `div role=button` |
| 2 | Three.js r186 dropped `PCFSoftShadowMap` | Canvas `shadows="percentage"` + `PCFShadowMap` |
| 3 | Camera damping left PMC camera on 777F | Disable damping, set pos+target, restore; span = max(W, H, L×0.55) so long rooms are closer |
| 4 | Demo opened with empty placements | Pre-pack via Suggest; refresh persisted demo once if no trucks / no placements |
| 5 | Imperial print showed `7' 12"` | Carry remainder 12″ to the next foot |
| 6 | Contour was opaque teal swallowing mint cargo | BackSide glass `#1c2430`, stronger yellow edge rings |
| 7 | Tauri pack used a stale `index-*.js` | `rm` dest then copy; write SPA `index.html` to current hashes |
| 8 | Playwright hydration mismatch on search Input | `suppressHydrationWarning` on Input |
| 9 | Collision used 1 mm gap so 1 mm overlap was not a fail | `aabbsOverlap(..., gap=0)`; packer still uses 2 mm clearance |
| 10 | Excel TSV / EU `;` CSV / BOM did not map columns | Delimiter sniff + BOM strip |
| 11 | Fail HUD hid a room fail when the selected piece was clean | Fallback to first fail if the selection has none |

All of the above are in the current tree. Last `npm test`: **104 pass, 0 fail** (app suite).

---

## What you can do in the preview

1. Click **Demo** → **Turbine rotor – ZRH charter** (rotor, cabinets, crates, cylinder).
2. Switch rooms: PMC, 777F, 40′ flatrack, EU 13.6 CS, US 53′ van (and the rest of the catalogue).
3. Drag cargo on the deck; **Suggest**; undo (header or ⌘Z).
4. Toggle **in · lb** / **mm · kg** and the chargeable rule in the header.
5. Import a packing list (comma, Excel tab, or EU semicolon).
6. Export PDF / placements CSV; copy share link.

Empty 3D pane copy: “Add cargo, then choose a room.”

---

## Equipment catalogue

Inner volumes used as rooms. Trucks are family `truck`, not trailer.

### ISO / flatrack / ULD / aircraft

| Id | Room |
|---|---|
| `iso-20` | 20′ dry van — door 2340 × 2278 |
| `iso-40` | 40′ dry van |
| `iso-40hc` | 40′ high cube |
| `fr-40` | 40′ flatrack, open well 12054 × 2426 |
| `uld-ake` | AKE / LD3 |
| `uld-pmc` | PMC + net — crown wall height 1550 mm |
| `uld-pag` | PAG |
| `uld-ld7` | LD7 |
| `ac-777f` | 777F main deck |
| `ac-7478f` | 747-8F main deck |

### Trucks — EU / UK / US / AU

| Id | Room |
|---|---|
| `eu-cs-136` | EU 13.6 m curtainsider (side access, no rear-door check) |
| `eu-mega-136` | EU mega curtainsider |
| `eu-box-136` | EU 13.6 m box |
| `eu-reefer-136` | EU 13.6 m reefer |
| `eu-flat-136` | EU 13.6 m flat |
| `eu-lowbed` | EU lowbed |
| `eu-7t5` | EU 7.5 t rigid |
| `eu-18t` | EU 18 t rigid |
| `eu-26t` | EU 26 t rigid |
| `eu-swap-c745` | EU C745 swap body |
| `uk-44t-136` | UK 44 t curtainsider |
| `uk-dd-lower` | UK double-deck lower |
| `uk-dd-upper` | UK double-deck upper |
| `us-53-van` | US 53′ dry van |
| `us-53-hc` | US 53′ high cube |
| `us-48-van` | US 48′ van |
| `us-28-pup` | US 28′ pup |
| `us-53-reefer` | US 53′ reefer |
| `us-48-flat` | US 48′ flat |
| `us-26-straight` | US 26′ straight truck |
| `au-45-semi` | AU 45′ semi |
| `au-bdouble-a` | AU B-double A |
| `au-bdouble-b` | AU B-double B |

Chargeable is **job-level** (not auto-switched when you add a room) so mixed rooms do not silently change the bill.

---

## Chargeable rules

`max(actual, volumetric)` unless noted.

| Id | Rule |
|---|---|
| IATA | 1:6000 (airfreight) |
| Express | 1:5000 |
| EU 1:333 | Road volumetric |
| EU LDM | Occupied length spans merged, × 1750 kg / m |
| UK | 1:330 |
| US DIM | 250 in³ / lb |
| US NMFC | Density pcf class |
| Ocean | W/M |
| AU | 1:333 |

Typical rule follows the first room’s region; the header can override.

---

## Mac wrap (owner only)

This Linux sandbox cannot produce `Holdplan.app`. On a MacBook:

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
npm install
npm test
npm run tauri:dev          # native window against the Vite app
npm run tauri:build        # src-tauri/target/release/bundle/macos/Holdplan.app
```

Then walk the 12 steps in **QA-MAC.md**:

1. Native dark window 1440×900  
2. Trackpad orbit / pinch; cargo drag freezes orbit  
3. Demo job loads with cargo  
4. PMC → 40′ flatrack (rotor footprint fail on PMC; flatrack allows it)  
5. Import 5-line CSV (comma / tab / `;`)  
6. Suggest → undo → hand place  
7. Metrics update live  
8. Invalid placement: red outline + reason  
9. PDF opens with job name  
10. Quit and reopen — last job still there  
11. Resize 1280×800 — cargo + 3D + inspector still usable  
12. Production `.app` (+ dmg)

**Trackpad:** implemented in code (`TrackpadOrbit` owns wheel; Mac two-finger = pan deltas, pinch = ctrl+wheel; cargo drag sets `OrbitControls.enabled = false`; two-finger touch uses `TOUCH.DOLLY_PAN`). It has **not** been proven on a physical MacBook. Do not claim hardware-proven until QA-MAC step 2 is run.

If the production `.app` shows a blank 3D canvas (WKWebView hydrating a static SPA shell), document it and consider Electron. `tauri:dev` is the path to trust first.

---

## Explicitly out of scope

Still not in the product, by design:

- Auth, accounts, billing, cloud backend, SSO
- TMS / WMS / certified W&B / lashing certificates
- New aircraft types, iPhone / iPad
- Apple Developer signing / notarization
- Packing-algorithm rewrite (Suggest is a planner, not a MIP solver)

---

## Stack

| Layer | Choice |
|---|---|
| UI | React 19, TanStack Start, Tailwind v4, shadcn / Radix |
| 3D | React Three Fiber, drei, Three.js r186 |
| State | Zustand + undo / redo |
| Persist | IndexedDB `holdplan` v1 (no login) |
| Units | Internal mm / kg; display imperial or metric |
| Desktop | Tauri 2, crate `holdplan_lib`, id `ch.holdplan.app` |
| Tests | `node --test` on `src/lib/holdplan/*.test.ts` |
| Pack for `.app` | `scripts/tauri-pack.mjs` copies static output + writes SPA `index.html` |

---

## Open risks

| Risk | Notes |
|---|---|
| Unsigned Mac app | Gatekeeper will complain; expected this pass |
| WKWebView 3D | Unverified on Mac; if blank, document and consider Electron |
| IndexedDB in the `.app` | Should survive quit / reopen; confirm in QA-MAC step 10 |
| Suggest is a planner, not an optimiser | Leftovers get a reason; not a MIP solver |
| Planning aid only | Banner on PDF and in the UI |
| Persist tests | JSON `normalizeJob` roundtrip — no IndexedDB in Node. Real IDB is QA-MAC step 10 |
| `cargo check` on Linux | Fails: no pkg-config / glib / webkit. Expected, not a Rust API error |

---

## Files the owner will care about

| Path | Role |
|---|---|
| `QA-MAC.md` | 15-minute Mac checklist |
| `Holdplan-status.md` | This briefing |
| `src/lib/holdplan/` | Geometry, validation, packer, chargeable, equipment, CSV, persist, PDF |
| `src/lib/holdplan/*.test.ts` | Domain tests (must stay green) |
| `src/components/holdplan/` | Workspace, 3D viewport, cargo, inspector, jobs home |
| `src/store/job-store.ts` | Zustand job store, undo / redo, persist debounce |
| `src/styles.css` | Ops-desk tokens; Tauri titlebar padding |
| `src-tauri/` | Native shell, icon, menus |
| `scripts/tauri-pack.mjs` | Packs the web build into `dist-tauri/` for the `.app` |

---

## Next action

1. **You (owner):** run `QA-MAC.md` on a MacBook.  
2. **Do not** start a new product pass until a builder prompt is attached.  
3. If WKWebView 3D is blank in the production `.app`, report that before any Electron work.
