import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeChargeable,
  getChargeableRule,
  nmfcClassFromPcf,
  occupiedLdm,
  typicalRuleFor,
  volumetricKgForVolume,
} from "./chargeable.ts";
import { EQUIPMENT, getEquipment } from "./equipment.ts";
import { fitsThroughDoor } from "./door.ts";
import { createEmptyJob } from "./seed.ts";
import type { CargoPiece, Placement } from "./types.ts";

function piece(extra: Partial<CargoPiece> = {}): CargoPiece {
  return {
    id: extra.id ?? "p1",
    description: extra.description ?? "Crate",
    lengthMm: extra.lengthMm ?? 1000,
    widthMm: extra.widthMm ?? 1000,
    heightMm: extra.heightMm ?? 1000,
    weightKg: extra.widthMm && extra.weightKg !== undefined ? extra.weightKg : (extra.weightKg ?? 50),
    quantity: extra.quantity ?? 1,
    shape: extra.shape ?? "box",
    stackable: extra.stackable ?? false,
    thisSideUp: extra.thisSideUp ?? true,
    floorOnly: extra.floorOnly ?? false,
    notRotatable: extra.notRotatable ?? false,
    dgr: extra.dgr ?? false,
    cgOffsetMm: { x: 0, y: 0, z: 0 },
    color: "#000",
    source: "manual",
    ...extra,
  };
}

test("IATA 1:6000 bills 1 m³ as ~167 kg", () => {
  const rule = getChargeableRule("iata-6000");
  const kg = volumetricKgForVolume(1, rule);
  assert.ok(Math.abs(kg - 166.6667) < 0.05, `got ${kg}`);
});

test("express 1:5000 bills 1 m³ as 200 kg", () => {
  assert.equal(volumetricKgForVolume(1, getChargeableRule("express-5000")), 200);
});

test("EU groupage 1:333 bills cube when actual is light", () => {
  const job = createEmptyJob();
  job.chargeableRuleId = "eu-road-333";
  const def = getEquipment("eu-cs-136")!;
  const c = computeChargeable(job, def, [], 50, 1);
  assert.equal(c.basis, "volume");
  assert.ok(Math.abs(c.chargeableKg - 333) < 0.5, `got ${c.chargeableKg}`);
});

test("EU LDM bills occupied floor length at 1,750 kg/m", () => {
  const job = createEmptyJob();
  job.chargeableRuleId = "eu-ldm-1750";
  const crate = piece({ id: "p1", lengthMm: 2000, widthMm: 800, heightMm: 800, weightKg: 100 });
  job.cargo = [crate];
  const def = getEquipment("eu-cs-136")!;
  const p: Placement = {
    id: "pl",
    pieceId: "p1",
    instanceIndex: 0,
    roomId: "r",
    xMm: 0,
    yMm: 0,
    zMm: 0,
    rotY: 0,
  };
  const c = computeChargeable(job, def, [p], 100, 1.28);
  assert.equal(c.basis, "ldm");
  assert.ok(Math.abs(c.ldm - 2) < 0.05, `ldm ${c.ldm}`);
  assert.ok(Math.abs(c.chargeableKg - 3500) < 5, `got ${c.chargeableKg}`);
});

test("US LTL DIM ÷ 250 matches in³/250 in pounds", () => {
  const rule = getChargeableRule("us-ltl-250");
  const kg = volumetricKgForVolume(1, rule);
  // 1 m³ = 61,023.744 in³ ÷ 250 = 244.095 lb × 0.45359237 ≈ 110.7 kg.
  const expected = (61023.744 / 250) * 0.45359237;
  assert.ok(Math.abs(kg - expected) < 0.1, `got ${kg}, expected ~${expected.toFixed(1)}`);
});

test("ocean W/M bills 1 m³ as 1,000 kg", () => {
  const job = createEmptyJob();
  job.chargeableRuleId = "ocean-wm";
  const def = getEquipment("iso-20")!;
  const c = computeChargeable(job, def, [], 200, 1);
  assert.equal(c.basis, "volume");
  assert.ok(Math.abs(c.chargeableKg - 1000) < 0.5);
});

test("NMFC class follows density bands", () => {
  assert.equal(nmfcClassFromPcf(50), 50);
  assert.equal(nmfcClassFromPcf(15), 70);
  assert.equal(nmfcClassFromPcf(6), 150);
  assert.equal(nmfcClassFromPcf(1), 300);
  assert.equal(nmfcClassFromPcf(0.4), 400);
});

test("occupied LDM merges adjacent footprints", () => {
  const job = createEmptyJob();
  job.cargo = [
    piece({ id: "a", lengthMm: 1000, widthMm: 800, heightMm: 800, weightKg: 10 }),
    piece({ id: "b", lengthMm: 1000, widthMm: 800, heightMm: 800, weightKg: 10 }),
  ];
  const def = getEquipment("eu-cs-136")!;
  const placements: Placement[] = [
    { id: "1", pieceId: "a", instanceIndex: 0, roomId: "r", xMm: -500, yMm: 0, zMm: 0, rotY: 0 },
    { id: "2", pieceId: "b", instanceIndex: 0, roomId: "r", xMm: 500, yMm: 0, zMm: 0, rotY: 0 },
  ];
  const ldm = occupiedLdm(job, def, placements);
  assert.ok(Math.abs(ldm - 2) < 0.05, `merged ldm ${ldm}`);
});

test("typical tariff follows equipment region", () => {
  assert.equal(typicalRuleFor(getEquipment("eu-cs-136")!).id, "eu-ldm-1750");
  assert.equal(typicalRuleFor(getEquipment("us-53-van")!).id, "us-ltl-250");
  assert.equal(typicalRuleFor(getEquipment("uk-44t-136")!).id, "uk-road-330");
  assert.equal(typicalRuleFor(getEquipment("au-45-semi")!).id, "au-road-333");
  assert.equal(typicalRuleFor(getEquipment("iso-20")!).id, "ocean-wm");
  assert.equal(typicalRuleFor(getEquipment("uld-pmc")!).id, "iata-6000");
});

test("EU 13.6 curtainsider inner and pallet count match industry figures", () => {
  const eq = getEquipment("eu-cs-136")!;
  assert.equal(eq.family, "truck");
  assert.equal(eq.region, "EU");
  assert.equal(eq.innerLengthMm, 13620);
  assert.equal(eq.innerWidthMm, 2480);
  assert.equal(eq.innerHeightMm, 2700);
  assert.equal(eq.euroPallets, 33);
  assert.equal(eq.ldm, 13.6);
  assert.equal(eq.sideAccess, true);
});

test("US 53' van inner is ~52'6\" × 100\" × 110\"", () => {
  const eq = getEquipment("us-53-van")!;
  assert.equal(eq.family, "truck");
  assert.equal(eq.region, "US");
  assert.ok(Math.abs(eq.innerLengthMm - 16002) < 5, `L ${eq.innerLengthMm}`);
  assert.ok(Math.abs(eq.innerWidthMm - 2540) < 5, `W ${eq.innerWidthMm}`);
  assert.ok(Math.abs(eq.innerHeightMm - 2794) < 5, `H ${eq.innerHeightMm}`);
  assert.equal(eq.usPallets, 26);
});

test("curtainsider skips door fit; closed box does not", () => {
  const crate = piece({
    description: "Wide case",
    lengthMm: 3000,
    widthMm: 2500,
    heightMm: 2300,
    thisSideUp: true,
    notRotatable: true,
    floorOnly: true,
  });
  assert.equal(fitsThroughDoor(crate, getEquipment("eu-cs-136")!).ok, true);
  assert.equal(fitsThroughDoor(crate, getEquipment("eu-box-136")!).ok, false);
});

test("every equipment item has a region and a known family", () => {
  const families = new Set(["truck", "container", "flatrack", "uld", "aircraft"]);
  for (const eq of EQUIPMENT) {
    assert.ok(families.has(eq.family), eq.id);
    assert.ok(["EU", "UK", "US", "AU", "INTL"].includes(eq.region), eq.id);
    assert.ok(eq.innerLengthMm > 0 && eq.innerWidthMm > 0 && eq.innerHeightMm > 0, eq.id);
  }
  assert.ok(EQUIPMENT.filter((e) => e.family === "truck").length >= 20);
});

test("new jobs default to imperial units and an IATA chargeable rule", () => {
  const job = createEmptyJob();
  assert.equal(job.lengthUnit, "in");
  assert.equal(job.massUnit, "lb");
  assert.equal(job.chargeableRuleId, "iata-6000");
});
