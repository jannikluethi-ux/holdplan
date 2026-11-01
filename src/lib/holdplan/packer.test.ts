import assert from "node:assert/strict";
import { test } from "node:test";
import { extentsFor } from "./geometry.ts";
import { suggestLayout } from "./packer.ts";
import { createEmptyJob, defaultPieceColor } from "./seed.ts";
import type { CargoPiece } from "./types.ts";
import { validateRoom } from "./validation.ts";

function piece(i: number, extra: Partial<CargoPiece> = {}): CargoPiece {
  return {
    id: `cg_${i}`,
    description: extra.description ?? `Box ${i}`,
    lengthMm: extra.lengthMm ?? 800,
    widthMm: extra.widthMm ?? 600,
    heightMm: extra.heightMm ?? 600,
    weightKg: extra.weightKg ?? 90,
    quantity: extra.quantity ?? 1,
    shape: extra.shape ?? "box",
    stackable: extra.stackable ?? true,
    thisSideUp: extra.thisSideUp ?? false,
    floorOnly: extra.floorOnly ?? false,
    notRotatable: extra.notRotatable ?? false,
    dgr: extra.dgr ?? false,
    cgOffsetMm: { x: 0, y: 0, z: 0 },
    color: defaultPieceColor(i),
    source: "manual",
    ...extra,
  };
}

test("suggest layout places a handful of small crates in a 20' box", () => {
  const job = createEmptyJob("pack");
  job.rooms = [{ id: "r1", equipmentId: "iso-20", name: "20'" }];
  job.cargo = [piece(1, { quantity: 6, lengthMm: 800, widthMm: 600, heightMm: 600, weightKg: 90 })];
  const { placements, failures } = suggestLayout(job, "r1", 100, false);
  const inRoom = placements.filter((p) => p.roomId === "r1");
  assert.equal(failures.length, 0, failures.map((f) => f.reason).join("; "));
  assert.equal(inRoom.length, 6);
  const issues = validateRoom({ ...job, placements }, "r1").filter((i) => i.level === "fail");
  assert.equal(issues.length, 0, issues.map((i) => i.message).join("; "));
});

test("payload fail is reported instead of placing overweight cargo", () => {
  const job = createEmptyJob("heavy");
  job.rooms = [{ id: "r1", equipmentId: "uld-ake", name: "AKE" }];
  job.cargo = [
    piece(1, {
      description: "Anvil",
      lengthMm: 800,
      widthMm: 800,
      heightMm: 800,
      weightKg: 5000,
      stackable: false,
      floorOnly: true,
    }),
  ];
  const { placements, failures } = suggestLayout(job, "r1", 100, false);
  assert.equal(placements.filter((p) => p.roomId === "r1").length, 0);
  assert.ok(failures.length >= 1);
  assert.match(failures[0]!.reason, /payload|envelope|door|height|deck/i);
});

test("piece that cannot enter the door is listed as a door failure", () => {
  const job = createEmptyJob("door");
  job.rooms = [{ id: "r1", equipmentId: "iso-20", name: "20'" }];
  job.cargo = [
    piece(1, {
      description: "Oversized case",
      lengthMm: 3000,
      widthMm: 2500,
      heightMm: 2300,
      weightKg: 2000,
      thisSideUp: true,
      floorOnly: true,
      notRotatable: true,
      stackable: false,
    }),
  ];
  const { failures } = suggestLayout(job, "r1", 100, false);
  assert.ok(failures.length >= 1);
  assert.match(failures[0]!.reason.toLowerCase(), /door|footprint|height|envelope/);
});

test("EU curtainsider accepts a piece that would fail a closed-box door", () => {
  const job = createEmptyJob("cs");
  job.rooms = [{ id: "r1", equipmentId: "eu-cs-136", name: "CS" }];
  job.cargo = [
    piece(1, {
      description: "Side-loaded case",
      lengthMm: 2400,
      widthMm: 1200,
      heightMm: 2200,
      weightKg: 800,
      thisSideUp: true,
      floorOnly: true,
      stackable: false,
    }),
  ];
  const { placements, failures } = suggestLayout(job, "r1", 100, false);
  assert.equal(failures.length, 0, failures.map((f) => f.reason).join("; "));
  assert.equal(placements.filter((p) => p.roomId === "r1").length, 1);
});

test("suggest: 12 identical small crates on a 40' floor are all placed or leftovers are explicit", () => {
  const job = createEmptyJob("forty");
  job.rooms = [{ id: "r1", equipmentId: "iso-40", name: "40'" }];
  job.cargo = [piece(1, { quantity: 12, lengthMm: 800, widthMm: 600, heightMm: 600, weightKg: 90, thisSideUp: true })];
  const { placements, failures } = suggestLayout(job, "r1", 100, false);
  const inRoom = placements.filter((p) => p.roomId === "r1");
  assert.equal(
    inRoom.length + failures.length,
    12,
    `every crate must be placed or listed as leftover (placed ${inRoom.length}, leftovers ${failures.length})`,
  );
  assert.ok(inRoom.length >= 10, `40' dry van should take most of 12 small crates, placed ${inRoom.length}`);
  for (const f of failures) {
    assert.ok(f.reason.trim().length > 0, "leftover must include a reason");
  }
});

test("suggest: one piece larger than the room in all rotations is leftover with a reason", () => {
  const job = createEmptyJob("huge");
  job.rooms = [{ id: "r1", equipmentId: "iso-20", name: "20'" }];
  job.cargo = [
    piece(1, {
      description: "Oversized skid",
      lengthMm: 8000,
      widthMm: 8000,
      heightMm: 8000,
      weightKg: 2000,
      thisSideUp: true,
      notRotatable: true,
      floorOnly: true,
      stackable: false,
    }),
  ];
  const { placements, failures } = suggestLayout(job, "r1", 100, false);
  assert.equal(placements.filter((p) => p.roomId === "r1").length, 0, "oversized piece must not be placed");
  assert.ok(failures.length >= 1, "oversized piece must be leftover");
  assert.ok(failures[0]!.reason.trim().length > 0, "leftover must name the rule");
});

test("suggest: this-side-up keeps the height axis unchanged", () => {
  const job = createEmptyJob("tsu");
  job.rooms = [{ id: "r1", equipmentId: "iso-20", name: "20'" }];
  job.cargo = [
    piece(1, {
      description: "Upright cabinet",
      lengthMm: 1200,
      widthMm: 800,
      heightMm: 1800,
      weightKg: 280,
      thisSideUp: true,
      floorOnly: true,
      stackable: false,
    }),
  ];
  const { placements, failures } = suggestLayout(job, "r1", 100, false);
  assert.equal(failures.length, 0, failures.map((f) => f.reason).join("; "));
  assert.equal(placements.length, 1);
  const p = placements[0]!;
  const ext = extentsFor(job.cargo[0]!, p.rotY);
  assert.equal(ext.heightMm, 1800, `this-side-up must keep height 1800 mm, got ${ext.heightMm} at rot ${p.rotY}`);
});

test("suggest: layout does not put cargo outside the envelope", () => {
  const job = createEmptyJob("env");
  job.rooms = [{ id: "r1", equipmentId: "iso-20", name: "20'" }];
  job.cargo = [piece(1, { quantity: 8, lengthMm: 800, widthMm: 600, heightMm: 600, weightKg: 80, thisSideUp: true })];
  const { placements } = suggestLayout(job, "r1", 100, false);
  const packed = { ...job, placements };
  const outside = validateRoom(packed, "r1").filter(
    (i) => i.level === "fail" && (i.code === "envelope" || i.code === "contour" || i.code === "footprint"),
  );
  assert.equal(outside.length, 0, `suggest must stay inside the envelope, got: ${outside.map((i) => i.message).join("; ")}`);
});
