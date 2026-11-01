import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeJob } from "./persist.ts";
import { createEmptyJob } from "./seed.ts";
import type { CargoPiece, Job, Placement } from "./types.ts";

function crate(): CargoPiece {
  return {
    id: "cg_rotor",
    description: "Rotor case",
    lengthMm: 4200,
    widthMm: 2200,
    heightMm: 2100,
    weightKg: 6800,
    quantity: 1,
    shape: "box",
    stackable: false,
    thisSideUp: true,
    floorOnly: true,
    notRotatable: false,
    dgr: false,
    cgOffsetMm: { x: 0, y: 0, z: 0 },
    color: "#000",
    source: "manual",
  };
}

function storedJob(): Job {
  const job = createEmptyJob("Turbine rotor – ZRH charter");
  const p: Placement = {
    id: "pl_rotor",
    pieceId: "cg_rotor",
    instanceIndex: 0,
    roomId: "rm_fr",
    xMm: 1250,
    yMm: 0,
    zMm: -80,
    rotY: 90,
  };
  return {
    ...job,
    id: "job_persist",
    rooms: [
      { id: "rm_fr", equipmentId: "fr-40", name: "40' flatrack" },
      { id: "rm_pmc", equipmentId: "uld-pmc", name: "PMC + net" },
    ],
    cargo: [crate()],
    placements: [p],
    keepAisle: true,
    chargeableRuleId: "iata-6000",
  };
}

test("persistence: save job, reload, same piece positions and room id", () => {
  const original = storedJob();
  const wire = JSON.stringify(original);
  const reloaded = normalizeJob(JSON.parse(wire) as Job);
  assert.equal(reloaded.placements.length, 1, "reload should keep the placement");
  const p = reloaded.placements[0]!;
  assert.equal(p.xMm, 1250, "reload keeps xMm");
  assert.equal(p.yMm, 0, "reload keeps yMm");
  assert.equal(p.zMm, -80, "reload keeps zMm");
  assert.equal(p.rotY, 90, "reload keeps yaw");
  assert.equal(p.roomId, "rm_fr", "reload keeps room id");
  assert.equal(p.pieceId, "cg_rotor", "reload keeps piece id");
  assert.ok(
    reloaded.rooms.some((r) => r.id === "rm_fr"),
    "reload keeps the flatrack room",
  );
});

test("persistence: unknown equipment rooms are dropped and their placements go with them", () => {
  const original = storedJob();
  original.rooms.push({ id: "rm_ghost", equipmentId: "not-a-room", name: "Ghost" });
  original.placements.push({
    id: "pl_ghost",
    pieceId: "cg_rotor",
    instanceIndex: 1,
    roomId: "rm_ghost",
    xMm: 0,
    yMm: 0,
    zMm: 0,
    rotY: 0,
  });
  const reloaded = normalizeJob(original);
  assert.ok(!reloaded.rooms.some((r) => r.id === "rm_ghost"), "unknown room must be dropped");
  assert.ok(!reloaded.placements.some((p) => p.roomId === "rm_ghost"), "placements in dropped rooms must go");
  assert.equal(reloaded.placements[0]?.roomId, "rm_fr", "valid placement must survive");
});

test("persistence: legacy records get valid timestamps and a valid status", () => {
  const raw = {
    ...storedJob(),
    createdAt: undefined,
    updatedAt: "not-a-date",
    lastOpenedAt: undefined,
    status: "bogus",
  } as unknown as Job;
  const reloaded = normalizeJob(raw);
  assert.ok(!Number.isNaN(Date.parse(reloaded.createdAt)), "createdAt should be normalized");
  assert.ok(!Number.isNaN(Date.parse(reloaded.updatedAt)), "updatedAt should be normalized");
  assert.ok(!Number.isNaN(Date.parse(reloaded.lastOpenedAt)), "lastOpenedAt should be normalized");
  assert.equal(reloaded.status, "draft", "an unknown status falls back to draft");
});
