import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getShare } from "@/lib/holdplan/persist";
import { computeMetrics } from "@/lib/holdplan/metrics";
import { requireEquipment } from "@/lib/holdplan/equipment";
import { useJobStore } from "@/store/job-store";
import { Viewport3D } from "./viewport-3d";
import { MetricsBar } from "./metrics-bar";
import { Mark } from "./jobs-home";
import { Button } from "@/components/ui/button";
import { formatChargeable } from "@/lib/holdplan/chargeable";
import { formatDims, formatKg, formatMm } from "@/lib/holdplan/units";

export function ShareView() {
  const { shareId } = useParams({ from: "/share/$shareId" });
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    void (async () => {
      const rec = await getShare(shareId);
      if (!rec) {
        setMissing(true);
        return;
      }
      useJobStore.setState({
        job: rec.job,
        activeRoomId: rec.job.rooms[0]?.id ?? null,
        selectedPlacementId: null,
        selectedPieceId: null,
        ready: true,
      });
    })();
  }, [shareId]);

  const job = useJobStore((s) => s.job);
  const activeRoomId = useJobStore((s) => s.activeRoomId);
  const setActiveRoom = useJobStore((s) => s.setActiveRoom);

  if (missing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <Mark />
        <p className="text-sm text-muted">This share link is not in this browser. Shares in the MVP live in local storage on the machine that created them.</p>
        <Button asChild variant="outline">
          <Link to="/">Back to jobs</Link>
        </Button>
      </div>
    );
  }

  if (!job) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted">Loading plan…</div>;
  }

  const room = job.rooms.find((r) => r.id === activeRoomId);
  const eq = room ? requireEquipment(room.equipmentId) : null;
  const metrics = activeRoomId ? computeMetrics(job, activeRoomId) : null;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-11 items-center gap-3 border-b border-border px-3">
        <Mark />
        <div>
          <div className="text-sm font-semibold">Holdplan</div>
          <div className="text-[11px] text-muted">Read-only load plan</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{job.reference}</div>
          <div className="truncate text-[11px] text-muted">
            {job.customer}
            {eq ? ` · ${eq.name}` : ""}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/">Open planner</Link>
        </Button>
      </header>
      <div className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-1">
        {job.rooms.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setActiveRoom(r.id)}
            className={`rounded-md px-2 py-1 text-xs ${activeRoomId === r.id ? "bg-surface-3" : "text-muted"}`}
          >
            {r.name}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_280px]">
        <div className="min-h-[280px]">
          <Viewport3D />
        </div>
        <aside className="overflow-auto border-t border-border bg-surface p-3 lg:border-l lg:border-t-0">
          <p className="text-xs leading-relaxed text-muted">
            Planning aid. Approximate CG and contour only — not certified W&B, not a lashing certificate.
          </p>
          {metrics ? (
            <dl className="mt-3 space-y-1 font-mono text-[11px] tabular-nums">
              <Row k="Placed" v={`${metrics.placedCount}/${metrics.totalCount}`} />
              <Row k="Payload" v={`${formatKg(metrics.weightKg, job.massUnit)} / ${formatKg(metrics.maxPayloadKg, job.massUnit)}`} />
              <Row k="Chargeable" v={`${metrics.chargeable.rule.shortName} · ${formatChargeable(metrics.chargeable, job.massUnit)}`} />
              <Row k="CG long" v={formatMm(metrics.cgXMm, job.lengthUnit)} />
              <Row k="CG lat" v={formatMm(metrics.cgZMm, job.lengthUnit)} />
            </dl>
          ) : null}
          <h2 className="mt-4 text-[11px] uppercase tracking-[0.08em] text-muted">Pieces in this room</h2>
          <ul className="mt-2 space-y-1 text-xs">
            {job.placements
              .filter((p) => p.roomId === activeRoomId)
              .map((p) => {
                const piece = job.cargo.find((c) => c.id === p.pieceId);
                if (!piece) return null;
                return (
                  <li key={p.id} className="flex justify-between gap-2 border-b border-border py-1">
                    <span>
                      {piece.description} #{p.instanceIndex + 1}
                    </span>
                    <span className="font-mono text-muted">
                      {formatDims(piece.lengthMm, piece.widthMm, piece.heightMm, job.lengthUnit)} ·{" "}
                      {formatKg(piece.weightKg, job.massUnit)}
                    </span>
                  </li>
                );
              })}
          </ul>
        </aside>
      </div>
      <MetricsBar />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
