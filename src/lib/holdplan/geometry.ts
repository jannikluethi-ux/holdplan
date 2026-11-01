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

interface Section {
  widthMm: number;
  heightMm: number;
  zLeftMm: number;
  zRightMm: number;
}

function noseT(def: EquipmentDef, xMm: number): number {
  const c = def.contour;
  if (c.kind !== "aircraft") return 0;
  const noseStart = -def.innerLengthMm / 2;
  const noseEnd = noseStart + c.noseLengthMm;
  if (xMm >= noseEnd) return 0;
  if (xMm <= noseStart) return 1;
  return (noseEnd - xMm) / Math.max(1, c.noseLengthMm);
}

export function sectionAt(def: EquipmentDef, xMm: number, yMm: number): Section | null {
  const halfL = def.innerLengthMm / 2;
  const open = def.contour.kind === "open";
  if (!open && (xMm < -halfL - EPS || xMm > halfL + EPS)) return null;

  let width = def.innerWidthMm;
  let height = def.innerHeightMm;
  const c = def.contour;

  if (c.kind === "aircraft") {
    const t = noseT(def, xMm);
    width = lerp(def.innerWidthMm, c.noseEndWidthMm, t);
    height = lerp(def.innerHeightMm, c.noseEndHeightMm, t);
  }

  let zLeft = -width / 2;
  let zRight = width / 2;

  const applyCrown = (wallH: number, topW: number, both: boolean, sloped?: "port" | "starboard") => {
    if (yMm <= wallH) return;
    const t = clamp((yMm - wallH) / Math.max(1, height - wallH), 0, 1);
    const widthNow = lerp(width, topW, t);
    if (both) {
      zLeft = -widthNow / 2;
      zRight = widthNow / 2;
      return;
    }
    if (sloped === "starboard") {
      zLeft = -width / 2;
      zRight = zLeft + widthNow;
    } else {
      zRight = width / 2;
      zLeft = zRight - widthNow;
    }
  };

  switch (c.kind) {
    case "box":
      break;
    case "crown":
      applyCrown(c.wallHeightMm, c.topWidthMm, true);
      break;
    case "ld3":
      applyCrown(c.slopeStartHeightMm, c.topWidthMm, false, c.slopedSide);
      break;
    case "ld7":
      applyCrown(c.slopeStartHeightMm, c.topWidthMm, true);
      break;
    case "aircraft":
      applyCrown(c.sideWallHeightMm, lerp(c.topWidthMm, c.noseEndWidthMm, noseT(def, xMm)), true);
      break;
    case "open":
      break;
  }

  return { widthMm: width, heightMm: height, zLeftMm: zLeft, zRightMm: zRight };
}

export function usableHeightAt(def: EquipmentDef, xMm: number, zMm: number): number {
  const open = def.contour.kind === "open";
  const halfL = def.innerLengthMm / 2;
  if (!open && (xMm < -halfL - EPS || xMm > halfL + EPS)) return 0;

  let lo = 0;
  let hi = def.innerHeightMm + 50;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const sec = sectionAt(def, xMm, mid);
    if (!sec) {
      hi = mid;
      continue;
    }
    if (open) {
      hi = def.innerHeightMm;
      break;
    }
    if (zMm >= sec.zLeftMm - EPS && zMm <= sec.zRightMm + EPS && mid <= sec.heightMm + EPS) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  if (open) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor(lo));
}

export function isOpenEnvelope(def: EquipmentDef): boolean {
  return def.contour.kind === "open";
}

export interface PointClass {
  inside: boolean;
  overhang: boolean;
  aboveRoof: boolean;
  outsideLength: boolean;
  outsideWidth: boolean;
}

export function classifyPoint(def: EquipmentDef, xMm: number, yMm: number, zMm: number): PointClass {
  const halfL = def.innerLengthMm / 2;
  const halfW = def.innerWidthMm / 2;
  const open = isOpenEnvelope(def);

  const outsideLength = xMm < -halfL - EPS || xMm > halfL + EPS;
  const outsideFloor = zMm < -halfW - EPS || zMm > halfW + EPS || outsideLength;

  if (yMm < -EPS) {
    return {
      inside: false,
      overhang: false,
      aboveRoof: false,
      outsideLength,
      outsideWidth: zMm < -halfW - EPS || zMm > halfW + EPS,
    };
  }

  if (open) {
    return {
      inside: !outsideFloor,
      overhang: outsideFloor,
      aboveRoof: false,
      outsideLength,
      outsideWidth: zMm < -halfW - EPS || zMm > halfW + EPS,
    };
  }

  const sec = sectionAt(def, xMm, yMm);
  if (!sec) {
    return {
      inside: false,
      overhang: false,
      aboveRoof: yMm > def.innerHeightMm,
      outsideLength: true,
      outsideWidth: zMm < -halfW - EPS || zMm > halfW + EPS,
    };
  }
  const aboveRoof = yMm > sec.heightMm + EPS;
  const outsideWidth = zMm < sec.zLeftMm - EPS || zMm > sec.zRightMm + EPS;
  return {
    inside: !aboveRoof && !outsideWidth,
    overhang: false,
    aboveRoof,
    outsideLength,
    outsideWidth,
  };
}

export function sampleAabbPoints(a: Aabb): Array<{ x: number; y: number; z: number }> {
  const xs = [a.minX, (a.minX + a.maxX) / 2, a.maxX];
  const ys = [a.minY, (a.minY + a.maxY) / 2, a.maxY];
  const zs = [a.minZ, (a.minZ + a.maxZ) / 2, a.maxZ];
  const pts: Array<{ x: number; y: number; z: number }> = [];
  for (const x of xs) for (const y of ys) for (const z of zs) pts.push({ x, y, z });
  return pts;
}

export function footprintOverlapsFloor(def: EquipmentDef, a: Aabb): boolean {
  const halfL = def.innerLengthMm / 2;
  const halfW = def.innerWidthMm / 2;
  return a.minX < halfL && a.maxX > -halfL && a.minZ < halfW && a.maxZ > -halfW;
}

export function rotateOffset(
  ox: number,
  oy: number,
  oz: number,
  rotY: RotY,
): { x: number; y: number; z: number } {
  const r = (rotY * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: ox * c + oz * s, y: oy, z: -ox * s + oz * c };
}

export function pieceCgWorld(
  piece: CargoPiece,
  p: Placement,
): { x: number; y: number; z: number } {
  const e = extentsFor(piece, p.rotY);
  const off = rotateOffset(piece.cgOffsetMm.x, piece.cgOffsetMm.y, piece.cgOffsetMm.z, p.rotY);
  return {
    x: p.xMm + off.x,
    y: p.yMm + e.heightMm / 2 + off.y,
    z: p.zMm + off.z,
  };
}

export interface ContourRing {
  xMm: number;
  points: Array<{ yMm: number; zMm: number }>;
}

export function contourRings(def: EquipmentDef, xStepMm = 250): ContourRing[] {
  const halfL = def.innerLengthMm / 2;
  const rings: ContourRing[] = [];
  const start = -halfL;
  const end = halfL;
  const n = Math.max(2, Math.ceil((end - start) / xStepMm));
  for (let i = 0; i <= n; i++) {
    const x = start + ((end - start) * i) / n;
    const ys = uniqueHeights(def);
    const pts: Array<{ yMm: number; zMm: number }> = [];
    for (const y of ys) {
      const sec = sectionAt(def, x, y);
      if (!sec) continue;
      pts.push({ yMm: Math.min(y, sec.heightMm), zMm: sec.zLeftMm });
    }
    for (let k = ys.length - 1; k >= 0; k--) {
      const y = ys[k]!;
      const sec = sectionAt(def, x, y);
      if (!sec) continue;
      pts.push({ yMm: Math.min(y, sec.heightMm), zMm: sec.zRightMm });
    }
    rings.push({ xMm: x, points: pts });
  }
  return rings;
}

function uniqueHeights(def: EquipmentDef): number[] {
  const ys = new Set<number>([0, def.innerHeightMm]);
  const c = def.contour;
  if (c.kind === "crown") ys.add(c.wallHeightMm);
  if (c.kind === "ld3") ys.add(c.slopeStartHeightMm);
  if (c.kind === "ld7") ys.add(c.slopeStartHeightMm);
  if (c.kind === "aircraft") {
    ys.add(c.sideWallHeightMm);
    ys.add(c.noseEndHeightMm);
  }
  if (c.kind === "open") ys.add(c.endWallHeightMm);
  const extra = [0.25, 0.5, 0.75, 0.9].map((t) => t * def.innerHeightMm);
  extra.forEach((y) => ys.add(y));
  return [...ys].filter((y) => y >= 0).sort((a, b) => a - b);
}

export function floorRect(def: EquipmentDef): Aabb {
  const hl = def.innerLengthMm / 2;
  const hw = def.innerWidthMm / 2;
  return { minX: -hl, maxX: hl, minY: 0, maxY: 0, minZ: -hw, maxZ: hw };
}

export function doorFrame(def: EquipmentDef): {
  xMm: number;
  widthMm: number;
  heightMm: number;
} | null {
  if (!def.door) return null;
  const x = def.door.end === "fwd" ? -def.innerLengthMm / 2 : def.innerLengthMm / 2;
  return { xMm: x, widthMm: def.door.widthMm, heightMm: def.door.heightMm };
}

export function nextRotation(current: RotY, piece: CargoPiece): RotY {
  const allowed = allowedRotations(piece);
  const i = allowed.indexOf(current);
  return allowed[(i + 1) % allowed.length]!;
}

export function contourKindLabel(c: ContourSpec): string {
  switch (c.kind) {
    case "box":
      return "rectangular inner box";
    case "crown":
      return "net / crown contour";
    case "ld3":
      return "LD-3 fuselage contour";
    case "ld7":
      return "LD-7 fuselage contour";
    case "aircraft":
      return "fuselage + nose contour";
    case "open":
      return "open well";
  }
}
