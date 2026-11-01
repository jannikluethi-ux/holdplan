import type { CargoPiece, EquipmentDef } from "./types.ts";

export interface DoorFitResult {
  ok: boolean;
  message?: string;
  used?: { widthMm: number; heightMm: number };
}

interface Face {
  w: number;
  h: number;
  through: number;
  label: string;
}

function candidateFaces(piece: CargoPiece): Face[] {
  const L = piece.lengthMm;
  const W = piece.widthMm;
  const H = piece.heightMm;
  if (piece.shape === "cylinder") {
    const d = Math.max(W, H);
    if (piece.thisSideUp || piece.notRotatable) {
      return [{ w: d, h: d, through: L, label: "circular face" }];
    }
    return [
      { w: d, h: d, through: L, label: "circular face" },
      { w: L, h: d, through: d, label: "longitudinal face" },
    ];
  }
  if (piece.notRotatable) {
    return [{ w: W, h: H, through: L, label: `${W} × ${H} mm` }];
  }
  if (piece.thisSideUp || piece.floorOnly) {
    return [
      { w: W, h: H, through: L, label: `${W} × ${H} mm` },
      { w: L, h: H, through: W, label: `${L} × ${H} mm` },
    ];
  }
  return [
    { w: W, h: H, through: L, label: `${W} × ${H} mm` },
    { w: L, h: H, through: W, label: `${L} × ${H} mm` },
    { w: L, h: W, through: H, label: `${L} × ${W} mm` },
  ];
}

export function fitsThroughDoor(piece: CargoPiece, def: EquipmentDef): DoorFitResult {
  if (def.sideAccess) return { ok: true };
  if (!def.door) return { ok: true };
  const door = def.door;
  const faces = candidateFaces(piece);
  for (const f of faces) {
    if (f.w <= door.widthMm + 0.5 && f.h <= door.heightMm + 0.5) {
      return { ok: true, used: { widthMm: f.w, heightMm: f.h } };
    }
  }
  const best = faces.reduce((a, b) => (a.w * a.h < b.w * b.h ? a : b));
  return {
    ok: false,
    used: { widthMm: best.w, heightMm: best.h },
    message: `${piece.description}: ${best.w.toFixed(0)} × ${best.h.toFixed(0)} mm cross-section does not fit ${door.widthMm} × ${door.heightMm} mm door.`,
  };
}
