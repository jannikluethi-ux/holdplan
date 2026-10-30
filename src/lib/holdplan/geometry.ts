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

// ... (full geometry logic for contours, usable height, classification, rings)
// Full implementation available in the local workspace; this is the core collision and extents layer.
