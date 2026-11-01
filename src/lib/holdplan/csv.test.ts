import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSpreadsheet, rowsToCargo } from "./csv.ts";

test("import: valid CSV rows create the right qty, mm, and kg", () => {
  const text = [
    "description,qty,length,width,height,weight",
    "Rotor case,1,4200,2200,2100,6800",
    "Control cabinet,4,1200,800,1600,380",
  ].join("\n");
  const guess = parseSpreadsheet(text);
  const cargo = rowsToCargo(guess, guess.mapping, "mm", "kg");
  assert.equal(cargo.length, 2, "two valid rows should become two pieces");
  const rotor = cargo.find((c) => c.description === "Rotor case");
  const cab = cargo.find((c) => c.description === "Control cabinet");
  assert.ok(rotor, "Rotor case row should import");
  assert.equal(rotor.quantity, 1, "qty 1");
  assert.equal(rotor.lengthMm, 4200, "length mm");
  assert.equal(rotor.widthMm, 2200, "width mm");
  assert.equal(rotor.heightMm, 2100, "height mm");
  assert.equal(rotor.weightKg, 6800, "weight kg");
  assert.ok(cab, "Control cabinet row should import");
  assert.equal(cab.quantity, 4, "qty 4");
  assert.equal(cab.weightKg, 380, "cabinet weight kg");
});

test("import: imperial columns convert to internal mm and kg", () => {
  const text = ["description,qty,length,width,height,weight", "Crate,2,48,24,24,220"].join("\n");
  const guess = parseSpreadsheet(text);
  const cargo = rowsToCargo(guess, guess.mapping, "in", "lb");
  assert.equal(cargo.length, 1);
  assert.equal(cargo[0]!.quantity, 2);
  assert.ok(Math.abs(cargo[0]!.lengthMm - 48 * 25.4) < 0.2, `48 in → mm, got ${cargo[0]!.lengthMm}`);
  assert.ok(Math.abs(cargo[0]!.weightKg - 220 * 0.45359237) < 0.05, `220 lb → kg, got ${cargo[0]!.weightKg}`);
});

test("import: bad rows (missing L or weight) are skipped and do not crash", () => {
  const text = [
    "description,qty,length,width,height,weight",
    "Good,1,1000,800,600,90",
    "Missing length,1,,800,600,90",
    "Missing weight,1,1000,800,600,",
    "Zero weight,1,1000,800,600,0",
  ].join("\n");
  const guess = parseSpreadsheet(text);
  const cargo = rowsToCargo(guess, guess.mapping, "mm", "kg");
  assert.equal(cargo.length, 1, "only the complete row should import");
  assert.equal(cargo[0]!.description, "Good");
  assert.equal(cargo[0]!.weightKg, 90);
});

test("import: QA 5-line packing list becomes five pieces with qty respected", () => {
  const text = [
    "description,qty,length,width,height,weight,stackable",
    "Crate A,2,800,600,600,90,yes",
    "Crate B,1,1200,800,1000,250,yes",
    "Cabinet,1,1000,800,1600,380,yes",
    "Pipe,1,2000,400,400,120,no",
    "Pallet,1,1200,1000,150,80,yes",
  ].join("\n");
  const guess = parseSpreadsheet(text);
  const cargo = rowsToCargo(guess, guess.mapping, "mm", "kg");
  assert.equal(cargo.length, 5, "five data rows should become five cargo lines");
  const a = cargo.find((c) => c.description === "Crate A");
  assert.ok(a, "Crate A should import");
  assert.equal(a.quantity, 2, "qty on Crate A is respected");
  assert.equal(a.lengthMm, 800);
  assert.equal(a.weightKg, 90);
  assert.equal(a.stackable, true);
  const pipe = cargo.find((c) => c.description === "Pipe");
  assert.equal(pipe?.stackable, false);
});

test("import: Excel-like tab-separated paste maps columns and qty", () => {
  const text = ["description\tqty\tlength\twidth\theight\tweight", "Crate A\t2\t800\t600\t600\t90"].join("\n");
  const guess = parseSpreadsheet(text);
  const cargo = rowsToCargo(guess, guess.mapping, "mm", "kg");
  assert.equal(cargo.length, 1, "TSV row should import");
  assert.equal(cargo[0]!.description, "Crate A");
  assert.equal(cargo[0]!.quantity, 2);
  assert.equal(cargo[0]!.lengthMm, 800);
  assert.equal(cargo[0]!.weightKg, 90);
});

test("import: EU semicolon CSV and a UTF-8 BOM still map length and weight", () => {
  const text = "\uFEFFdescription;qty;length;width;height;weight\nCrate;1;1000;800;600;90";
  const guess = parseSpreadsheet(text);
  const cargo = rowsToCargo(guess, guess.mapping, "mm", "kg");
  assert.equal(cargo.length, 1, "semicolon CSV with BOM should import");
  assert.equal(cargo[0]!.description, "Crate");
  assert.equal(cargo[0]!.lengthMm, 1000);
  assert.equal(cargo[0]!.weightKg, 90);
});

test("import: spaced unit-annotated width/height headers map", () => {
  const text = [
    "description,qty,length (mm),width (mm),height (mm),weight (kg)",
    "Crate,1,1000,800,600,90",
  ].join("\n");
  const guess = parseSpreadsheet(text);
  const cargo = rowsToCargo(guess, guess.mapping, "mm", "kg");
  assert.equal(cargo.length, 1, "annotated header row should import");
  assert.equal(cargo[0]!.lengthMm, 1000);
  assert.equal(cargo[0]!.widthMm, 800);
  assert.equal(cargo[0]!.heightMm, 600);
  assert.equal(cargo[0]!.weightKg, 90);
});
