import type { ReactNode } from "react";
import { CHARGEABLE_RULES } from "@/lib/holdplan/chargeable";
import { getEquipment, REGION_LABEL } from "@/lib/holdplan/equipment";
import { contourKindLabel, extentsFor } from "@/lib/holdplan/geometry";
import {
  displayToKg,
  displayToMm,
  equipmentStatsLine,
  formatFloor,
  formatInner,
  formatKg,
  formatMm,
  kgToDisplay,
  mmToDisplay,
  unitSystemOf,
} from "@/lib/holdplan/units";
import { placementStatus } from "@/lib/holdplan/validation";
import { useActiveEquipment, useJobStore, useRoomIssues } from "@/store/job-store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CargoShape, ChargeableRuleId, JobStatus, UnitSystem } from "@/lib/holdplan/types";

export function Inspector() {
  const job = useJobStore((s) => s.job);
  const selectedPieceId = useJobStore((s) => s.selectedPieceId);
  const selectedPlacementId = useJobStore((s) => s.selectedPlacementId);
  const activeRoomId = useJobStore((s) => s.activeRoomId);
  const issues = useRoomIssues();
  const eq = useActiveEquipment();

  if (!job) return null;
  const piece = job.cargo.find((c) => c.id === selectedPieceId);
  const placement = job.placements.find((p) => p.id === selectedPlacementId);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="border-b border-border px-3 py-2">
        <div className="text-[11px] font-medium tracking-wide text-muted">Inspector</div>
        <div className="text-sm font-medium">
          {placement ? "Placement" : piece ? "Cargo piece" : eq ? "Room" : "Job"}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3">
          {placement && piece ? (
            <PlacementFields />
          ) : piece ? (
            <PieceFields />
          ) : eq ? (
            <RoomFields />
          ) : (
            <JobFields />
          )}
          {issues.length > 0 && activeRoomId ? (
            <div>
              <Label>Validation</Label>
              <ul className="mt-2 space-y-1.5">
                {issues.slice(0, 12).map((i, idx) => (
                  <li
                    key={`${i.code}-${idx}`}
                    className={`rounded-md px-2 py-1.5 text-xs leading-relaxed ${
                      i.level === "fail" ? "bg-fail/10 text-fail" : "bg-warn/10 text-warn"
                    }`}
                  >
                    {i.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function JobFields() {
  const job = useJobStore((s) => s.job)!;
  const setJobField = useJobStore((s) => s.setJobField);
  const setUnitSystem = useJobStore((s) => s.setUnitSystem);
  const setStatus = useJobStore((s) => s.setStatus);
  const system = unitSystemOf(job.lengthUnit, job.massUnit);
  return (
    <div className="space-y-3">
      <Field label="Reference">
        <Input value={job.reference} onChange={(e) => setJobField("reference", e.target.value)} />
      </Field>
      <Field label="Customer">
        <Input value={job.customer} onChange={(e) => setJobField("customer", e.target.value)} />
      </Field>
      <Field label="Incoterms">
        <Input value={job.incoterms} onChange={(e) => setJobField("incoterms", e.target.value)} />
      </Field>
      <Field label="Status">
        <Select value={job.status} onValueChange={(v) => setStatus(v as JobStatus)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">draft</SelectItem>
            <SelectItem value="quoted">quoted</SelectItem>
            <SelectItem value="planned">planned</SelectItem>
            <SelectItem value="shared">shared</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Units">
        <div className="flex rounded-md border border-border p-0.5">
          {(["imperial", "metric"] as UnitSystem[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setUnitSystem(s)}
              className={`flex-1 rounded-sm px-2 py-1.5 text-xs ${
                system === s ? "bg-surface-3 text-foreground" : "text-muted"
              }`}
            >
              {s === "imperial" ? "Imperial (in·lb)" : "Metric (mm·kg)"}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Chargeable weight">
        <Select
          value={job.chargeableRuleId}
          onValueChange={(v) => setJobField("chargeableRuleId", v as ChargeableRuleId)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHARGEABLE_RULES.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.shortName} · {r.regionLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          {CHARGEABLE_RULES.find((r) => r.id === job.chargeableRuleId)?.description}
        </p>
      </Field>
      <Field label="Notes">
        <Textarea value={job.notes} onChange={(e) => setJobField("notes", e.target.value)} />
      </Field>
      <p className="text-xs leading-relaxed text-muted">
        Add cargo → Choose room (truck, ULD, ISO, aircraft) → Place or Suggest layout → Export. Same cargo can be
        planned on several rooms as scenarios.
      </p>
    </div>
  );
}

function RoomFields() {
  const job = useJobStore((s) => s.job)!;
  const activeRoomId = useJobStore((s) => s.activeRoomId);
  const room = job.rooms.find((r) => r.id === activeRoomId);
  if (!room) return <JobFields />;
  const eq = getEquipment(room.equipmentId);
  if (!eq) return null;
  const lu = job.lengthUnit;
  const mu = job.massUnit;
  const system = unitSystemOf(lu, mu);
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-surface-2 p-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-medium">{eq.name}</div>
          <span className="font-mono text-[11px] text-accent">{eq.region}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">{eq.description}</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums">
          <dt className="text-muted">Region</dt>
          <dd>{REGION_LABEL[eq.region]}</dd>
          <dt className="text-muted">Inner L×W×H</dt>
          <dd>{formatInner(eq, lu)}</dd>
          <dt className="text-muted">Payload</dt>
          <dd>{formatKg(eq.maxPayloadKg, mu)}</dd>
          {eq.gvwKg ? (
            <>
              <dt className="text-muted">GVW / GCW</dt>
              <dd>{formatKg(eq.gvwKg, mu)}</dd>
            </>
          ) : null}
          <dt className="text-muted">Floor limit</dt>
          <dd>{formatFloor(eq.floorLimitKgM2, system)}</dd>
          <dt className="text-muted">Contour</dt>
          <dd>{contourKindLabel(eq.contour)}</dd>
          {eq.door ? (
            <>
              <dt className="text-muted">Door</dt>
              <dd>
                {formatMm(eq.door.widthMm, lu)} × {formatMm(eq.door.heightMm, lu)}
                {eq.sideAccess ? " · side access" : ""}
              </dd>
            </>
          ) : eq.sideAccess ? (
            <>
              <dt className="text-muted">Access</dt>
              <dd>Side / open — door fit skipped</dd>
            </>
          ) : null}
          {eq.euroPallets ? (
            <>
              <dt className="text-muted">EUR pallets</dt>
              <dd>{eq.euroPallets}</dd>
            </>
          ) : null}
          {eq.usPallets ? (
            <>
              <dt className="text-muted">GMA 48×40</dt>
              <dd>{eq.usPallets}</dd>
            </>
          ) : null}
          {eq.ldm ? (
            <>
              <dt className="text-muted">Loading metres</dt>
              <dd>{eq.ldm} LDM</dd>
            </>
          ) : null}
        </dl>
        <p className="mt-2 font-mono text-[11px] text-muted">{equipmentStatsLine(eq, lu, mu)}</p>
        <p className="mt-2 text-[11px] text-muted">Planning aid — not certified W&B / lashing certificate.</p>
      </div>
      <JobFields />
    </div>
  );
}

function PieceFields() {
  const job = useJobStore((s) => s.job)!;
  const id = useJobStore((s) => s.selectedPieceId)!;
  const piece = job.cargo.find((c) => c.id === id);
  const updateCargo = useJobStore((s) => s.updateCargo);
  const placeInstance = useJobStore((s) => s.placeInstance);
  if (!piece) return <JobFields />;
  const lu = job.lengthUnit;
  const mu = job.massUnit;
  return (
    <div className="space-y-3">
      <Field label="Description">
        <Input value={piece.description} onChange={(e) => updateCargo(id, { description: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Num
          label={`Length (${lu})`}
          value={mmToDisplay(piece.lengthMm, lu)}
          onChange={(v) => updateCargo(id, { lengthMm: displayToMm(v, lu) })}
        />
        <Num
          label={`Width (${lu})`}
          value={mmToDisplay(piece.widthMm, lu)}
          onChange={(v) => updateCargo(id, { widthMm: displayToMm(v, lu) })}
        />
        <Num
          label={`Height (${lu})`}
          value={mmToDisplay(piece.heightMm, lu)}
          onChange={(v) => updateCargo(id, { heightMm: displayToMm(v, lu) })}
        />
        <Num
          label={`Weight (${mu})`}
          value={kgToDisplay(piece.weightKg, mu)}
          onChange={(v) => updateCargo(id, { weightKg: displayToKg(v, mu) })}
        />
        <Num label="Qty" value={piece.quantity} onChange={(v) => updateCargo(id, { quantity: Math.max(1, Math.round(v)) })} />
        <Field label="Shape">
          <Select value={piece.shape} onValueChange={(v) => updateCargo(id, { shape: v as CargoShape })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="box">box</SelectItem>
              <SelectItem value="cylinder">cylinder</SelectItem>
              <SelectItem value="L-shape">L-shape</SelectItem>
              <SelectItem value="mesh">mesh</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <CheckRow label="Stackable" checked={piece.stackable} onChange={(v) => updateCargo(id, { stackable: v })} />
        <CheckRow label="This side up" checked={piece.thisSideUp} onChange={(v) => updateCargo(id, { thisSideUp: v })} />
        <CheckRow label="Floor only" checked={piece.floorOnly} onChange={(v) => updateCargo(id, { floorOnly: v })} />
        <CheckRow
          label="Not rotatable"
          checked={piece.notRotatable}
          onChange={(v) => updateCargo(id, { notRotatable: v })}
        />
        <CheckRow label="DGR" checked={piece.dgr} onChange={(v) => updateCargo(id, { dgr: v })} />
      </div>
      {piece.dgr ? (
        <Field label="DGR class">
          <Input value={piece.dgrClass ?? ""} onChange={(e) => updateCargo(id, { dgrClass: e.target.value })} />
        </Field>
      ) : null}
      <Field label="Notes">
        <Textarea value={piece.notes ?? ""} onChange={(e) => updateCargo(id, { notes: e.target.value })} />
      </Field>
      <Button onClick={() => placeInstance(piece.id)}>Place in this room</Button>
    </div>
  );
}

function PlacementFields() {
  const job = useJobStore((s) => s.job)!;
  const pid = useJobStore((s) => s.selectedPlacementId)!;
  const p = job.placements.find((x) => x.id === pid);
  const piece = p ? job.cargo.find((c) => c.id === p.pieceId) : undefined;
  const movePlacement = useJobStore((s) => s.movePlacement);
  const setRot = useJobStore((s) => s.setRot);
  const unplace = useJobStore((s) => s.unplace);
  const issues = useRoomIssues();
  if (!p || !piece) return <PieceFields />;
  const st = placementStatus(issues, p.id);
  const ext = extentsFor(piece, p.rotY);
  const lu = job.lengthUnit;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{piece.description}</div>
        <span
          className={`text-[10px] uppercase tracking-wide ${
            st === "fail" ? "text-fail" : st === "warn" ? "text-warn" : "text-ok"
          }`}
        >
          {st}
        </span>
      </div>
      <p className="font-mono text-[11px] text-muted">
        Occupies {formatMm(ext.lengthMm, lu)} × {formatMm(ext.widthMm, lu)} × {formatMm(ext.heightMm, lu)} after rotation
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Num
          label={`X (${lu})`}
          value={mmToDisplay(p.xMm, lu)}
          onChange={(v) => movePlacement(p.id, displayToMm(v, lu), p.yMm, p.zMm)}
        />
        <Num
          label={`Y (${lu})`}
          value={mmToDisplay(p.yMm, lu)}
          onChange={(v) => movePlacement(p.id, p.xMm, displayToMm(v, lu), p.zMm)}
        />
        <Num
          label={`Z (${lu})`}
          value={mmToDisplay(p.zMm, lu)}
          onChange={(v) => movePlacement(p.id, p.xMm, p.yMm, displayToMm(v, lu))}
        />
      </div>
      <Field label="Yaw">
        <Select value={String(p.rotY)} onValueChange={(v) => setRot(p.id, Number(v) as 0 | 90 | 180 | 270)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">0°</SelectItem>
            <SelectItem value="90">90°</SelectItem>
            <SelectItem value="180">180°</SelectItem>
            <SelectItem value="270">270°</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <p className="text-[11px] text-muted">
        {formatKg(piece.weightKg, job.massUnit)} · G grab · R rotate 90° · Del remove from room
      </p>
      <Button variant="danger" onClick={() => unplace(p.id)}>
        Remove from room
      </Button>
      <PieceFields />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <Input
        type="number"
        className="tabular-nums"
        value={Number.isFinite(value) ? Number(value.toFixed(1)) : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-foreground">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {label}
    </label>
  );
}
