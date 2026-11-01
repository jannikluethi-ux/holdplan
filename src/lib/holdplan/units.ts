import type { EquipmentDef, LengthUnit, MassUnit, SnapMm, UnitSystem } from "./types.ts";

const MM_PER_IN = 25.4;
const KG_PER_LB = 0.45359237;
const M3_PER_FT3 = 1 / 35.3146667;

export function unitSystemOf(length: LengthUnit, mass: MassUnit): UnitSystem {
  return length === "in" || mass === "lb" ? "imperial" : "metric";
}

export function unitsForSystem(system: UnitSystem): { lengthUnit: LengthUnit; massUnit: MassUnit } {
  return system === "imperial" ? { lengthUnit: "in", massUnit: "lb" } : { lengthUnit: "mm", massUnit: "kg" };
}

export function mmToDisplay(mm: number, unit: LengthUnit): number {
  return unit === "in" ? mm / MM_PER_IN : mm;
}

export function displayToMm(value: number, unit: LengthUnit): number {
  return unit === "in" ? value * MM_PER_IN : value;
}

export function kgToDisplay(kg: number, unit: MassUnit): number {
  return unit === "lb" ? kg / KG_PER_LB : kg;
}

export function displayToKg(value: number, unit: MassUnit): number {
  return unit === "lb" ? value * KG_PER_LB : value;
}

export function formatMm(mm: number, unit: LengthUnit, digits = 0): string {
  const sign = mm < 0 ? "−" : "";
  const abs = Math.abs(mm);
  if (unit === "in") {
    const inches = abs / MM_PER_IN;
    if (inches >= 36) {
      const whole = Math.round(inches);
      let ft = Math.floor(whole / 12);
      let inn = whole - ft * 12;
      if (inn === 12) {
        ft += 1;
        inn = 0;
      }
      return `${sign}${ft}' ${inn}"`;
    }
    return `${sign}${inches.toFixed(Math.max(digits, 1))} in`;
  }
  return `${sign}${abs.toFixed(digits)} mm`;
}

export function formatKg(kg: number, unit: MassUnit, digits = 0): string {
  const v = kgToDisplay(kg, unit);
  return `${v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${unit}`;
}

export function formatDims(l: number, w: number, h: number, unit: LengthUnit): string {
  if (unit === "in") {
    return `${formatMm(l, "in")} × ${formatMm(w, "in")} × ${formatMm(h, "in")}`;
  }
  const f = (n: number) => n.toFixed(0);
  return `${f(l)} × ${f(w)} × ${f(h)} mm`;
}

export function formatInner(def: EquipmentDef, unit: LengthUnit): string {
  return formatDims(def.innerLengthMm, def.innerWidthMm, def.innerHeightMm, unit);
}

export function formatVolume(m3: number, system: UnitSystem): string {
  if (system === "imperial") {
    return `${(m3 / M3_PER_FT3).toFixed(0)} ft³`;
  }
  return `${m3.toFixed(1)} m³`;
}

export function formatFloor(kgM2: number, system: UnitSystem): string {
  if (system === "imperial") {
    return `${(kgM2 * 0.204816).toFixed(0)} psf`;
  }
  return `${kgM2.toFixed(0)} kg/m²`;
}

export function equipmentStatsLine(eq: EquipmentDef, length: LengthUnit, mass: MassUnit): string {
  const bits = [formatInner(eq, length), formatKg(eq.maxPayloadKg, mass)];
  if (eq.euroPallets) bits.push(`${eq.euroPallets} EUR`);
  if (eq.usPallets) bits.push(`${eq.usPallets} GMA`);
  if (eq.ldm) bits.push(`${eq.ldm} LDM`);
  return bits.join(" · ");
}

export function snapLabel(snapMm: SnapMm, system: UnitSystem): string {
  if (system === "imperial") {
    if (snapMm === 25) return '1"';
    if (snapMm === 50) return '2"';
    if (snapMm === 100) return '4"';
    return `${(snapMm / MM_PER_IN).toFixed(1)}"`;
  }
  return `${snapMm} mm`;
}

export function snapOptions(system: UnitSystem): SnapMm[] {
  return system === "imperial" ? [25, 50, 100] : [10, 50, 100];
}

export function lengthUnitLabel(unit: LengthUnit): string {
  return unit;
}

export function massUnitLabel(unit: MassUnit): string {
  return unit;
}
