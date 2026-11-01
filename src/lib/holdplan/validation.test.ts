import assert from "node:assert/strict";
import { test } from "node:test";
import { getEquipment, requireEquipment } from "./equipment.ts";
import { aabbsOverlap, placementAabb } from "./geometry.ts";
import { computeMetrics } from "./metrics.ts";
import { createEmptyJob } from "./seed.ts";
import type { CargoPiece, Job, Placement } from "./types.ts";
import { validatePlacement, validateRoom } from "./validation.ts";

function piece(extra: Partial<CargoPiece> = {}): CargoPiece {
  return {
    id: extra.id ?? "p1",
    description: extra.description ?? "Crate",
    lengthMm: extra.lengthMm ?? 1000,
    widthMm: extra.widthMm ?? 800,
    heightMm: extra.heightMm ?? 1000,
    weightKg: extra.weightKg ?? 200,
    quantity: extra.quantity ?? 1,
    shape: extra.shape ?? "box",
    stackable: extra.stackable ?? false,
    thisSideUp: extra.thisSideUp ?? true,
    floorOnly: extra.floorOnly ?? true,
    notRotatable: extra.notRotatable ?? false,
    dgr: extra.dgr ?? false,
    cgOffsetMm: extra.cgOffsetMm ?? { x: 0, y: 0, z: 0 },
    color: "#000",
    source: "manual",
    ...extra,
  };
}

function place(extra: Partial<Placement> = {}): Placement {
  return {
    id: extra.id ?? "pl1",
    pieceId: extra.pieceId ?? "p1",
    instanceIndex: extra.instanceIndex ?? 0,
    roomId: extra.roomId ?? "r1",
    xMm: extra.xMm ?? 0,
    yMm: extra.yMm ?? 0,
    zMm: extra.zMm ?? 0,
    rotY: extra.rotY ?? 0,
  };
}

function jobOf(equipmentId: string, cargo: CargoPiece[], placements: Placement[]): Job {
  const job = createEmptyJob("rules");
  job.lengthUnit = "mm";
  job.massUnit = "kg";
  job.rooms = [{ id: "r1", equipmentId, name: equipmentId }];
  job.cargo = cargo;
  job.placements = placements;
  return job;
}

function failCodes(job: Job): string[] {
  return validateRoom(job, "r1")
    .filter((i) => i.level === "fail")
    .map((i) => i.code);
}

function failMessages(job: Job): string[] {
  return validateRoom(job, "r1")
    .filter((i) => i.level === "fail")
    .map((i) => i.message);
}

test("envelope: piece fully inside a rectangular room passes", () => {
  const crate = piece({ id: "p1", lengthMm: 1200, widthMm: 800, heightMm: 1000, weightKg: 300 });
  const job = jobOf("iso-20", [crate], [place({ xMm: 0, zMm: 0 })]);
  const fails = failCodes(job);
  assert.equal(fails.length, 0, `inside rectangular room should pass, got fails: ${failMessages(job).join("; ")}`);
});

test("envelope: piece 1 mm outside a wall fails", () => {
  const iso = requireEquipment("iso-20");
  const crate = piece({ id: "p1", lengthMm: 1000, widthMm: 800, heightMm: 1000, weightKg: 200 });
  const hz = 400;
  const zMm = iso.innerWidthMm / 2 - hz + 1;
  const job = jobOf("iso-20", [crate], [place({ xMm: 0, zMm })]);
  const aabb = placementAabb(crate, job.placements[0]!);
  assert.ok(aabb.maxZ > iso.innerWidthMm / 2, "fixture: AABB should sit 1 mm past the side wall");
  const fails = failCodes(job);
  assert.ok(
    fails.includes("envelope") || fails.includes("footprint"),
    `piece 1 mm outside wall should fail envelope/footprint, got: ${failMessages(job).join("; ") || "no fails"}`,
  );
});

test("contour: tall piece under a PMC crown fails with usable height in the message", () => {
  const pmc = getEquipment("uld-pmc");
  assert.ok(pmc);
  const tall = piece({
    id: "p1",
    description: "Rotor case",
    lengthMm: 2000,
    widthMm: 2200,
    heightMm: 2100,
    weightKg: 1800,
    floorOnly: true,
  });
  const job = jobOf("uld-pmc", [tall], [place({ xMm: 0, zMm: 0 })]);
  const msgs = failMessages(job);
  assert.ok(msgs.length > 0, "PMC crown should reject a 2100 mm piece at the sides");
  assert.match(
    msgs.join(" | "),
    /usable height/i,
    `PMC crown fail must mention usable height, got: ${msgs.join("; ")}`,
  );
});

test("door: footprint fits the deck but the piece does not fit the door → fail door", () => {
  const crate = piece({
    id: "p1",
    description: "Tall panel",
    lengthMm: 2000,
    widthMm: 2300,
    heightMm: 2390,
    weightKg: 400,
    thisSideUp: true,
    notRotatable: true,
    floorOnly: true,
  });
  const iso = requireEquipment("iso-20");
  assert.ok(crate.widthMm <= iso.innerWidthMm, "fixture: width must fit the inner deck");
  assert.ok(crate.heightMm <= iso.innerHeightMm, "fixture: height must fit inner height");
  assert.ok(iso.door && crate.heightMm > iso.door.heightMm, "fixture: height must exceed the door");
  const job = jobOf("iso-20", [crate], [place({ xMm: 0, zMm: 0 })]);
  const issues = validatePlacement(job, job.placements[0]!, iso);
  assert.ok(
    issues.some((i) => i.level === "fail" && i.code === "door"),
    `piece that misses the door should fail code=door, got: ${issues.map((i) => `${i.code}:${i.message}`).join("; ")}`,
  );
  assert.match(issues.find((i) => i.code === "door")?.message ?? "", /door/i);
});

test("collision: overlapping AABBs fail collision", () => {
  const a = piece({ id: "a", description: "A", lengthMm: 1000, widthMm: 800, heightMm: 800, weightKg: 100 });
  const b = piece({ id: "b", description: "B", lengthMm: 1000, widthMm: 800, heightMm: 800, weightKg: 100 });
  const pa = place({ id: "pa", pieceId: "a", xMm: 0, zMm: 0 });
  const pb = place({ id: "pb", pieceId: "b", xMm: 200, zMm: 0 });
  assert.equal(aabbsOverlap(placementAabb(a, pa), placementAabb(b, pb), 0), true, "fixture: AABBs must overlap");
  const job = jobOf("iso-20", [a, b], [pa, pb]);
  assert.ok(
    failCodes(job).includes("collision"),
    `overlapping AABBs should fail collision, got: ${failMessages(job).join("; ")}`,
  );
});

test("collision: 1 mm overlap fails collision", () => {
  const a = piece({ id: "a", description: "A", lengthMm: 1000, widthMm: 800, heightMm: 800, weightKg: 100 });
  const b = piece({ id: "b", description: "B", lengthMm: 1000, widthMm: 800, heightMm: 800, weightKg: 100 });
  const pa = place({ id: "pa", pieceId: "a", xMm: 0, zMm: 0 });
  const pb = place({ id: "pb", pieceId: "b", xMm: 999, zMm: 0 });
  const aa = placementAabb(a, pa);
  const bb = placementAabb(b, pb);
  assert.equal(aa.maxX - bb.minX, 1, "fixture: AABBs overlap by 1 mm along X");
  assert.equal(aabbsOverlap(aa, bb, 0), true, "1 mm overlap must count as collision");
  const job = jobOf("iso-20", [a, b], [pa, pb]);
  assert.ok(
    failCodes(job).includes("collision"),
    `1 mm overlap should fail collision, got: ${failMessages(job).join("; ") || "no fails"}`,
  );
});

test("collision: AABBs touching at a face (0 mm overlap) pass", () => {
  const a = piece({ id: "a", description: "A", lengthMm: 1000, widthMm: 800, heightMm: 800, weightKg: 100 });
  const b = piece({ id: "b", description: "B", lengthMm: 1000, widthMm: 800, heightMm: 800, weightKg: 100 });
  const pa = place({ id: "pa", pieceId: "a", xMm: 0, zMm: 0 });
  const pb = place({ id: "pb", pieceId: "b", xMm: 1000, zMm: 0 });
  const aa = placementAabb(a, pa);
  const bb = placementAabb(b, pb);
  assert.equal(aa.maxX, bb.minX, "fixture: faces should kiss at x = 500");
  assert.equal(aabbsOverlap(aa, bb, 0), false, "touching faces must not count as overlap");
  const job = jobOf("iso-20", [a, b], [pa, pb]);
  assert.ok(
    !failCodes(job).includes("collision"),
    `0 mm overlap (shared face) should pass, got: ${failMessages(job).join("; ")}`,
  );
});

test("weight: payload over room max fails payload", () => {
  const anvil = piece({
    id: "p1",
    description: "Anvil",
    lengthMm: 1000,
    widthMm: 1000,
    heightMm: 1000,
    weightKg: 2000,
    floorOnly: true,
  });
  const ake = requireEquipment("uld-ake");
  assert.ok(anvil.weightKg > ake.maxPayloadKg, "fixture: piece heavier than AKE payload");
  const job = jobOf("uld-ake", [anvil], [place({ xMm: 0, zMm: 0 })]);
  assert.ok(
    failCodes(job).includes("payload"),
    `payload over max should fail payload, got: ${failMessages(job).join("; ")}`,
  );
});

test("weight: aircraft position over slot max kg fails position-weight", () => {
  const def = requireEquipment("ac-777f");
  const slot = def.slots?.[0];
  assert.ok(slot, "777F must have PMC position slots");
  const heavy = piece({
    id: "p1",
    description: "Engine",
    lengthMm: 2000,
    widthMm: 2000,
    heightMm: 1500,
    weightKg: slot.maxKg + 500,
    floorOnly: true,
  });
  const job = jobOf("ac-777f", [heavy], [place({ xMm: slot.xMm, zMm: slot.zMm })]);
  assert.ok(
    failCodes(job).includes("position-weight"),
    `slot overweight should fail position-weight, got: ${failMessages(job).join("; ")}`,
  );
});

test("CG: a single centered piece sits near the geometric center", () => {
  const crate = piece({ id: "p1", lengthMm: 1200, widthMm: 800, heightMm: 1000, weightKg: 500 });
  const job = jobOf("iso-20", [crate], [place({ xMm: 0, zMm: 0 })]);
  const m = computeMetrics(job, "r1");
  assert.ok(m, "metrics should exist");
  assert.ok(Math.abs(m.cgXMm) < 1, `centered piece CG long should be ~0, got ${m.cgXMm}`);
  assert.ok(Math.abs(m.cgZMm) < 1, `centered piece CG lat should be ~0, got ${m.cgZMm}`);
});

test("CG: adding a heavy piece at one end moves CG toward that end", () => {
  const light = piece({ id: "light", description: "Light", lengthMm: 800, widthMm: 600, heightMm: 600, weightKg: 100 });
  const heavy = piece({ id: "heavy", description: "Heavy", lengthMm: 800, widthMm: 600, heightMm: 600, weightKg: 1000 });
  const onlyLight = jobOf("iso-20", [light], [place({ id: "pl", pieceId: "light", xMm: 0, zMm: 0 })]);
  const both = jobOf(
    "iso-20",
    [light, heavy],
    [
      place({ id: "pl", pieceId: "light", xMm: 0, zMm: 0 }),
      place({ id: "ph", pieceId: "heavy", xMm: 2000, zMm: 0 }),
    ],
  );
  const cg0 = computeMetrics(onlyLight, "r1")!.cgXMm;
  const cg1 = computeMetrics(both, "r1")!.cgXMm;
  assert.ok(cg1 > cg0 + 500, `heavy piece at +X must pull CG toward +X (was ${cg0}, now ${cg1})`);
  assert.ok(cg1 > 1500, `CG should sit near the heavy end, got ${cg1}`);
});
