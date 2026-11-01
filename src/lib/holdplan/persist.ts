import { getEquipment } from "./equipment.ts";
import { createDemoJob, DEMO_JOB_ID } from "./seed.ts";
import type { ChargeableRuleId, Job, JobStatus, JobSummary, LengthUnit, MassUnit, ShareRecord } from "./types.ts";

const DB = "holdplan";
const VERSION = 1;
const RULES: ChargeableRuleId[] = [
  "iata-6000",
  "express-5000",
  "eu-road-333",
  "eu-ldm-1750",
  "uk-road-330",
  "us-ltl-250",
  "us-nmfc",
  "ocean-wm",
  "au-road-333",
];

const STATUSES: JobStatus[] = ["draft", "quoted", "planned", "shared"];

/** Keep a stored ISO timestamp only when it parses; otherwise fall back. */
function isoOr(value: unknown, fallback: string): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("jobs")) db.createObjectStore("jobs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("shares")) db.createObjectStore("shares", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function normalizeJob(raw: Job): Job {
  const lengthUnit: LengthUnit = raw.lengthUnit === "mm" || raw.lengthUnit === "in" ? raw.lengthUnit : "in";
  const massUnit: MassUnit = raw.massUnit === "kg" || raw.massUnit === "lb" ? raw.massUnit : "lb";
  const chargeableRuleId: ChargeableRuleId = RULES.includes(raw.chargeableRuleId)
    ? raw.chargeableRuleId
    : "iata-6000";
  const rooms = (raw.rooms ?? []).filter((r) => getEquipment(r.equipmentId));
  const roomIds = new Set(rooms.map((r) => r.id));
  const now = new Date().toISOString();
  return {
    ...raw,
    reference: typeof raw.reference === "string" ? raw.reference : "",
    customer: typeof raw.customer === "string" ? raw.customer : "",
    status: STATUSES.includes(raw.status) ? raw.status : "draft",
    createdAt: isoOr(raw.createdAt, now),
    updatedAt: isoOr(raw.updatedAt, now),
    lastOpenedAt: isoOr(raw.lastOpenedAt, now),
    lengthUnit,
    massUnit,
    chargeableRuleId,
    rooms,
    cargo: raw.cargo ?? [],
    placements: (raw.placements ?? []).filter((p) => roomIds.has(p.roomId)),
    keepAisle: Boolean(raw.keepAisle),
    revision: raw.revision ?? 1,
  };
}

function demoNeedsRefresh(existing: Job | undefined): boolean {
  if (!existing) return true;
  if (!existing.placements?.length) return true;
  if (!existing.chargeableRuleId) return true;
  return !existing.rooms.some((r) => getEquipment(r.equipmentId)?.family === "truck");
}

export async function listJobs(): Promise<JobSummary[]> {
  const db = await openDb();
  const jobs = await new Promise<Job[]>((resolve, reject) => {
    const req = db.transaction("jobs").objectStore("jobs").getAll();
    req.onsuccess = () => resolve((req.result as Job[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return jobs
    .map((j) => normalizeJob(j))
    .map((j) => ({
      id: j.id,
      reference: j.reference,
      customer: j.customer,
      status: j.status,
      updatedAt: j.updatedAt,
      lastOpenedAt: j.lastOpenedAt,
      roomCount: j.rooms.length,
      pieceCount: j.cargo.reduce((s, c) => s + Math.max(1, c.quantity), 0),
    }))
    .sort((a, b) => (a.lastOpenedAt < b.lastOpenedAt ? 1 : -1));
}

export async function getJob(id: string): Promise<Job | undefined> {
  const db = await openDb();
  const job = await new Promise<Job | undefined>((resolve, reject) => {
    const req = db.transaction("jobs").objectStore("jobs").get(id);
    req.onsuccess = () => resolve(req.result as Job | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return job ? normalizeJob(job) : undefined;
}

export async function saveJob(job: Job): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("jobs", "readwrite");
  tx.objectStore("jobs").put({ ...normalizeJob(job), updatedAt: new Date().toISOString() });
  await txDone(tx);
  db.close();
}

export async function deleteJob(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("jobs", "readwrite");
  tx.objectStore("jobs").delete(id);
  await txDone(tx);
  db.close();
}

export async function ensureSeed(): Promise<void> {
  const db = await openDb();
  const existing = await new Promise<Job | undefined>((resolve, reject) => {
    const req = db.transaction("jobs").objectStore("jobs").get(DEMO_JOB_ID);
    req.onsuccess = () => resolve(req.result as Job | undefined);
    req.onerror = () => reject(req.error);
  });
  if (demoNeedsRefresh(existing)) {
    const tx = db.transaction("jobs", "readwrite");
    tx.objectStore("jobs").put(createDemoJob());
    await txDone(tx);
  }
  db.close();
}

export async function saveShare(record: ShareRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("shares", "readwrite");
  tx.objectStore("shares").put({ ...record, job: normalizeJob(record.job) });
  await txDone(tx);
  db.close();
}

export async function getShare(id: string): Promise<ShareRecord | undefined> {
  const db = await openDb();
  const rec = await new Promise<ShareRecord | undefined>((resolve, reject) => {
    const req = db.transaction("shares").objectStore("shares").get(id);
    req.onsuccess = () => resolve(req.result as ShareRecord | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  if (!rec) return undefined;
  return { ...rec, job: normalizeJob(rec.job) };
}

export function toSummary(job: Job): JobSummary {
  return {
    id: job.id,
    reference: job.reference,
    customer: job.customer,
    status: job.status,
    updatedAt: job.updatedAt,
    lastOpenedAt: job.lastOpenedAt,
    roomCount: job.rooms.length,
    pieceCount: job.cargo.reduce((s, c) => s + Math.max(1, c.quantity), 0),
  };
}
