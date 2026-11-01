import { useMemo, useState } from "react";
import { EQUIPMENT, FAMILY_LABEL, REGION_LABEL } from "@/lib/holdplan/equipment";
import { contourKindLabel } from "@/lib/holdplan/geometry";
import { typicalRuleFor } from "@/lib/holdplan/chargeable";
import type { EquipmentRegion, RoomFamily } from "@/lib/holdplan/types";
import { equipmentStatsLine, formatKg } from "@/lib/holdplan/units";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useJobStore } from "@/store/job-store";

const ORDER: RoomFamily[] = ["truck", "container", "flatrack", "uld", "aircraft"];
const REGIONS: Array<EquipmentRegion | "ALL"> = ["ALL", "EU", "UK", "US", "AU", "INTL"];

export function RoomPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (equipmentId: string) => void;
}) {
  const job = useJobStore((s) => s.job);
  const [region, setRegion] = useState<EquipmentRegion | "ALL">("ALL");
  const lu = job?.lengthUnit ?? "in";
  const mu = job?.massUnit ?? "lb";

  const grouped = useMemo(() => {
    return ORDER.map((family) => {
      const items = EQUIPMENT.filter((e) => e.family === family && (region === "ALL" || e.region === region));
      return { family, items };
    }).filter((g) => g.items.length);
  }, [region]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(960px,calc(100%-24px))]">
        <DialogHeader>
          <DialogTitle>Add a room</DialogTitle>
          <DialogDescription>
            Inner geometry, door, contour, axles, and pallet count come from the library. Same cargo can be planned in
            more than one room as a scenario.
          </DialogDescription>
        </DialogHeader>
        <div className="mb-4 flex flex-wrap gap-1">
          {REGIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRegion(r)}
              className={`rounded-md px-2.5 py-1 text-[11px] ${
                region === r ? "bg-surface-3 text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {r === "ALL" ? "All regions" : REGION_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="space-y-5">
          {grouped.map(({ family, items }) => (
            <section key={family}>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                {FAMILY_LABEL[family]}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((eq) => (
                  <button
                    key={eq.id}
                    type="button"
                    onClick={() => {
                      onPick(eq.id);
                      onOpenChange(false);
                    }}
                    className="rounded-lg border border-border bg-surface-2 p-3 text-left transition-colors hover:border-accent/50 hover:bg-surface-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{eq.name}</span>
                      <span className="font-mono text-[11px] text-accent">{eq.shortName}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{eq.description}</p>
                    <p className="mt-2 font-mono text-[11px] text-muted">
                      {equipmentStatsLine(eq, lu, mu)} · {contourKindLabel(eq.contour)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      {eq.region}
                      {eq.sideAccess ? " · side access" : ""}
                      {eq.gvwKg ? ` · GVW ${formatKg(eq.gvwKg, mu)}` : ""}
                      {" · typical "}
                      {typicalRuleFor(eq).shortName}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {grouped.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No equipment in this region.</p>
          ) : null}
        </div>
        <div className="mt-2 flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
