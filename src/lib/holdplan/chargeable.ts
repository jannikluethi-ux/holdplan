import { placementAabb } from "./geometry.ts";
import type { CargoPiece, ChargeableRuleId, EquipmentDef, Job, MassUnit, Placement } from "./types.ts";
import { formatKg } from "./units.ts";

export type ChargeableKind = "dim" | "ldm" | "wm" | "nmfc";

export interface ChargeableRule {
  id: ChargeableRuleId;
  name: string;
  shortName: string;
  regionLabel: string;
  mode: "air" | "road" | "ocean";
  kind: ChargeableKind;
  description: string;
  divisorCm3PerKg?: number;
  divisorIn3PerLb?: number;
  kgPerM3?: number;
  kgPerLdm?: number;
}

export const CHARGEABLE_RULES: ChargeableRule[] = [
  {
    id: "iata-6000",
    name: "IATA air 1:6000",
    shortName: "IATA 6000",
    regionLabel: "IATA",
    mode: "air",
    kind: "dim",
    description: "International airfreight. Volumetric kg = L×W×H cm ÷ 6,000 (in³ ÷ 166). 1 m³ ≈ 167 kg.",
    divisorCm3PerKg: 6000,
    divisorIn3PerLb: 166,
    kgPerM3: 166.6667,
  },
  {
    id: "express-5000",
    name: "Express courier 1:5000",
    shortName: "Express 5000",
    regionLabel: "INTL",
    mode: "air",
    kind: "dim",
    description: "DHL / UPS / FedEx international. L×W×H cm ÷ 5,000 (in³ ÷ 139). 1 m³ = 200 kg.",
    divisorCm3PerKg: 5000,
    divisorIn3PerLb: 139,
    kgPerM3: 200,
  },
  {
    id: "eu-road-333",
    name: "EU groupage 1 m³ = 333 kg",
    shortName: "EU 1:333",
    regionLabel: "EU",
    mode: "road",
    kind: "dim",
    description: "Common EU / CH / DE LTL groupage. Chargeable = max(actual kg, m³ × 333).",
    kgPerM3: 333,
    divisorCm3PerKg: 3003,
  },
  {
    id: "eu-ldm-1750",
    name: "EU loading metre (1 LDM = 1,750 kg)",
    shortName: "EU LDM",
    regionLabel: "EU",
    mode: "road",
    kind: "ldm",
    description: "Floor-length tariff: 1 loading metre ≈ 1,750 kg. A 13.6 m trailer is 13.6 LDM. EUR pallet 800 mm = 0.4 LDM.",
    kgPerLdm: 1750,
  },
  {
    id: "uk-road-330",
    name: "UK road 1 m³ = 330 kg",
    shortName: "UK 1:330",
    regionLabel: "UK",
    mode: "road",
    kind: "dim",
    description: "UK groupage / pallet-network style. Chargeable = max(actual kg, m³ × 330).",
    kgPerM3: 330,
  },
  {
    id: "us-ltl-250",
    name: "US LTL DIM ÷ 250",
    shortName: "US DIM 250",
    regionLabel: "US",
    mode: "road",
    kind: "dim",
    description: "US LTL dimensional weight: L×W×H in ÷ 250 = lb. Chargeable = max(actual, DIM).",
    divisorIn3PerLb: 250,
  },
  {
    id: "us-nmfc",
    name: "US NMFC density / class",
    shortName: "US NMFC",
    regionLabel: "US",
    mode: "road",
    kind: "nmfc",
    description: "National Motor Freight Classification from density (lb/ft³). Class sets the rate; billed weight is still actual unless the carrier applies DIM.",
  },
  {
    id: "ocean-wm",
    name: "Ocean LCL W/M (1 cbm = 1 t)",
    shortName: "Ocean W/M",
    regionLabel: "INTL",
    mode: "ocean",
    kind: "wm",
    description: "Sea LCL weight-or-measure: chargeable = max(metric tonnes, cubic metres), i.e. 1 m³ = 1,000 kg.",
    kgPerM3: 1000,
  },
  {
    id: "au-road-333",
    name: "AU road 1 m³ = 333 kg",
    shortName: "AU 1:333",
    regionLabel: "AU",
    mode: "road",
    kind: "dim",
    description: "Australian road / tautliner groupage. Chargeable = max(actual kg, m³ × 333).",
    kgPerM3: 333,
  },
];

const BY_ID = new Map(CHARGEABLE_RULES.map((r) => [r.id, r]));

export function getChargeableRule(id: ChargeableRuleId | undefined): ChargeableRule {
  return BY_ID.get(id ?? "iata-6000") ?? CHARGEABLE_RULES[0]!;
}

/** Typical tariff for this equipment — a hint, not auto-applied. */
export function typicalRuleFor(def: EquipmentDef): ChargeableRule {
  if (def.family === "truck") {
    if (def.region === "US") return getChargeableRule("us-ltl-250");
    if (def.region === "UK") return getChargeableRule("uk-road-330");
    if (def.region === "AU") return getChargeableRule("au-road-333");
    return getChargeableRule("eu-ldm-1750");
  }
  if (def.family === "container" || def.family === "flatrack") return getChargeableRule("ocean-wm");
  return getChargeableRule("iata-6000");
}

export function boxVolumeM3(lMm: number, wMm: number, hMm: number): number {
  return (lMm * wMm * hMm) / 1e9;
}

/** Carriers bill the bounding box, not the mesh volume. */
export function pieceBoxVolumeM3(piece: CargoPiece): number {
  return boxVolumeM3(piece.lengthMm, piece.widthMm, piece.heightMm) * Math.max(1, piece.quantity);
}

export function volumetricKgForVolume(volumeM3: number, rule: ChargeableRule): number {
  if (rule.kgPerM3) return volumeM3 * rule.kgPerM3;
  if (rule.divisorCm3PerKg) return (volumeM3 * 1e6) / rule.divisorCm3PerKg;
  if (rule.divisorIn3PerLb) {
    const in3 = volumeM3 * 61023.744;
    const lb = in3 / rule.divisorIn3PerLb;
    return lb * 0.45359237;
  }
  return 0;
}

export function pieceVolumetricKg(piece: CargoPiece, rule: ChargeableRule): number {
  return volumetricKgForVolume(pieceBoxVolumeM3(piece), rule);
}

export function nmfcClassFromPcf(pcf: number): number {
  if (!Number.isFinite(pcf) || pcf <= 0) return 500;
  if (pcf >= 50) return 50;
  if (pcf >= 35) return 55;
  if (pcf >= 30) return 60;
  if (pcf >= 22.5) return 65;
  if (pcf >= 15) return 70;
  if (pcf >= 13.5) return 77.5;
  if (pcf >= 12) return 85;
  if (pcf >= 10.5) return 92.5;
  if (pcf >= 9) return 100;
  if (pcf >= 8) return 110;
  if (pcf >= 7) return 125;
  if (pcf >= 6) return 150;
  if (pcf >= 4) return 175;
  if (pcf >= 2) return 250;
  if (pcf >= 1) return 300;
  return 400;
}

export function densityPcf(weightKg: number, volumeM3: number): number {
  if (volumeM3 <= 1e-9) return 0;
  const lb = weightKg / 0.45359237;
  const ft3 = volumeM3 * 35.3146667;
  return lb / ft3;
}

/** Occupied loading metres along the vehicle long axis (merged footprints). */
export function occupiedLdm(job: Job, def: EquipmentDef, placements: Placement[]): number {
  const spans: Array<[number, number]> = [];
  for (const p of placements) {
    const piece = job.cargo.find((c) => c.id === p.pieceId);
    if (!piece) continue;
    const a = placementAabb(piece, p);
    spans.push([a.minX, a.maxX]);
  }
  if (spans.length === 0) return 0;
  spans.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [spans[0]!];
  for (let i = 1; i < spans.length; i++) {
    const cur = spans[i]!;
    const last = merged[merged.length - 1]!;
    if (cur[0] <= last[1] + 20) last[1] = Math.max(last[1], cur[1]);
    else merged.push(cur);
  }
  const mm = merged.reduce((s, [a, b]) => s + (b - a), 0);
  return Math.min(mm / 1000, def.innerLengthMm / 1000);
}

export interface ChargeableBreakdown {
  rule: ChargeableRule;
  actualKg: number;
  volumeM3: number;
  volumetricKg: number;
  ldm: number;
  ldmMax: number;
  ldmKg: number;
  chargeableKg: number;
  basis: "actual" | "volume" | "ldm";
  densityKgM3: number;
  densityPcf: number;
  nmfcClass: number | null;
}

export function computeChargeable(
  job: Job,
  def: EquipmentDef,
  placements: Placement[],
  actualKg: number,
  volumeM3: number,
): ChargeableBreakdown {
  const rule = getChargeableRule(job.chargeableRuleId);
  const volumetricKg = volumetricKgForVolume(volumeM3, rule);
  const ldm = occupiedLdm(job, def, placements);
  const ldmMax = def.ldm ?? def.innerLengthMm / 1000;
  const ldmKg = (rule.kgPerLdm ?? 1750) * ldm;
  const densityKgM3 = volumeM3 > 1e-9 ? actualKg / volumeM3 : 0;
  const pcf = densityPcf(actualKg, volumeM3);
  const nmfcClass = rule.kind === "nmfc" ? nmfcClassFromPcf(pcf) : null;

  let chargeableKg = actualKg;
  let basis: ChargeableBreakdown["basis"] = "actual";
  if (rule.kind === "ldm") {
    if (ldmKg > chargeableKg) {
      chargeableKg = ldmKg;
      basis = "ldm";
    }
  } else if (rule.kind === "nmfc") {
    chargeableKg = actualKg;
    basis = "actual";
  } else if (volumetricKg > actualKg + 0.05) {
    chargeableKg = volumetricKg;
    basis = "volume";
  }

  return {
    rule,
    actualKg,
    volumeM3,
    volumetricKg,
    ldm,
    ldmMax,
    ldmKg,
    chargeableKg,
    basis,
    densityKgM3,
    densityPcf: pcf,
    nmfcClass,
  };
}

export function formatChargeable(c: ChargeableBreakdown, mass: MassUnit): string {
  const ch = formatKg(c.chargeableKg, mass);
  if (c.rule.kind === "nmfc") {
    return `class ${c.nmfcClass ?? "—"} · ${c.densityPcf.toFixed(1)} pcf`;
  }
  if (c.rule.kind === "ldm") {
    return `${c.ldm.toFixed(2)}/${c.ldmMax.toFixed(1)} LDM · ${ch}`;
  }
  if (c.basis === "volume") return `${ch} vol`;
  return `${ch} actual`;
}
