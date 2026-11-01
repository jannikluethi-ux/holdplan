import { formatChargeable } from "@/lib/holdplan/chargeable";
import { formatFloor, formatKg, formatMm, formatVolume, unitSystemOf } from "@/lib/holdplan/units";
import { useActiveEquipment, useJobStore, useRoomMetrics } from "@/store/job-store";

export function MetricsBar() {
  const metrics = useRoomMetrics();
  const eq = useActiveEquipment();
  const job = useJobStore((s) => s.job);
  const packFailures = useJobStore((s) => s.packFailures);

  if (!job) return null;
  if (!metrics || !eq) {
    return (
      <footer className="flex h-11 items-center border-t border-border bg-surface px-3 text-[11px] text-muted">
        Add a room to see payload, volume, CG, and chargeable weight for that envelope.
      </footer>
    );
  }

  const lu = job.lengthUnit;
  const mu = job.massUnit;
  const system = unitSystemOf(lu, mu);
  const wtPct = metrics.maxPayloadKg > 0 ? (metrics.weightKg / metrics.maxPayloadKg) * 100 : 0;
  const volPct = metrics.usableVolumeM3 > 0 ? (metrics.volumeM3 / metrics.usableVolumeM3) * 100 : 0;
  const floorHot = metrics.heaviestFloorKgM2 > metrics.floorLimitKgM2;
  const ch = metrics.chargeable;
  const chWarn = ch.basis !== "actual" && ch.rule.kind !== "nmfc";

  return (
    <footer className="flex h-11 min-h-11 flex-wrap items-center gap-x-4 gap-y-1 overflow-hidden border-t border-border bg-surface px-3 font-mono text-[11px] tabular-nums">
      <Metric
        label="Placed"
        value={`${metrics.placedCount}/${metrics.totalCount}`}
        warn={metrics.placedCount < metrics.totalCount}
      />
      <Metric
        label="Payload"
        value={`${formatKg(metrics.weightKg, mu)} / ${formatKg(metrics.maxPayloadKg, mu)}`}
        bar={wtPct}
        fail={wtPct > 100}
        warn={wtPct > 90}
      />
      <Metric
        label="Volume"
        value={`${formatVolume(metrics.volumeM3, system)} / ${formatVolume(metrics.usableVolumeM3, system)}`}
        bar={volPct}
      />
      <Metric
        label="Chargeable"
        value={`${ch.rule.shortName} · ${formatChargeable(ch, mu)}`}
        warn={chWarn}
      />
      <Metric
        label="CG long"
        value={`${metrics.cgXMm >= 0 ? "+" : "−"}${formatMm(Math.abs(metrics.cgXMm), lu)}`}
        fail={metrics.cgLongStatus === "fail"}
        warn={metrics.cgLongStatus === "warn"}
      />
      <Metric
        label="CG lat"
        value={`${metrics.cgZMm >= 0 ? "+" : "−"}${formatMm(Math.abs(metrics.cgZMm), lu)}`}
        fail={metrics.cgLatStatus === "fail"}
        warn={metrics.cgLatStatus === "warn"}
      />
      <Metric
        label="Floor"
        value={formatFloor(metrics.heaviestFloorKgM2, system)}
        fail={floorHot}
        warn={!floorHot && metrics.heaviestFloorKgM2 > metrics.floorLimitKgM2 * 0.85}
      />
      {metrics.axleLoads.map((a) => (
        <Metric
          key={a.id}
          label={a.name}
          value={`${formatKg(a.kg, mu)} / ${formatKg(a.maxKg, mu)}`}
          fail={a.kg > a.maxKg}
          warn={a.kg > a.maxKg * 0.9}
        />
      ))}
      <span className={`ml-auto ${metrics.failCount ? "text-fail" : metrics.warnCount ? "text-warn" : "text-ok"}`}>
        {metrics.failCount} errors · {metrics.warnCount} warnings
        {packFailures.length ? ` · ${packFailures.length} unplaced by suggest` : ""}
      </span>
    </footer>
  );
}

function Metric({
  label,
  value,
  bar,
  fail,
  warn,
}: {
  label: string;
  value: string;
  bar?: number;
  fail?: boolean;
  warn?: boolean;
}) {
  const color = fail ? "text-fail" : warn ? "text-warn" : "text-foreground";
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-muted">{label}</span>
      <span className={color}>{value}</span>
      {bar != null ? (
        <span className="relative h-1 w-14 overflow-hidden rounded-full bg-surface-3">
          <span
            className={`absolute inset-y-0 left-0 ${fail ? "bg-fail" : warn ? "bg-warn" : "bg-ok"}`}
            style={{ width: `${Math.min(100, Math.max(0, bar))}%` }}
          />
        </span>
      ) : null}
    </span>
  );
}
