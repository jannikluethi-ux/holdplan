import { Box, Cylinder, Plus, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDims, formatKg } from "@/lib/holdplan/units";
import { useJobStore } from "@/store/job-store";
import { ImportDialog } from "./import-dialog";

export function CargoList() {
  const job = useJobStore((s) => s.job);
  const activeRoomId = useJobStore((s) => s.activeRoomId);
  const selectedPieceId = useJobStore((s) => s.selectedPieceId);
  const addCargo = useJobStore((s) => s.addCargo);
  const removeCargo = useJobStore((s) => s.removeCargo);
  const selectPiece = useJobStore((s) => s.selectPiece);
  const placeInstance = useJobStore((s) => s.placeInstance);
  const [q, setQ] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const rows = useMemo(() => {
    if (!job) return [];
    const s = q.trim().toLowerCase();
    return job.cargo
      .filter((c) => !s || c.description.toLowerCase().includes(s) || (c.label ?? "").toLowerCase().includes(s))
      .map((c) => {
        const placed = job.placements.filter((p) => p.pieceId === c.id && p.roomId === activeRoomId).length;
        return { piece: c, placed, qty: Math.max(1, c.quantity) };
      });
  }, [job, q, activeRoomId]);

  if (!job) return null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div>
          <div className="text-[11px] font-medium tracking-wide text-muted">Cargo</div>
          <div className="text-sm font-medium">
            {job.cargo.reduce((n, c) => n + Math.max(1, c.quantity), 0)} pieces
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload /> Import
          </Button>
          <Button size="sm" onClick={() => addCargo()}>
            <Plus /> Add
          </Button>
        </div>
      </div>
      <div className="border-b border-border px-3 py-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter cargo" aria-label="Filter cargo" />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="p-1">
          {rows.map(({ piece, placed, qty }) => (
            <li key={piece.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => selectPiece(piece.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectPiece(piece.id);
                  }
                }}
                className={`flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-left transition-colors ${
                  selectedPieceId === piece.id ? "bg-surface-3" : "hover:bg-surface-2"
                }`}
              >
                <span
                  className="mt-0.5 size-2.5 shrink-0 rounded-sm"
                  style={{ background: piece.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {piece.shape === "cylinder" ? (
                      <Cylinder className="size-3 text-muted" />
                    ) : (
                      <Box className="size-3 text-muted" />
                    )}
                    <span className="truncate text-sm font-medium">{piece.description}</span>
                    {piece.dgr ? <span className="text-[10px] uppercase tracking-wide text-warn">DGR</span> : null}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-muted tabular-nums">
                    {qty} × {formatDims(piece.lengthMm, piece.widthMm, piece.heightMm, job.lengthUnit)} ·{" "}
                    {formatKg(piece.weightKg, job.massUnit)}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    Placed in this room {placed}/{qty}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!activeRoomId || placed >= qty}
                    onClick={(e) => {
                      e.stopPropagation();
                      placeInstance(piece.id);
                    }}
                  >
                    Place
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Remove ${piece.description}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCargo(piece.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </div>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="px-3 py-8 text-center text-xs text-muted">
              Add cargo or import a packing list. Then choose a room and place — or run Suggest layout.
            </li>
          ) : null}
        </ul>
      </ScrollArea>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
