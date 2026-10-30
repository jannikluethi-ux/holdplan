import type {
  Aabb,
  CargoPiece,
  ContourSpec,
  EquipmentDef,
  PieceExtents,
  Placement,
  RotY,
} from "./types.ts";

export const EPS = 0.5;

export function snapTo(value: number, snapMm: number): number {
  if (snapMm <= 0) return value;
  return Math.round(value / snapMm) * snapMm;
}

export function extentsFor(piece: CargoPiece, rotY: RotY): PieceExtents {
  const swap = rotY === 90 || rotY === 270;
  if (piece.shape === "cylinder") {
    const diameter = Math.max(piece.widthMm, piece.heightMm);
    const along = piece.lengthMm;
    return swap
      ? { lengthMm: diameter, widthMm: along, heightMm: diameter }
      : { lengthMm: along, widthMm: diameter, heightMm: diameter };
  }
  return swap
    ? { lengthMm: piece.widthMm, widthMm: piece.lengthMm, heightMm: piece.heightMm }
    : { lengthMm: piece.lengthMm, widthMm: piece.widthMm, heightMm: piece.heightMm };
}

export function allowedRotations(piece: CargoPiece): RotY[] {
  if (piece.notRotatable) return [0];
  return [0, 90, 180, 270];
}

export function placementAabb(piece: CargoPiece, p: Placement): Aabb {
  const e = extentsFor(piece, p.rotY);
  const hx = e.lengthMm / 2;
  const hz = e.widthMm / 2;
  return {
    minX: p.xMm - hx,
    maxX: p.xMm + hx,
    minY: p.yMm,
    maxY: p.yMm + e.heightMm,
    minZ: p.zMm - hz,
    maxZ: p.zMm + hz,
  };
}

export function aabbsOverlap(a: Aabb, b: Aabb, gap = 0): boolean {
  return (
    a.minX < b.maxX - gap &&
    a.maxX > b.minX + gap &&
    a.minY < b.maxY - gap &&
    a.maxY > b.minY + gap &&
    a.minZ < b.maxZ - gap &&
    a.maxZ > b.minZ + gap
  );
}

export function aabbVolumeM3(a: Aabb): number {
  const dx = Math.max(0, a.maxX - a.minX);
  const dy = Math.max(0, a.maxY - a.minY);
  const dz = Math.max(0, a.maxZ - a.minZ);
  return (dx * dy * dz) / 1e9;
}

export function pieceVolumeM3(piece: CargoPiece): number {
  if (piece.shape === "cylinder") {
    const d = Math.max(piece.widthMm, piece.heightMm);
    const r = d / 2;
    return (Math.PI * r * r * piece.lengthMm) / 1e9;
  }
  return (piece.lengthMm * piece.widthMm * piece.heightMm) / 1e9;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Full contour, section, usableHeight, classifyPoint, contourRings implementation follows in workspace.
// See local src/lib/holdplan/geometry.ts for complete source (374 lines).
