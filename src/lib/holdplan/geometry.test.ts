import assert from "node:assert/strict";
import { test } from "node:test";
import { getEquipment } from "./equipment.ts";
import { extentsFor, usableHeightAt, classifyPoint, placementAabb } from "./geometry.ts";
import { fitsThroughDoor } from "./door.ts";
import type { CargoPiece, Placement } from "./types.ts";

function box(p: Partial<CargoPiece> = {}): CargoPiece {
  return {
    id: "p",
    description: "Crate",
    lengthMm: 1200,
    widthMm: 800,
    heightMm: 1600,
    weightKg: 380,
    quantity: 1,
    shape: "box",
    stackable: true,
    thisSideUp: true,
    floorOnly: false,
    notRotatable: false,
    dgr: false,
    cgOffsetMm: { x: 0, y: 0, z: 0 },
    color: "#000",
    source: "manual",
    ...p,
  };
}

test("PMC crown is lower at the sides than on centerline", () => {
  const pmc = getEquipment("uld-pmc");
  assert.ok(pmc);
  const center = usableHeightAt(pmc, 0, 0);
  const side = usableHeightAt(pmc, 0, 1100);
  assert.ok(center > 2300, `center height ${center}`);
  assert.ok(side < 2100, `side height ${side} should block a 2100 mm crate`);
  assert.ok(side > 1500, `side height ${side} should still be above the wall`);
});

test("tall wide crate is outside PMC crown while a cabinet at center is inside", () => {
  const pmc = getEquipment("uld-pmc");
  assert.ok(pmc);
  const tall = box({
    description: "Tall crate",
    lengthMm: 2000,
    widthMm: 2200,
    heightMm: 2100,
    floorOnly: true,
  });
  const cab = box();
  const tallP: Placement = {
    id: "a",
    pieceId: tall.id,
    instanceIndex: 0,
    roomId: "r",
    xMm: 0,
    yMm: 0,
    zMm: 0,
    rotY: 0,
  };
  const cabP: Placement = { ...tallP, id: "b", pieceId: cab.id };
  const tallAabb = placementAabb(tall, tallP);
  const cabAabb = placementAabb(cab, cabP);
  const tallTopSide = classifyPoint(pmc, tallAabb.maxX - 10, tallAabb.maxY, tallAabb.maxZ - 10);
  const cabTop = classifyPoint(pmc, cabAabb.maxX - 10, cabAabb.maxY, 0);
  assert.equal(tallTopSide.inside, false);
  assert.equal(cabTop.inside, true);
});

test("40' flatrack classifies overhang instead of a hard envelope fail", () => {
  const fr = getEquipment("fr-40");
  assert.ok(fr);
  const over = classifyPoint(fr, 0, 100, 2000);
  assert.equal(over.overhang, true);
  assert.equal(over.inside, false);
  const onWell = classifyPoint(fr, 0, 100, 0);
  assert.equal(onWell.inside, true);
});

test("yaw 90 swaps length and width", () => {
  const e0 = extentsFor(box({ lengthMm: 1200, widthMm: 800, heightMm: 1600 }), 0);
  const e90 = extentsFor(box({ lengthMm: 1200, widthMm: 800, heightMm: 1600 }), 90);
  assert.equal(e0.lengthMm, 1200);
  assert.equal(e90.lengthMm, 800);
  assert.equal(e90.widthMm, 1200);
  assert.equal(e90.heightMm, 1600);
});

test("oversized crate does not fit a 20' door", () => {
  const iso = getEquipment("iso-20");
  assert.ok(iso);
  const crate = box({
    description: "Oversized case",
    lengthMm: 3000,
    widthMm: 2500,
    heightMm: 2300,
    thisSideUp: true,
    notRotatable: true,
    floorOnly: true,
  });
  const r = fitsThroughDoor(crate, iso);
  assert.equal(r.ok, false);
  assert.match(r.message ?? "", /does not fit/);
});

test("spare crate fits a 20' door", () => {
  const iso = getEquipment("iso-20");
  assert.ok(iso);
  const crate = box({ lengthMm: 800, widthMm: 600, heightMm: 600, thisSideUp: false });
  assert.equal(fitsThroughDoor(crate, iso).ok, true);
});
