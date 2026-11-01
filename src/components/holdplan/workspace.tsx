import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ChevronLeft,
  FileSpreadsheet,
  FileText,
  Link2,
  Redo2,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Group, Panel, Separator as ResizeSeparator } from "react-resizable-panels";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CHARGEABLE_RULES } from "@/lib/holdplan/chargeable";
import { downloadText, exportPlacementsCsv } from "@/lib/holdplan/csv";
import { exportLoadPlanPdf } from "@/lib/holdplan/pdf";
import { DEMO_JOB_ID } from "@/lib/holdplan/seed";
import type { ChargeableRuleId, JobStatus, UnitSystem } from "@/lib/holdplan/types";
import { unitSystemOf } from "@/lib/holdplan/units";
import { useJobStore } from "@/store/job-store";
import { CargoList } from "./cargo-list";
import { Inspector } from "./inspector";
import { Mark } from "./jobs-home";
import { MetricsBar } from "./metrics-bar";
import { RoomPicker } from "./room-picker";
import { Viewport3D } from "./viewport-3d";

const STATUS_VARIANT: Record<JobStatus, "default" | "ok" | "warn" | "accent"> = {
  draft: "default",
  quoted: "warn",
  planned: "ok",
  shared: "accent",
};

export function Workspace() {
  const { jobId } = useParams({ from: "/jobs/$jobId" });
  const navigate = useNavigate();
  const job = useJobStore((s) => s.job);
  const bootstrap = useJobStore((s) => s.bootstrap);
  const loadJob = useJobStore((s) => s.loadJob);
  const activeRoomId = useJobStore((s) => s.activeRoomId);
  const setActiveRoom = useJobStore((s) => s.setActiveRoom);
  const addRoom = useJobStore((s) => s.addRoom);
  const removeRoom = useJobStore((s) => s.removeRoom);
  const suggest = useJobStore((s) => s.suggest);
  const undo = useJobStore((s) => s.undo);
  const redo = useJobStore((s) => s.redo);
  const setJobField = useJobStore((s) => s.setJobField);
  const packFailures = useJobStore((s) => s.packFailures);
  const capture = useJobStore((s) => s.capture);
  const bumpRevision = useJobStore((s) => s.bumpRevision);
  const createShare = useJobStore((s) => s.createShare);
  const [picker, setPicker] = useState(false);
  const [mobilePane, setMobilePane] = useState<"cargo" | "inspector">("cargo");

  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadState("loading");
      if (!useJobStore.getState().ready) await bootstrap();
      await loadJob(jobId);
      if (cancelled) return;
      setLoadState(useJobStore.getState().job ? "ready" : "missing");
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, bootstrap, loadJob]);

  useWorkspaceKeys();

  async function onPdf() {
    if (!job) return;
    try {
      const views = capture ? await capture() : { iso: "", top: "" };
      bumpRevision();
      await exportLoadPlanPdf(useJobStore.getState().job ?? job, activeRoomId, views);
      toast.success("PDF exported");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF export failed");
    }
  }

  async function onShare() {
    const id = await createShare();
    if (!id) return;
    const url = `${window.location.origin}/share/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
    } catch {
      toast.message(url);
    }
  }

  if (loadState !== "ready" || !job) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-sm text-muted">
        <p>{loadState === "missing" ? "Job not found." : "Opening job…"}</p>
        <Button variant="outline" onClick={() => void navigate({ to: "/" })}>
          Back to jobs
        </Button>
      </div>
    );
  }

  const empty = job.cargo.length === 0 && job.rooms.length === 0;
  const room = job.rooms.find((r) => r.id === activeRoomId);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header
        data-tauri-drag-region
        className="app-header flex h-12 shrink-0 items-center gap-2 border-b border-border px-3"
      >
        <Link to="/" className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2" data-tauri-drag-region="false">
          <ChevronLeft className="size-4 text-muted" />
          <Mark />
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">Holdplan</span>
        </Link>
        <span className="hidden h-5 w-px bg-border sm:block" />
        <input
          value={job.reference}
          onChange={(e) => setJobField("reference", e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium tracking-tight outline-none md:max-w-md"
          aria-label="Job reference"
          data-tauri-drag-region="false"
        />
        {room ? (
          <span className="hidden truncate text-xs text-muted lg:inline">{room.name}</span>
        ) : null}
        <Badge variant={STATUS_VARIANT[job.status]} className="hidden sm:inline-flex">
          {job.status}
        </Badge>
        <div className="ml-auto flex items-center gap-1" data-tauri-drag-region="false">
          {job.id !== DEMO_JOB_ID ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/jobs/$jobId" params={{ jobId: DEMO_JOB_ID }}>
                Demo
              </Link>
            </Button>
          ) : null}
          <UnitToggle />
          <ChargeableSelect />
          <IconTip label="Undo">
            <Button variant="ghost" size="icon" aria-label="Undo" onClick={undo}>
              <Undo2 />
            </Button>
          </IconTip>
          <IconTip label="Redo">
            <Button variant="ghost" size="icon" aria-label="Redo" onClick={redo}>
              <Redo2 />
            </Button>
          </IconTip>
          <label className="hidden items-center gap-1.5 px-2 text-xs text-muted xl:flex">
            Aisle
            <Switch checked={job.keepAisle} onCheckedChange={(v) => setJobField("keepAisle", v)} />
          </label>
          <Button variant="secondary" size="sm" disabled={!activeRoomId} onClick={suggest}>
            <Sparkles /> Suggest
          </Button>
          <IconTip label="Copy share link">
            <Button variant="outline" size="icon" aria-label="Share" onClick={() => void onShare()}>
              <Link2 />
            </Button>
          </IconTip>
          <IconTip label="Export placements CSV">
            <Button
              variant="outline"
              size="icon"
              aria-label="Excel"
              onClick={() => {
                if (!job) return;
                downloadText(`${(job.reference || "job").replace(/\s+/g, "_")}-placements.csv`, exportPlacementsCsv(job));
              }}
            >
              <FileSpreadsheet />
            </Button>
          </IconTip>
          <IconTip label="Export load plan PDF">
            <Button size="icon" aria-label="PDF" onClick={() => void onPdf()}>
              <FileText />
            </Button>
          </IconTip>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="hidden min-h-0 min-w-0 flex-1 lg:flex">
          <Group orientation="horizontal" id="holdplan-workspace" className="h-full w-full">
            <Panel defaultSize="22%" minSize="16%" className="min-w-0">
              <CargoList />
            </Panel>
            <ResizeSeparator className="w-1 bg-border hover:bg-accent/40" />
            <Panel defaultSize="57%" minSize="30%" className="min-w-0">
              <div className="flex h-full min-h-0 flex-col">
                <RoomTabs
                  onAdd={() => setPicker(true)}
                  activeRoomId={activeRoomId}
                  onSelect={setActiveRoom}
                  onRemove={removeRoom}
                />
                <div className="relative min-h-0 flex-1">
                  <Viewport3D />
                  {empty ? <EmptyHint /> : null}
                  {packFailures.length > 0 ? <FailBanner /> : null}
                </div>
              </div>
            </Panel>
            <ResizeSeparator className="w-1 bg-border hover:bg-accent/40" />
            <Panel defaultSize="21%" minSize="16%" className="min-w-0">
              <Inspector />
            </Panel>
          </Group>
        </div>
        <div className="flex min-h-0 flex-1 flex-col lg:hidden">
          <RoomTabs
            onAdd={() => setPicker(true)}
            activeRoomId={activeRoomId}
            onSelect={setActiveRoom}
            onRemove={removeRoom}
          />
          <div className="relative h-[42vh] min-h-[220px]">
            <Viewport3D />
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border">
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-surface px-2">
              {(["cargo", "inspector"] as const).map((pane) => (
                <button
                  key={pane}
                  type="button"
                  onClick={() => setMobilePane(pane)}
                  className={`rounded-md px-2.5 py-1 text-xs ${
                    mobilePane === pane ? "bg-surface-3 text-foreground" : "text-muted"
                  }`}
                >
                  {pane === "cargo" ? "Cargo" : "Inspector"}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {mobilePane === "cargo" ? <CargoList /> : <Inspector />}
            </div>
          </div>
        </div>
      </div>
      <MetricsBar />
      <RoomPicker open={picker} onOpenChange={setPicker} onPick={addRoom} />
    </div>
  );
}

function IconTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function RoomTabs({
  onAdd,
  activeRoomId,
  onSelect,
  onRemove,
}: {
  onAdd: () => void;
  activeRoomId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const job = useJobStore((s) => s.job);
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface px-2">
      {job?.rooms.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onSelect(r.id)}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
            activeRoomId === r.id ? "bg-surface-3 text-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          {r.name}
          <span
            role="button"
            tabIndex={0}
            className="rounded-sm p-0.5 hover:bg-fail/20 hover:text-fail"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(r.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRemove(r.id);
            }}
            aria-label={`Remove ${r.name}`}
          >
            <X className="size-3" />
          </span>
        </button>
      ))}
      <Button variant="ghost" size="sm" onClick={onAdd}>
        Add room
      </Button>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="max-w-sm rounded-lg border border-border bg-surface/92 p-4 text-center">
        <p className="text-sm font-medium tracking-tight">Add cargo, then choose a room.</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Demo is one click in the header. Same packing list on a PMC, 777F, flatrack, EU 13.6 curtainsider, and US 53'
          van.
        </p>
      </div>
    </div>
  );
}

function UnitToggle() {
  const job = useJobStore((s) => s.job);
  const setUnitSystem = useJobStore((s) => s.setUnitSystem);
  if (!job) return null;
  const system = unitSystemOf(job.lengthUnit, job.massUnit);
  return (
    <div className="hidden rounded-md border border-border p-0.5 text-[11px] md:flex">
      {(["imperial", "metric"] as UnitSystem[]).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setUnitSystem(s)}
          data-active={system === s}
          className="seg-btn"
        >
          {s === "imperial" ? "in · lb" : "mm · kg"}
        </button>
      ))}
    </div>
  );
}

function ChargeableSelect() {
  const job = useJobStore((s) => s.job);
  const setJobField = useJobStore((s) => s.setJobField);
  if (!job) return null;
  return (
    <label className="hidden items-center gap-1 text-[11px] text-muted xl:flex">
      <span className="sr-only">Chargeable rule</span>
      <select
        value={job.chargeableRuleId}
        onChange={(e) => setJobField("chargeableRuleId", e.target.value as ChargeableRuleId)}
        className="h-8 max-w-[10.5rem] rounded-md border border-border bg-input px-2 text-[11px] text-foreground"
        aria-label="Chargeable weight rule"
      >
        {CHARGEABLE_RULES.map((r) => (
          <option key={r.id} value={r.id}>
            {r.shortName}
          </option>
        ))}
      </select>
    </label>
  );
}

function FailBanner() {
  const packFailures = useJobStore((s) => s.packFailures);
  return (
    <div className="absolute bottom-2 left-2 right-2 max-h-32 overflow-auto rounded-md border border-fail/40 bg-surface/95 p-2 text-[11px] text-fail">
      {packFailures.map((f, i) => (
        <div key={`${f.pieceId}-${f.instanceIndex}-${i}`}>
          {f.description} #{f.instanceIndex + 1}: {f.reason}
        </div>
      ))}
    </div>
  );
}

function useWorkspaceKeys() {
  const rotateSelected = useJobStore((s) => s.rotateSelected);
  const unplace = useJobStore((s) => s.unplace);
  const undo = useJobStore((s) => s.undo);
  const redo = useJobStore((s) => s.redo);
  const setCameraMode = useJobStore((s) => s.setCameraMode);
  const setDragging = useJobStore((s) => s.setDragging);
  const selectedPlacementId = useJobStore((s) => s.selectedPlacementId);
  const job = useJobStore((s) => s.job);
  const setGhost = useJobStore((s) => s.setGhost);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        rotateSelected();
      } else if (e.key === "g" || e.key === "G") {
        if (selectedPlacementId && job) {
          const p = job.placements.find((x) => x.id === selectedPlacementId);
          if (p) {
            setDragging(p.id);
            setGhost(p);
          }
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedPlacementId) {
          e.preventDefault();
          unplace(selectedPlacementId);
        }
      } else if (e.key === "1") setCameraMode("persp");
      else if (e.key === "2") setCameraMode("top");
      else if (e.key === "3") setCameraMode("side");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotateSelected, unplace, undo, redo, setCameraMode, setDragging, selectedPlacementId, job, setGhost]);
}
