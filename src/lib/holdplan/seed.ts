import { suggestLayout } from "./packer.ts";
import { newId } from "./ids.ts";
import type { CargoPiece, Job } from "./types.ts";

const now = () => new Date().toISOString();

function piece(partial: Omit<CargoPiece, "id" | "source" | "cgOffsetMm"> & { id?: string }): CargoPiece {
  return {
    source: "manual",
    cgOffsetMm: { x: 0, y: 0, z: 0 },
    notes: "",
    ...partial,
    id: partial.id ?? newId("cg"),
  };
}

export const DEMO_JOB_ID = "job_demo_turbine_zrh";

export function createEmptyJob(reference = "New job"): Job {
  const t = now();
  return {
    id: newId("job"),
    reference,
    customer: "",
    incoterms: "",
    notes: "",
    status: "draft",
    createdAt: t,
    updatedAt: t,
    lastOpenedAt: t,
    lengthUnit: "in",
    massUnit: "lb",
    chargeableRuleId: "iata-6000",
    cargo: [],
    rooms: [],
    placements: [],
    revision: 1,
    keepAisle: false,
  };
}

export function createDemoJob(): Job {
  const t = now();
  const rotor = piece({
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
    color: "#6b7c8a",
    label: "ROTOR",
    customer: "Helvetia Power",
    stackGroup: "heavy",
    notes: "Floor-only. Do not roll. This-side-up.",
  });
  const cabinet = piece({
    id: "cg_cab",
    description: "Control cabinet",
    lengthMm: 1200,
    widthMm: 800,
    heightMm: 1600,
    weightKg: 380,
    quantity: 4,
    shape: "box",
    stackable: true,
    maxStackWeightKg: 400,
    thisSideUp: true,
    floorOnly: false,
    notRotatable: false,
    dgr: false,
    color: "#3d6b72",
    label: "CAB",
    customer: "Helvetia Power",
    stackGroup: "cabinets",
  });
  const crate = piece({
    id: "cg_spare",
    description: "Spare crate",
    lengthMm: 800,
    widthMm: 600,
    heightMm: 600,
    weightKg: 90,
    quantity: 12,
    shape: "box",
    stackable: true,
    maxStackWeightKg: 400,
    thisSideUp: false,
    floorOnly: false,
    notRotatable: false,
    dgr: false,
    color: "#8a7348",
    label: "SPARE",
    customer: "Helvetia Power",
    stackGroup: "spares",
  });
  const cylinder = piece({
    id: "cg_cyl",
    description: "Shaft cylinder Ø900",
    lengthMm: 3000,
    widthMm: 900,
    heightMm: 900,
    weightKg: 1100,
    quantity: 1,
    shape: "cylinder",
    stackable: false,
    thisSideUp: false,
    floorOnly: true,
    notRotatable: false,
    dgr: false,
    color: "#b07a3a",
    label: "SHAFT",
    customer: "Helvetia Power",
    stackGroup: "heavy",
  });

  const job: Job = {
    id: DEMO_JOB_ID,
    reference: "Turbine rotor – ZRH charter",
    customer: "Helvetia Power",
    incoterms: "EXW Winterthur",
    notes:
      "Demo job. Same cargo on a PMC, 777F main deck, 40' flatrack, EU 13.6 curtainsider, and US 53' dry van. Toggle in·lb / mm·kg and the chargeable rule (IATA, EU LDM, US DIM) in the header. Planning aid only — not certified W&B.",
    status: "planned",
    createdAt: t,
    updatedAt: t,
    lastOpenedAt: t,
    lengthUnit: "in",
    massUnit: "lb",
    chargeableRuleId: "iata-6000",
    cargo: [rotor, cabinet, crate, cylinder],
    rooms: [
      { id: "rm_pmc", equipmentId: "uld-pmc", name: "PMC + net" },
      { id: "rm_777", equipmentId: "ac-777f", name: "777F main deck" },
      { id: "rm_fr", equipmentId: "fr-40", name: "40' flatrack" },
      { id: "rm_eucs", equipmentId: "eu-cs-136", name: "EU 13.6 CS" },
      { id: "rm_us53", equipmentId: "us-53-van", name: "US 53' van" },
    ],
    placements: [],
    revision: 1,
    keepAisle: true,
  };

  const pmc = suggestLayout(job, "rm_pmc", 100, true);
  const withPmc = { ...job, placements: pmc.placements };
  const f77 = suggestLayout(withPmc, "rm_777", 100, true);
  const with777 = { ...withPmc, placements: f77.placements };
  const fr = suggestLayout(with777, "rm_fr", 100, false);
  const withFr = { ...with777, placements: fr.placements };
  const eu = suggestLayout(withFr, "rm_eucs", 100, false);
  const withEu = { ...withFr, placements: eu.placements };
  const us = suggestLayout(withEu, "rm_us53", 100, false);
  return { ...withEu, placements: us.placements };
}

export function defaultPieceColor(index: number): string {
  const palette = ["#6b7c8a", "#3d6b72", "#8a7348", "#7a5b6e", "#4d6a4e", "#6a5a3a", "#4a5e78"];
  return palette[index % palette.length]!;
}
