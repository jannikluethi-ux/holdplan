import { fitsThroughDoor } from "./door.ts";
import { requireEquipment } from "./equipment.ts";
import {
  aabbsOverlap,
  allowedRotations,
  extentsFor,
  isOpenEnvelope,
  placementAabb,
  snapTo,
  usableHeightAt,
} from "./geometry.ts";
import { newId } from "./ids.ts";
import type { CargoPiece, EquipmentDef, Job, PackFailure, Placement, RotY } from "./types.ts";
import { diagnoseUnplaceable, validatePlacement } from "./validation.ts";

interface Candidate {
  piece: CargoPiece;
  instanceIndex: number;
}

function instancesOf(job: Job): Candidate[] {
  const out: Candidate[] = [];
  for (const piece of job.cargo) {
    const n = Math.max(1, piece.quantity);
    for (let i = 0; i < n; i++) out.push({ piece, instanceIndex: i });
  }
  return out;
}

function sortCandidates(c: Candidate[]): Candidate[] {
  return [...c].sort((a, b) => {
    const af = a.piece.floorOnly === b.piece.floorOnly ? 0 : a.piece.floorOnly ? -1 : 1;
    if (af) return af;
    const dw = b.piece.weightKg - a.piece.weightKg;
    if (Math.abs(dw) > 0.1) return dw;
    const va = a.piece.lengthMm * a.piece.widthMm * a.piece.heightMm;
    const vb = b.piece.lengthMm * b.piece.widthMm * b.piece.heightMm;
    return vb - va;
  });
}

function payloadOf(placements: Placement[], job: Job): number {
  let w = 0;
  for (const p of placements) {
    const piece = job.cargo.find((c) => c.id === p.pieceId);
    if (piece) w += piece.weightKg;
  }
  return w;
}

function collides(job: Job, piece: CargoPiece, trial: Placement, existing: Placement[]): boolean {
  const a = placementAabb(piece, trial);
  for (const q of existing) {
    const other = job.cargo.find((c) => c.id === q.pieceId);
    if (!other) continue;
    if (aabbsOverlap(a, placementAabb(other, q), 2)) return true;
  }
  return false;
}

function inEnvelope(piece: CargoPiece, trial: Placement, def: EquipmentDef): boolean {
  const a = placementAabb(piece, trial);
  if (isOpenEnvelope(def)) {
    const halfL = def.innerLengthMm / 2;
    const halfW = def.innerWidthMm / 2;
    const overlap =
      a.minX < halfL && a.maxX > -halfL && a.minZ < halfW && a.maxZ > -halfW;
    return overlap && a.minY >= -0.5;
  }
  const corners = [
    [a.minX, a.minY, a.minZ],
    [a.maxX, a.minY, a.minZ],
    [a.minX, a.maxY, a.minZ],
    [a.maxX, a.maxY, a.minZ],
    [a.minX, a.minY, a.maxZ],
    [a.maxX, a.minY, a.maxZ],
    [a.minX, a.maxY, a.maxZ],
    [a.maxX, a.maxY, a.maxZ],
  ];
  for (const [x, y, z] of corners) {
    const uh = usableHeightAt(def, x!, z!);
    if (y! > uh + 0.5) return false;
    if (uh <= 0) return false;
  }
  return true;
}

function aisleBlocked(
  def: EquipmentDef,
  piece: CargoPiece,
  trial: Placement,
  keepAisle: boolean,
): boolean {
  if (!keepAisle) return false;
  const a = placementAabb(piece, trial);
  const doorX = -def.innerLengthMm / 2;
  const aisleEnd = doorX + Math.min(1800, def.innerLengthMm * 0.35);
  const halfAisle = 450;
  const overlapsX = a.maxX > doorX && a.minX < aisleEnd;
  const overlapsZ = a.maxZ > -halfAisle && a.minZ < halfAisle;
  return overlapsX && overlapsZ;
}

function stackY(
  job: Job,
  piece: CargoPiece,
  trialXZ: { xMm: number; zMm: number; rotY: RotY },
  existing: Placement[],
): number[] {
  const ys = [0];
  if (piece.floorOnly) return ys;
  const ext = extentsFor(piece, trialXZ.rotY);
  for (const q of existing) {
    const other = job.cargo.find((c) => c.id === q.pieceId);
    if (!other?.stackable) continue;
    const b = placementAabb(other, q);
    const trialAabb = {
      minX: trialXZ.xMm - ext.lengthMm / 2,
      maxX: trialXZ.xMm + ext.lengthMm / 2,
      minZ: trialXZ.zMm - ext.widthMm / 2,
      maxZ: trialXZ.zMm + ext.widthMm / 2,
      minY: b.maxY,
      maxY: b.maxY + ext.heightMm,
    };
    const overlapX = trialAabb.minX < b.maxX && trialAabb.maxX > b.minX;
    const overlapZ = trialAabb.minZ < b.maxZ && trialAabb.maxZ > b.minZ;
    if (overlapX && overlapZ) {
      if (other.maxStackWeightKg != null && piece.weightKg > other.maxStackWeightKg) continue;
      ys.push(b.maxY);
    }
  }
  return [...new Set(ys)].sort((a, b) => a - b);
}

export function suggestLayout(
  job: Job,
  roomId: string,
  snapMm: number,
  keepAisle: boolean,
): { placements: Placement[]; failures: PackFailure[] } {
  const room = job.rooms.find((r) => r.id === roomId);
  if (!room) return { placements: [], failures: [] };
  const def = requireEquipment(room.equipmentId);
  const grid = Math.max(50, snapMm);
  const halfL = def.innerLengthMm / 2;
  const halfW = def.innerWidthMm / 2;
  const existingOtherRooms = job.placements.filter((p) => p.roomId !== roomId);
  const placed: Placement[] = [];
  const failures: PackFailure[] = [];
  const ordered = sortCandidates(instancesOf(job));

  let sign = 1;
  for (const cand of ordered) {
    const { piece, instanceIndex } = cand;
    if (!fitsThroughDoor(piece, def).ok) {
      failures.push({
        pieceId: piece.id,
        instanceIndex,
        description: piece.description,
        reason: diagnoseUnplaceable(piece, def),
      });
      continue;
    }
    if (payloadOf(placed, job) + piece.weightKg > def.maxPayloadKg + 0.5) {
      failures.push({
        pieceId: piece.id,
        instanceIndex,
        description: piece.description,
        reason: `Placing ${piece.weightKg} kg would exceed ${def.maxPayloadKg} kg payload of ${def.shortName}.`,
      });
      continue;
    }

    const rots = allowedRotations(piece);
    let found: Placement | null = null;
    const xMax = halfL - 10;
    const xMin = -halfL + 10;

    for (const rotY of rots) {
      const ext = extentsFor(piece, rotY);
      const marginX = ext.lengthMm / 2 + 10;
      if (ext.lengthMm > def.innerLengthMm + (isOpenEnvelope(def) ? 4000 : 0)) continue;
      if (ext.widthMm > def.innerWidthMm + (isOpenEnvelope(def) ? 1500 : 0) && !isOpenEnvelope(def)) continue;

      const xs: number[] = [];
      for (let x = 0; x <= xMax; x += grid) {
        xs.push(snapTo(x * sign, grid));
        if (x !== 0) xs.push(snapTo(-x * sign, grid));
      }

      const zs: number[] = [0];
      for (let z = grid; z <= halfW; z += grid) {
        zs.push(z, -z);
      }

      for (const x of xs) {
        if (x < xMin + marginX - ext.lengthMm / 2 && !isOpenEnvelope(def)) continue;
        if (Math.abs(x) + ext.lengthMm / 2 > halfL + (isOpenEnvelope(def) ? 800 : 2)) continue;
        for (const z of zs) {
          if (Math.abs(z) + ext.widthMm / 2 > halfW + (isOpenEnvelope(def) ? 600 : 2)) continue;
          const xMm = snapTo(x, snapMm);
          const zMm = snapTo(z, snapMm);
          const ys = stackY(job, piece, { xMm, zMm, rotY }, placed);
          for (const yMm of ys) {
            const trial: Placement = {
              id: newId("pl"),
              pieceId: piece.id,
              instanceIndex,
              roomId,
              xMm,
              yMm,
              zMm,
              rotY,
            };
            if (aisleBlocked(def, piece, trial, keepAisle)) continue;
            if (collides(job, piece, trial, placed)) continue;
            if (!inEnvelope(piece, trial, def)) continue;
            const issues = validatePlacement(
              { ...job, placements: [...existingOtherRooms, ...placed, trial] },
              trial,
              def,
            );
            if (issues.some((i) => i.level === "fail")) continue;
            found = trial;
            break;
          }
          if (found) break;
        }
        if (found) break;
      }
      if (found) break;
    }

    if (found) {
      placed.push(found);
      sign *= -1;
    } else {
      failures.push({
        pieceId: piece.id,
        instanceIndex,
        description: piece.description,
        reason: diagnoseUnplaceable(piece, def),
      });
    }
  }

  return { placements: [...existingOtherRooms, ...placed], failures };
}
