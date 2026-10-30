# Holdplan — Mac QA (15 minutes)

Unsigned local build. Planning aid only — not certified W&B.

## Once per machine

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
npm install
```

## Commands

```bash
npm test                 # domain rules (must exit 0)
npm run tauri:dev        # native window against the Vite app
npm run tauri:build      # src-tauri/target/release/bundle/macos/Holdplan.app
```

Web-only (no Rust): `npm run dev` is the same planner in Chrome.

## Checklist

1. **Native window**  
   `npm run tauri:dev` opens a dark Holdplan window (1440×900, overlay traffic lights). Chrome stays dark; 3D canvas is not white.

2. **Trackpad**  
   Two-finger drag orbits. Pinch zooms. Click a piece and drag it on the floor — the box follows the pointer, orbit is frozen while dragging.  
   *Code path: `TrackpadOrbit` owns `wheel` (Mac two-finger = pan deltas, pinch = ctrl+wheel). Cargo drag sets `OrbitControls.enabled = false`. Two-finger touch uses `TOUCH.DOLLY_PAN`.*

3. **Demo job**  
   Click **Demo** (jobs list or workspace header) → **Turbine rotor – ZRH charter**. Cargo list has rotor, cabinets, crates, cylinder.

4. **PMC → flatrack**  
   Select **PMC + net**, then **40' flatrack**. Cargo list stays.  
   - Rotor is longer than the PMC deck → footprint fail (red outline + reason).  
   - A 2100 mm-high piece that fits the pallet still fails the net crown; the reason must say **usable height**.  
   - On the flatrack the rotor is allowed; overhang warns only if the footprint leaves the well.

5. **Import 5-line CSV**  
   Cargo → Import. Units default to **mm / kg**. Paste (comma, tab from Excel, or `;` EU CSV):

   ```csv
   description,qty,length,width,height,weight,stackable
   Crate A,2,800,600,600,90,yes
   Crate B,1,1200,800,1000,250,yes
   Cabinet,1,1000,800,1600,380,yes
   Pipe,1,2000,400,400,120,no
   Pallet,1,1200,1000,150,80,yes
   ```

   Five lines become five pieces (qty respected). A row with blank length or weight is skipped, not a crash.

6. **Suggest → undo → hand place**  
   Pick a room, **Suggest**. Undo (header or ⌘Z). Drag two pieces by hand; they snap to the current 1″ / 2″ / 4″ (or mm) step.

7. **Metrics live**  
   Placed count and payload in the bottom bar update as soon as a piece is placed or removed. Chargeable line matches the header rule (IATA / EU LDM / US DIM…).

8. **Invalid placement**  
   Drag a crate through a wall or onto another crate. Red outline in the viewport plus a readable reason in the corner (envelope, collision, door, payload). Metrics show fail count.

9. **PDF**  
   Export PDF. File opens, shows job name **Turbine rotor – ZRH charter** (or the current reference) and at least one 3D/top view.

10. **Quit and reopen**  
    Quit Holdplan, `npm run tauri:dev` again. Last job and piece positions are still there (IndexedDB in the webview).

11. **Resize 1280×800**  
    Window → zoom down to 1280×800. Cargo rail, 3D, inspector still usable. Canvas does not go black.

12. **Production .app**  
    `npm run tauri:build` → `src-tauri/target/release/bundle/macos/Holdplan.app` (and `.dmg` if the bundle step succeeds). Unsigned is enough.

## Out of this pass

Notarization, Apple Developer signing, iPhone, new aircraft types.
