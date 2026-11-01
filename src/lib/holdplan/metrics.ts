import { computeChargeable, type ChargeableBreakdown } from "./chargeable.ts";
import { requireEquipment } from "./equipment.ts";
import { aabbVolumeM3, pieceCgWorld, pieceVolumeM3, placementAabb } from "./geometry.ts";
import type { EquipmentDef, Job, Placement } from "./types.ts";
import { validateRoom } from "./validation.ts";

export interface FloorCell {
  i: number;
  j: number;
  kg: number;
  kgM2: number;
}

export interface RoomMetrics {
  placedCount: number;
  totalCount: number;
  weightKg: number;
  maxPayloadKg: number;
  volumeM3: number;
  usableVolumeM3: number;
  cgXMm: number;
  cgYMm: number;
  cgZMm: number;
  cgLongBand: { minMm: number; maxMm: number };
  cgLatBand: { minMm: number; maxMm: number };
  cgLongStatus: "ok" | "warn" | "fail";
  cgLatStatus: "ok" | "warn" | "fail";
  heaviestFloorKgM2: number;
  floorLimitKgM2: number;
  axleLoads: Array<{ id: string; name: string; kg: number; maxKg: number }>;
  failCount: number;
  warnCount: number;
  chargeable: ChargeableBreakdown;
}

export function usableVolumeM3(def: EquipmentDef): number {
  const box = (def.innerLengthMm * def.innerWidthMm * def.innerHeightMm) / 1e9;
  switch (def.contour.kind) {
    case "box":
      return box;
    case "open":
      return box;
    case "crown":
      return box * 0.82;
    case "ld3":
      return box * 0.72;
    case "ld7":
      return box * 0.78;
    case "aircraft":
      return box * 0.74;
  }
}

export function instanceCount(job: Job): number {
  return job.cargo.reduce((s, c) => s + Math.max(1, c.quantity), 0);
}

export function placedInRoom(job: Job, roomId: string): Placement[] {
  return job.placements.filter((p) => p.roomId === roomId);
}

export function computeMetrics(job: Job, roomId: string | null): RoomMetrics | null {
  if (!roomId) return null;
  const room = job.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const def = requireEquipment(room.equipmentId);
  const placements = placedInRoom(job, roomId);
  const totalCount = instanceCount(job);
  let weightKg = 0;
  let volumeM3 = 0;
  let mX = 0;
  let mY = 0;
  let mZ = 0;

  for (const p of placements) {
    const piece = job.cargo.find((c) => c.id === p.pieceId);
    if (!piece) continue;
    weightKg += piece.weightKg;
    volumeM3 += aabbVolumeM3(placementAabb(piece, p));
    const cg = pieceCgWorld(piece, p);
    mX += piece.weightKg * cg.x;
    mY += piece.weightKg * cg.y;
    mZ += piece.weightKg * cg.z;
  }

  const cgX = weightKg > 0 ? mX / weightKg : 0;
  const cgY = weightKg > 0 ? mY / weightKg : 0;
  const cgZ = weightKg > 0 ? mZ / weightKg : 0;

  const halfL = def.innerLengthMm / 2;
  const halfW = def.innerWidthMm / 2;
  const longLimit = halfL * 0.18;
  const latLimit = halfW * 0.2;
  const longWarn = halfL * 0.14;
  const latWarn = halfW * 0.15;

  const longAbs = Math.abs(cgX);
  const latAbs = Math.abs(cgZ);
  const cgLongStatus: RoomMetrics["cgLongStatus"] =
    longAbs > longLimit ? "fail" : longAbs > longWarn ? "warn" : "ok";
  const cgLatStatus: RoomMetrics["cgLatStatus"] =
    latAbs > latLimit ? "fail" : latAbs > latWarn ? "warn" : "ok";

  const floor = floorLoading(job, def, placements);
  const heaviest = floor.reduce((m, c) => Math.max(m, c.kgM2), 0);

  const issues = validateRoom(job, roomId);
  const failCount = issues.filter((i) => i.level === "fail").length;
  const warnCount = issues.filter((i) => i.level === "warn").length;

  const chargeable = computeChargeable(job, def, placements, weightKg, volumeM3);

  return {
    placedCount: placements.length,
    totalCount,
    weightKg,
    maxPayloadKg: def.maxPayloadKg,
    volumeM3,
    usableVolumeM3: usableVolumeM3(def),
    cgXMm: cgX,
    cgYMm: cgY,
    cgZMm: cgZ,
    cgLongBand: { minMm: -longLimit, maxMm: longLimit },
    cgLatBand: { minMm: -latLimit, maxMm: latLimit },
    cgLongStatus,
    cgLatStatus,
    heaviestFloorKgM2: heaviest,
    floorLimitKgM2: def.floorLimitKgM2,
    axleLoads: axleLoads(job, def, placements),
    failCount,
    warnCount,
    chargeable,
  };
}

export function floorLoading(job: Job, def: EquipmentDef, placements: Placement[]): FloorCell[] {
  const cell = 500;
  const ni = Math.max(1, Math.ceil(def.innerLengthMm / cell));
  const nj = Math.max(1, Math.ceil(def.innerWidthMm / cell));
  const cells: FloorCell[] = [];
  const area = (cell / 1000) * (cell / 1000);
  const originX = -def.innerLengthMm / 2;
  const originZ = -def.innerWidthMm / 2;

  const kg = Array.from({ length: ni * nj }, () => 0);
  for (const p of placements) {
    const piece = job.cargo.find((c) => c.id === p.pieceId);
    if (!piece) continue;
    const a = placementAabb(piece, p);
    const footprint = Math.max(1e-6, ((a.maxX - a.minX) * (a.maxZ - a.minZ)) / 1e6);
    const pressure = piece.weightKg / footprint;
    for (let i = 0; i < ni; i++) {
      const x0 = originX + i * cell;
      const x1 = x0 + cell;
      if (x1 < a.minX || x0 > a.maxX) continue;
      for (let j = 0; j < nj; j++) {
        const z0 = originZ + j * cell;
        const z1 = z0 + cell;
        if (z1 < a.minZ || z0 > a.maxZ) continue;
        const ox = Math.max(0, Math.min(x1, a.maxX) - Math.max(x0, a.minX));
        const oz = Math.max(0, Math.min(z1, a.maxZ) - Math.max(z0, a.minZ));
        const overlapM2 = (ox * oz) / 1e6;
        kg[i * nj + j] += pressure * overlapM2;
      }
    }
  }
  for (let i = 0; i < ni; i++) {
    for (let j = 0; j < nj; j++) {
      const v = kg[i * nj + j] ?? 0;
      cells.push({ i, j, kg: v, kgM2: v / area });
    }
  }
  return cells;
}

function axleLoads(
  job: Job,
  def: EquipmentDef,
  placements: Placement[],
): Array<{ id: string; name: string; kg: number; maxKg: number }> {
  if (!def.axles?.length) return [];
  const groups = def.axles;
  const loads = groups.map((g) => ({ id: g.id, name: g.name, kg: 0, maxKg: g.maxKg }));
  if (groups.length === 1) {
    const w = placements.reduce((s, p) => {
      const piece = job.cargo.find((c) => c.id === p.pieceId);
      return s + (piece?.weightKg ?? 0);
    }, 0);
    loads[0]!.kg = w;
    return loads;
  }
  for (const p of placements) {
    const piece = job.cargo.find((c) => c.id === p.pieceId);
    if (!piece) continue;
    const cg = pieceCgWorld(piece, p);
    const inv: number[] = groups.map((g) => {
      const d = Math.abs(cg.x - g.xMm);
      return 1 / Math.max(400, d);
    });
    const sum = inv.reduce((a, b) => a + b, 0);
    inv.forEach((w, i) => {
      loads[i]!.kg += piece.weightKg * (w / sum);
    });
  }
  return loads;
}

export { pieceVolumeM3 };
