import Papa from "papaparse";
import { defaultPieceColor } from "./seed.ts";
import { newId } from "./ids.ts";
import type { CargoPiece, Job, LengthUnit, MassUnit } from "./types.ts";
import { displayToKg, displayToMm, kgToDisplay, mmToDisplay } from "./units.ts";

const HEADER_ALIASES: Record<string, keyof MappedRow> = {
  description: "description",
  desc: "description",
  item: "description",
  name: "description",
  qty: "qty",
  quantity: "qty",
  q: "qty",
  l: "length",
  length: "length",
  length_mm: "length",
  "length (mm)": "length",
  "length (in)": "length",
  length_in: "length",
  "width (mm)": "width",
  "width (in)": "width",
  width_in: "width",
  "height (mm)": "height",
  "height (in)": "height",
  height_in: "height",
  lb: "weight",
  lbs: "weight",
  "weight (lb)": "weight",
  "weight (kg)": "weight",
  w: "width",
  width: "width",
  width_mm: "width",
  h: "height",
  height: "height",
  height_mm: "height",
  weight: "weight",
  wt: "weight",
  kg: "weight",
  mass: "weight",
  stackable: "stackable",
  stack: "stackable",
  notes: "notes",
  note: "notes",
  dgr: "dgr",
  shape: "shape",
};

interface MappedRow {
  description: string;
  qty: string;
  length: string;
  width: string;
  height: string;
  weight: string;
  stackable: string;
  notes: string;
  dgr: string;
  shape: string;
}

export interface ColumnGuess {
  headers: string[];
  rows: string[][];
  mapping: Partial<Record<keyof MappedRow, number>>;
}

export function parseSpreadsheet(text: string): ColumnGuess {
  const firstLine = (text.split(/\r?\n/).find((l) => l.trim()) ?? "").replace(/^\uFEFF/, "");
  const count = (re: RegExp) => (firstLine.match(re) ?? []).length;
  const commas = count(/,/g);
  const tabs = count(/\t/g);
  const semis = count(/;/g);
  const delimiter = tabs > commas && tabs >= semis ? "\t" : semis > commas ? ";" : ",";
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: true, delimiter });
  const data = (parsed.data ?? []).filter((r) => r.some((c) => String(c).trim() !== ""));
  if (data.length === 0) return { headers: [], rows: [], mapping: {} };
  const headers = data[0]!.map((h) => String(h).replace(/^\uFEFF/, "").trim());
  const rows = data.slice(1);
  const mapping: ColumnGuess["mapping"] = {};
  headers.forEach((h, i) => {
    const key = HEADER_ALIASES[h.toLowerCase().replace(/\s+/g, " ")];
    if (key && mapping[key] == null) mapping[key] = i;
  });
  return { headers, rows, mapping };
}

function truthy(v: string): boolean {
  return /^(1|y|yes|true|stack|stackable)$/i.test(v.trim());
}

export function rowsToCargo(
  guess: ColumnGuess,
  mapping: ColumnGuess["mapping"],
  lengthUnit: LengthUnit,
  massUnit: MassUnit,
): CargoPiece[] {
  const cargo: CargoPiece[] = [];
  guess.rows.forEach((row, idx) => {
    const g = (k: keyof MappedRow) => {
      const i = mapping[k];
      return i == null ? "" : String(row[i] ?? "").trim();
    };
    const description = g("description") || `Piece ${idx + 1}`;
    const qty = Math.max(1, Math.round(Number(g("qty") || "1")) || 1);
    const lengthMm = displayToMm(Number(g("length") || "0") || 0, lengthUnit);
    const widthMm = displayToMm(Number(g("width") || "0") || 0, lengthUnit);
    const heightMm = displayToMm(Number(g("height") || "0") || 0, lengthUnit);
    const weightKg = displayToKg(Number(g("weight") || "0") || 0, massUnit);
    if (lengthMm <= 0 || widthMm <= 0 || heightMm <= 0 || weightKg <= 0) return;
    const shapeRaw = g("shape").toLowerCase();
    const shape: CargoPiece["shape"] =
      shapeRaw.includes("cyl") ? "cylinder" : shapeRaw.includes("l-") || shapeRaw === "l" ? "L-shape" : "box";
    cargo.push({
      id: newId("cg"),
      description,
      lengthMm,
      widthMm,
      heightMm,
      weightKg,
      quantity: qty,
      shape,
      stackable: truthy(g("stackable")),
      thisSideUp: true,
      floorOnly: false,
      notRotatable: false,
      dgr: truthy(g("dgr")),
      cgOffsetMm: { x: 0, y: 0, z: 0 },
      color: defaultPieceColor(idx),
      source: "excel",
      notes: g("notes"),
    });
  });
  return cargo;
}

export function packingListTemplate(): string {
  return [
    "description,qty,length,width,height,weight,stackable,notes",
    "Rotor case,1,4200,2200,2100,6800,no,floor-only",
    "Control cabinet,4,1200,800,1600,380,yes,",
    "Spare crate,12,800,600,600,90,yes,",
    "Shaft cylinder,1,3000,900,900,1100,no,Ø900",
  ].join("\n");
}

export function exportPlacementsCsv(job: Job): string {
  const lu = job.lengthUnit;
  const mu = job.massUnit;
  const header = ["piece", "instance", "room", `x_${lu}`, `y_${lu}`, `z_${lu}`, "rot_y_deg", `weight_${mu}`];
  const rows = job.placements.map((p) => {
    const piece = job.cargo.find((c) => c.id === p.pieceId);
    const room = job.rooms.find((r) => r.id === p.roomId);
    return [
      piece?.description ?? p.pieceId,
      String(p.instanceIndex + 1),
      room?.name ?? p.roomId,
      String(Number(mmToDisplay(p.xMm, lu).toFixed(2))),
      String(Number(mmToDisplay(p.yMm, lu).toFixed(2))),
      String(Number(mmToDisplay(p.zMm, lu).toFixed(2))),
      String(p.rotY),
      String(Number(kgToDisplay(piece?.weightKg ?? 0, mu).toFixed(2))),
    ];
  });
  return Papa.unparse([header, ...rows]);
}

export function exportCargoCsv(job: Job): string {
  const lu = job.lengthUnit;
  const mu = job.massUnit;
  const header = ["description", "qty", "length", "width", "height", "weight", "stackable", "notes"];
  const rows = job.cargo.map((c) => [
    c.description,
    String(c.quantity),
    String(mmToDisplay(c.lengthMm, lu)),
    String(mmToDisplay(c.widthMm, lu)),
    String(mmToDisplay(c.heightMm, lu)),
    String(kgToDisplay(c.weightKg, mu)),
    c.stackable ? "yes" : "no",
    c.notes ?? "",
  ]);
  return Papa.unparse([header, ...rows]);
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
