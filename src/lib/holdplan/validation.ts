import { fitsThroughDoor } from "./door.ts";
import { requireEquipment } from "./equipment.ts";
import {
  aabbsOverlap,
  classifyPoint,
  extentsFor,
  footprintOverlapsFloor,
  isOpenEnvelope,
  placementAabb,
  sampleAabbPoints,
  usableHeightAt,
} from "./geometry.ts";
import type {
  CargoPiece,
  EquipmentDef,
  Job,
  Placement,
  ValidationIssue,
} from "./types.ts";

const TIGHT_MM = 30;

function pieceById(job: Job, id: string): CargoPiece | undefined {
  return job.cargo.find((c) => c.id === id);
}

export function validatePlacement(
  job: Job,
  placement: Placement,
  def: EquipmentDef,
): ValidationIssue[] {
  const piece = pieceById(job, placement.pieceId);
  if (!piece) {
    return [
      {
        level: "fail",
        code: "missing-piece",
        message: "Placement refers to a cargo piece that is no longer on the list.",
        placementId: placement.id,
      },
    ];
  }
  const issues: ValidationIssue[] = [];
  const tag = {
    placementId: placement.id,
    pieceId: piece.id,
    roomId: placement.roomId,
  };
  const aabb = placementAabb(piece, placement);
  const name = def.shortName;
  const ext = extentsFor(piece, placement.rotY);

  if (piece.floorOnly && placement.yMm > 1) {
    issues.push({
      level: "fail",
      code: "floor-only",
      message: `${piece.description} is floor-only and cannot sit ${placement.yMm.toFixed(0)} mm off the deck.`,
      ...tag,
    });
  }

  const door = fitsThroughDoor(piece, def);
  if (!door.ok && door.message) {
    issues.push({ level: "fail", code: "door", message: door.message, ...tag });
  }

  if (isOpenEnvelope(def)) {
    if (!footprintOverlapsFloor(def, aabb)) {
      issues.push({
        level: "fail",
        code: "off-well",
        message: `${piece.description} does not overlap the ${name} well — footprint is fully off the floor.`,
        ...tag,
      });
    } else {
      const pts = sampleAabbPoints(aabb);
      const overhang = pts.some((pt) => classifyPoint(def, pt.x, 0, pt.z).overhang);
      if (overhang) {
        issues.push({
          level: "warn",
          code: "overhang",
          message: `${piece.description} overhangs the ${name} well. Flag as OOG and check lashing.`,
          ...tag,
        });
      }
    }
  } else {
    const pts = sampleAabbPoints(aabb);
    let outside = false;
    let tight = false;
    let crownHit = false;
    let minUsable = Number.POSITIVE_INFINITY;

    for (const pt of pts) {
      const c = classifyPoint(def, pt.x, pt.y, pt.z);
      if (!c.inside) {
        outside = true;
        if (c.aboveRoof || c.outsideWidth) crownHit = true;
      }
      const uh = usableHeightAt(def, pt.x, pt.z);
      if (Number.isFinite(uh)) minUsable = Math.min(minUsable, uh);
      const cLoose = classifyPoint(def, pt.x, pt.y, pt.z);
      if (cLoose.inside) {
        const c30 = classifyPoint(def, pt.x, pt.y, pt.z + (pt.z >= 0 ? TIGHT_MM : -TIGHT_MM));
        const c30y = classifyPoint(def, pt.x, pt.y + TIGHT_MM, pt.z);
        if (!c30.inside || !c30y.inside) tight = true;
      }
    }

    if (outside) {
      const sloped =
        def.contour.kind === "crown" ||
        def.contour.kind === "ld3" ||
        def.contour.kind === "ld7" ||
        def.contour.kind === "aircraft";
      if (sloped && crownHit && Number.isFinite(minUsable) && ext.heightMm > minUsable) {
        issues.push({
          level: "fail",
          code: "contour",
          message: `${ext.heightMm.toFixed(0)} mm piece height exceeds ${minUsable.toFixed(0)} mm usable height at this station under ${name} net contour.`,
          ...tag,
        });
      } else if (aabb.maxX - aabb.minX > def.innerLengthMm + 1 || aabb.maxZ - aabb.minZ > def.innerWidthMm + 1) {
        issues.push({
          level: "fail",
          code: "footprint",
          message: `${piece.description} footprint ${ext.lengthMm.toFixed(0)} × ${ext.widthMm.toFixed(0)} mm does not fit ${def.innerLengthMm} × ${def.innerWidthMm} mm inner deck of ${name}.`,
          ...tag,
        });
      } else {
        issues.push({
          level: "fail",
          code: "envelope",
          message: `${piece.description} intersects the ${name} inner envelope / contour.`,
          ...tag,
        });
      }
    } else if (tight) {
      issues.push({
        level: "warn",
        code: "clearance",
        message: `${piece.description} has less than 30 mm clearance to the ${name} contour.`,
        ...tag,
      });
    }
  }

  const others = job.placements.filter(
    (q) => q.roomId === placement.roomId && q.id !== placement.id,
  );
  for (const q of others) {
    const other = pieceById(job, q.pieceId);
    if (!other) continue;
    const b = placementAabb(other, q);
    if (aabbsOverlap(aabb, b, 0)) {
      issues.push({
        level: "fail",
        code: "collision",
        message: `${piece.description} intersects ${other.description}.`,
        ...tag,
      });
      break;
    }
  }

  if (placement.yMm > 1) {
    const supports = others.filter((q) => {
      const other = pieceById(job, q.pieceId);
      if (!other) return false;
      const b = placementAabb(other, q);
      const stackedOn =
        Math.abs(b.maxY - aabb.minY) < 15 &&
        aabbsOverlap(
          { ...aabb, minY: aabb.minY, maxY: aabb.minY + 1 },
          { ...b, minY: b.maxY - 1, maxY: b.maxY },
          -50,
        );
      return stackedOn && aabb.minX < b.maxX && aabb.maxX > b.minX && aabb.minZ < b.maxZ && aabb.maxZ > b.minZ;
    });
    if (supports.length === 0 && !piece.floorOnly) {
      issues.push({
        level: "warn",
        code: "floating",
        message: `${piece.description} is off the floor with no supporting piece under it.`,
        ...tag,
      });
    }
    for (const q of supports) {
      const other = pieceById(job, q.pieceId)!;
      if (!other.stackable) {
        issues.push({
          level: "warn",
          code: "stack-illegal",
          message: `Stacking ${piece.description} on non-stackable ${other.description}.`,
          ...tag,
        });
      } else if (other.maxStackWeightKg != null && piece.weightKg > other.maxStackWeightKg) {
        issues.push({
          level: "fail",
          code: "stack-weight",
          message: `${piece.description} (${piece.weightKg} kg) exceeds ${other.maxStackWeightKg} kg max stack weight on ${other.description}.`,
          ...tag,
        });
      }
    }
  }

  if (def.slots?.length) {
    const slot = def.slots.find(
      (s) =>
        Math.abs(placement.xMm - s.xMm) <= s.lengthMm / 2 &&
        Math.abs(placement.zMm - s.zMm) <= s.widthMm / 2,
    );
    if (slot) {
      let slotKg = 0;
      for (const q of job.placements.filter((p) => p.roomId === placement.roomId)) {
        const pc = pieceById(job, q.pieceId);
        if (!pc) continue;
        if (Math.abs(q.xMm - slot.xMm) <= slot.lengthMm / 2 && Math.abs(q.zMm - slot.zMm) <= slot.widthMm / 2) {
          slotKg += pc.weightKg;
        }
      }
      if (slotKg > slot.maxKg + 0.5) {
        issues.push({
          level: "fail",
          code: "position-weight",
          message: `Position ${slot.name} is at ${Math.round(slotKg)} kg vs ${slot.maxKg} kg limit.`,
          ...tag,
        });
      }
    }
  }

  return issues;
}

const DGR_FOOD_RE = /food|perish|meat|fruit|vegetable/i;

export function validateRoom(job: Job, roomId: string): ValidationIssue[] {
  const room = job.rooms.find((r) => r.id === roomId);
  if (!room) return [];
  const def = requireEquipment(room.equipmentId);
  const issues: ValidationIssue[] = [];
  const inRoom = job.placements.filter((p) => p.roomId === roomId);

  let payload = 0;
  for (const p of inRoom) {
    const piece = pieceById(job, p.pieceId);
    if (piece) payload += piece.weightKg;
    issues.push(...validatePlacement(job, p, def));
  }

  if (payload > def.maxPayloadKg + 0.5) {
    issues.push({
      level: "fail",
      code: "payload",
      message: `Payload ${Math.round(payload)} kg exceeds ${def.maxPayloadKg} kg max for ${def.shortName}.`,
      roomId,
    });
  }

  const placed = inRoom
    .map((p) => ({ p, piece: pieceById(job, p.pieceId) }))
    .filter((x): x is { p: Placement; piece: CargoPiece } => !!x.piece);

  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      const foodA = DGR_FOOD_RE.test(a.piece.description);
      const foodB = DGR_FOOD_RE.test(b.piece.description);
      if ((a.piece.dgr && foodB) || (b.piece.dgr && foodA)) {
        issues.push({
          level: "warn",
          code: "dgr-food",
          message: `DGR ${a.piece.dgr ? a.piece.description : b.piece.description} is stowed next to food cargo.`,
          roomId,
          placementId: a.p.id,
        });
      }
      if (a.piece.dgr && b.piece.dgr && a.piece.dgrClass && b.piece.dgrClass) {
        if (incompatibleDgr(a.piece.dgrClass, b.piece.dgrClass)) {
          issues.push({
            level: "warn",
            code: "dgr-seg",
            message: `DGR class ${a.piece.dgrClass} near class ${b.piece.dgrClass} — check segregation table.`,
            roomId,
            placementId: a.p.id,
          });
        }
      }
    }
  }

  return uniqueIssues(issues);
}

function incompatibleDgr(a: string, b: string): boolean {
  const na = a.replace(/[^0-9.]/g, "");
  const nb = b.replace(/[^0-9.]/g, "");
  const pair = [na, nb].sort().join("|");
  const bad = new Set(["1|2", "1|3", "1|4", "1|5", "1|8", "2.3|5.1", "4.2|5.1", "8|5.1"]);
  if (na.startsWith("1") || nb.startsWith("1")) return na !== nb;
  return bad.has(pair);
}

function uniqueIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  const out: ValidationIssue[] = [];
  for (const i of issues) {
    const k = `${i.level}|${i.code}|${i.message}|${i.placementId ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(i);
  }
  return out;
}

export function placementStatus(
  issues: ValidationIssue[],
  placementId: string,
): "ok" | "warn" | "fail" {
  let warn = false;
  for (const i of issues) {
    if (i.placementId !== placementId && i.code !== "payload") continue;
    if (i.placementId === placementId && i.level === "fail") return "fail";
    if (i.placementId === placementId && i.level === "warn") warn = true;
  }
  return warn ? "warn" : "ok";
}

export function diagnoseUnplaceable(piece: CargoPiece, def: EquipmentDef): string {
  const door = fitsThroughDoor(piece, def);
  if (!door.ok && door.message) return door.message;
  const maxDim = Math.max(piece.lengthMm, piece.widthMm);
  const minDeck = Math.min(def.innerLengthMm, def.innerWidthMm);
  if (Math.min(piece.lengthMm, piece.widthMm) > Math.max(def.innerLengthMm, def.innerWidthMm)) {
    return `${piece.description} footprint is larger than the ${def.shortName} inner deck.`;
  }
  if (piece.heightMm > def.innerHeightMm && def.contour.kind !== "open") {
    return `${piece.heightMm} mm piece height exceeds ${def.innerHeightMm} mm inner height of ${def.shortName}.`;
  }
  if (def.contour.kind === "crown" || def.contour.kind === "ld3" || def.contour.kind === "ld7" || def.contour.kind === "aircraft") {
    const uh = usableHeightAt(def, 0, Math.min(piece.widthMm, piece.lengthMm) / 2);
    if (piece.heightMm > uh) {
      return `${piece.heightMm.toFixed(0)} mm piece height exceeds ${uh.toFixed(0)} mm usable height at this station under ${def.shortName} net contour.`;
    }
  }
  if (maxDim > minDeck && piece.notRotatable) {
    return `${piece.description} is marked not rotatable and cannot present a fitting face to the ${def.shortName} deck.`;
  }
  return `${piece.description} could not be placed in ${def.shortName} without leaving the inner envelope.`;
}
