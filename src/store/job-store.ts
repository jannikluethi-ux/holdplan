import { useMemo } from "react";
import { create } from "zustand";
import { requireEquipment } from "@/lib/holdplan/equipment";
import { nextRotation, snapTo } from "@/lib/holdplan/geometry";
import { newId } from "@/lib/holdplan/ids";
import { computeMetrics, type RoomMetrics } from "@/lib/holdplan/metrics";
import { suggestLayout } from "@/lib/holdplan/packer";
import { deleteJob, ensureSeed, getJob, listJobs, saveJob, saveShare } from "@/lib/holdplan/persist";
import { createEmptyJob } from "@/lib/holdplan/seed";
import { snapOptions, unitsForSystem } from "@/lib/holdplan/units";
import type {
  CameraMode,
  CargoPiece,
  ColorMode,
  Job,
  JobStatus,
  JobSummary,
  PackFailure,
  Placement,
  RotY,
  SnapMm,
  UnitSystem,
  WallMode,
} from "@/lib/holdplan/types";
import { validateRoom } from "@/lib/holdplan/validation";

const HISTORY_MAX = 60;

export type CaptureFn = () => Promise<{ iso: string; top: string }>;

interface JobStore {
  ready: boolean;
  summaries: JobSummary[];
  job: Job | null;
  activeRoomId: string | null;
  selectedPlacementId: string | null;
  selectedPieceId: string | null;
  snapMm: SnapMm;
  wallMode: WallMode;
  colorMode: ColorMode;
  cameraMode: CameraMode;
  sequenceIndex: number | null;
  packFailures: PackFailure[];
  ghost: Placement | null;
  draggingId: string | null;
  past: Job[];
  future: Job[];
  capture: CaptureFn | null;
  bootstrap: () => Promise<void>;
  refreshList: () => Promise<void>;
  loadJob: (id: string) => Promise<void>;
  createJob: (reference?: string) => Promise<string>;
  removeJob: (id: string) => Promise<void>;
  setJobField: <K extends keyof Job>(key: K, value: Job[K]) => void;
  setUnitSystem: (system: UnitSystem) => void;
  setStatus: (status: JobStatus) => void;
  addCargo: (piece?: Partial<CargoPiece>) => void;
  updateCargo: (id: string, patch: Partial<CargoPiece>) => void;
  removeCargo: (id: string) => void;
  importCargo: (pieces: CargoPiece[]) => void;
  addRoom: (equipmentId: string) => void;
  removeRoom: (roomId: string) => void;
  setActiveRoom: (roomId: string) => void;
  selectPlacement: (id: string | null) => void;
  selectPiece: (id: string | null) => void;
  placeInstance: (pieceId: string, instanceIndex?: number) => void;
  unplace: (placementId: string) => void;
  movePlacement: (placementId: string, xMm: number, yMm: number, zMm: number) => void;
  rotateSelected: () => void;
  setRot: (placementId: string, rotY: RotY) => void;
  suggest: () => void;
  undo: () => void;
  redo: () => void;
  setSnap: (snap: SnapMm) => void;
  setWallMode: (mode: WallMode) => void;
  setColorMode: (mode: ColorMode) => void;
  setCameraMode: (mode: CameraMode) => void;
  setSequence: (index: number | null) => void;
  setGhost: (p: Placement | null) => void;
  setDragging: (id: string | null) => void;
  setCapture: (fn: CaptureFn | null) => void;
  persist: () => void;
  bumpRevision: () => void;
  createShare: () => Promise<string | null>;
}

function cloneJob(job: Job): Job {
  return structuredClone(job);
}

function nextInstanceIndex(job: Job, pieceId: string, roomId: string): number {
  const piece = job.cargo.find((c) => c.id === pieceId);
  const qty = Math.max(1, piece?.quantity ?? 1);
  const used = new Set(
    job.placements.filter((p) => p.pieceId === pieceId && p.roomId === roomId).map((p) => p.instanceIndex),
  );
  for (let i = 0; i < qty; i++) if (!used.has(i)) return i;
  return qty;
}

export const useJobStore = create<JobStore>((set, get) => {
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  const persistNow = async () => {
    const job = get().job;
    if (!job) return;
    const stamped = { ...job, updatedAt: new Date().toISOString() };
    await saveJob(stamped);
    const summaries = await listJobs();
    set({ summaries });
  };

  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void persistNow();
    }, 280);
  };

  const commit = (mutator: (job: Job) => Job, recordHistory = true) => {
    const current = get().job;
    if (!current) return;
    if (recordHistory) {
      const past = [...get().past, cloneJob(current)].slice(-HISTORY_MAX);
      set({ past, future: [] });
    }
    const next = mutator(cloneJob(current));
    next.updatedAt = new Date().toISOString();
    set({ job: next, packFailures: [] });
    schedulePersist();
  };

  return {
    ready: false,
    summaries: [],
    job: null,
    activeRoomId: null,
    selectedPlacementId: null,
    selectedPieceId: null,
    snapMm: 25,
    wallMode: "xray",
    colorMode: "validation",
    cameraMode: "persp",
    sequenceIndex: null,
    packFailures: [],
    ghost: null,
    draggingId: null,
    past: [],
    future: [],
    capture: null,

    bootstrap: async () => {
      await ensureSeed();
      const summaries = await listJobs();
      set({ summaries, ready: true });
    },

    refreshList: async () => {
      set({ summaries: await listJobs() });
    },

    loadJob: async (id) => {
      const job = await getJob(id);
      if (!job) {
        set({ job: null, activeRoomId: null });
        return;
      }
      job.lastOpenedAt = new Date().toISOString();
      await saveJob(job);
      const system = job.lengthUnit === "in" || job.massUnit === "lb" ? "imperial" : "metric";
      const options = snapOptions(system);
      const snapMm = options.includes(get().snapMm) ? get().snapMm : options[0]!;
      set({
        job,
        activeRoomId: job.rooms[0]?.id ?? null,
        selectedPlacementId: null,
        selectedPieceId: null,
        past: [],
        future: [],
        packFailures: [],
        sequenceIndex: null,
        snapMm,
      });
    },

    createJob: async (reference) => {
      const job = createEmptyJob(reference);
      await saveJob(job);
      set({ summaries: await listJobs() });
      return job.id;
    },

    removeJob: async (id) => {
      await deleteJob(id);
      set({ summaries: await listJobs(), job: get().job?.id === id ? null : get().job });
    },

    setJobField: (key, value) => {
      commit((j) => ({ ...j, [key]: value }), key !== "keepAisle");
      if (key === "keepAisle") {
        const job = get().job;
        if (job) void saveJob(job);
      }
    },

    setUnitSystem: (system) => {
      const units = unitsForSystem(system);
      const options = snapOptions(system);
      const snapMm = options.includes(get().snapMm) ? get().snapMm : options[0]!;
      commit((j) => ({ ...j, ...units }));
      set({ snapMm });
    },

    setStatus: (status) => commit((j) => ({ ...j, status })),

    addCargo: (partial) => {
      commit((j) => {
        const n = j.cargo.length;
        const imperial = j.lengthUnit === "in";
        const piece: CargoPiece = {
          id: newId("cg"),
          description: partial?.description ?? `Piece ${n + 1}`,
          lengthMm: partial?.lengthMm ?? (imperial ? 1219 : 1200),
          widthMm: partial?.widthMm ?? (imperial ? 1016 : 800),
          heightMm: partial?.heightMm ?? (imperial ? 1219 : 1000),
          weightKg: partial?.weightKg ?? (j.massUnit === "lb" ? 227 : 250),
          quantity: partial?.quantity ?? 1,
          shape: partial?.shape ?? "box",
          stackable: partial?.stackable ?? false,
          thisSideUp: partial?.thisSideUp ?? true,
          floorOnly: partial?.floorOnly ?? false,
          notRotatable: partial?.notRotatable ?? false,
          dgr: partial?.dgr ?? false,
          cgOffsetMm: { x: 0, y: 0, z: 0 },
          color: partial?.color ?? ["#6b7c8a", "#3d6b72", "#8a7348", "#7a5b6e"][n % 4]!,
          source: "manual",
          notes: "",
          ...partial,
        };
        return { ...j, cargo: [...j.cargo, piece] };
      });
    },

    updateCargo: (id, patch) => {
      commit((j) => ({
        ...j,
        cargo: j.cargo.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
    },

    removeCargo: (id) => {
      commit((j) => ({
        ...j,
        cargo: j.cargo.filter((c) => c.id !== id),
        placements: j.placements.filter((p) => p.pieceId !== id),
      }));
      set({
        selectedPieceId: get().selectedPieceId === id ? null : get().selectedPieceId,
        selectedPlacementId: get().job?.placements.find((p) => p.id === get().selectedPlacementId)
          ? get().selectedPlacementId
          : null,
      });
    },

    importCargo: (pieces) => {
      commit((j) => ({ ...j, cargo: [...j.cargo, ...pieces] }));
    },

    addRoom: (equipmentId) => {
      const eq = requireEquipment(equipmentId);
      commit((j) => {
        const room = {
          id: newId("rm"),
          equipmentId,
          name: `${eq.shortName} ${j.rooms.filter((r) => r.equipmentId === equipmentId).length + 1}`,
        };
        return { ...j, rooms: [...j.rooms, room] };
      });
      const job = get().job;
      const last = job?.rooms[job.rooms.length - 1];
      if (last) set({ activeRoomId: last.id });
    },

    removeRoom: (roomId) => {
      commit((j) => ({
        ...j,
        rooms: j.rooms.filter((r) => r.id !== roomId),
        placements: j.placements.filter((p) => p.roomId !== roomId),
      }));
      const job = get().job;
      if (get().activeRoomId === roomId) set({ activeRoomId: job?.rooms[0]?.id ?? null });
    },

    setActiveRoom: (roomId) =>
      set({ activeRoomId: roomId, selectedPlacementId: null, sequenceIndex: null, packFailures: [] }),

    selectPlacement: (id) => {
      const job = get().job;
      const p = job?.placements.find((x) => x.id === id);
      set({ selectedPlacementId: id, selectedPieceId: p?.pieceId ?? get().selectedPieceId });
    },

    selectPiece: (id) => set({ selectedPieceId: id, selectedPlacementId: null }),

    placeInstance: (pieceId, instanceIndex) => {
      const { job, activeRoomId, snapMm } = get();
      if (!job || !activeRoomId) return;
      const piece = job.cargo.find((c) => c.id === pieceId);
      if (!piece) return;
      const idx = instanceIndex ?? nextInstanceIndex(job, pieceId, activeRoomId);
      const qty = Math.max(1, piece.quantity);
      if (idx >= qty) return;
      if (job.placements.some((p) => p.pieceId === pieceId && p.instanceIndex === idx && p.roomId === activeRoomId)) {
        return;
      }
      commit((j) => ({
        ...j,
        placements: [
          ...j.placements,
          {
            id: newId("pl"),
            pieceId,
            instanceIndex: idx,
            roomId: activeRoomId,
            xMm: snapTo(0, snapMm),
            yMm: 0,
            zMm: snapTo(0, snapMm),
            rotY: 0,
          },
        ],
      }));
      const created = get().job?.placements.at(-1);
      if (created) set({ selectedPlacementId: created.id, selectedPieceId: pieceId });
    },

    unplace: (placementId) => {
      commit((j) => ({ ...j, placements: j.placements.filter((p) => p.id !== placementId) }));
      set({ selectedPlacementId: null });
    },

    movePlacement: (placementId, xMm, yMm, zMm) => {
      const snap = get().snapMm;
      commit((j) => ({
        ...j,
        placements: j.placements.map((p) =>
          p.id === placementId
            ? { ...p, xMm: snapTo(xMm, snap), yMm: Math.max(0, snapTo(yMm, snap)), zMm: snapTo(zMm, snap) }
            : p,
        ),
      }));
    },

    rotateSelected: () => {
      const { job, selectedPlacementId } = get();
      if (!job || !selectedPlacementId) return;
      const p = job.placements.find((x) => x.id === selectedPlacementId);
      const piece = p && job.cargo.find((c) => c.id === p.pieceId);
      if (!p || !piece) return;
      const rotY = nextRotation(p.rotY, piece);
      commit((j) => ({
        ...j,
        placements: j.placements.map((x) => (x.id === p.id ? { ...x, rotY } : x)),
      }));
    },

    setRot: (placementId, rotY) => {
      commit((j) => ({
        ...j,
        placements: j.placements.map((p) => (p.id === placementId ? { ...p, rotY } : p)),
      }));
    },

    suggest: () => {
      const { job, activeRoomId, snapMm } = get();
      if (!job || !activeRoomId) return;
      const { placements, failures } = suggestLayout(job, activeRoomId, snapMm, job.keepAisle);
      commit((j) => ({ ...j, placements, status: j.status === "draft" ? "planned" : j.status }));
      set({ packFailures: failures, selectedPlacementId: null, sequenceIndex: null });
    },

    undo: () => {
      const { past, job, future } = get();
      if (!job || past.length === 0) return;
      const prev = past[past.length - 1]!;
      set({ job: prev, past: past.slice(0, -1), future: [...future, cloneJob(job)], packFailures: [] });
      schedulePersist();
    },

    redo: () => {
      const { future, job, past } = get();
      if (!job || future.length === 0) return;
      const next = future[future.length - 1]!;
      set({ job: next, future: future.slice(0, -1), past: [...past, cloneJob(job)], packFailures: [] });
      schedulePersist();
    },

    setSnap: (snapMm) => set({ snapMm }),
    setWallMode: (wallMode) => set({ wallMode }),
    setColorMode: (colorMode) => set({ colorMode }),
    setCameraMode: (cameraMode) => set({ cameraMode }),
    setSequence: (sequenceIndex) => set({ sequenceIndex }),
    setGhost: (ghost) => set({ ghost }),
    setDragging: (draggingId) => set({ draggingId }),
    setCapture: (capture) => set({ capture }),
    persist: () => {
      void persistNow();
    },
    bumpRevision: () => {
      commit((j) => ({ ...j, revision: j.revision + 1 }));
    },
    createShare: async () => {
      const job = get().job;
      if (!job) return null;
      const id = newId("sh");
      await saveShare({ id, createdAt: new Date().toISOString(), job: cloneJob(job) });
      commit((j) => ({ ...j, status: "shared", revision: j.revision + 1 }));
      return id;
    },
  };
});

export function useActiveEquipment() {
  const equipmentId = useJobStore((s) => s.job?.rooms.find((r) => r.id === s.activeRoomId)?.equipmentId);
  return equipmentId ? requireEquipment(equipmentId) : null;
}

export function useRoomMetrics(): RoomMetrics | null {
  const job = useJobStore((s) => s.job);
  const activeRoomId = useJobStore((s) => s.activeRoomId);
  return useMemo(() => (job && activeRoomId ? computeMetrics(job, activeRoomId) : null), [job, activeRoomId]);
}

export function useRoomIssues() {
  const job = useJobStore((s) => s.job);
  const activeRoomId = useJobStore((s) => s.activeRoomId);
  return useMemo(() => (job && activeRoomId ? validateRoom(job, activeRoomId) : []), [job, activeRoomId]);
}
