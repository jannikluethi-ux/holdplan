import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  downloadText,
  packingListTemplate,
  parseSpreadsheet,
  rowsToCargo,
  type ColumnGuess,
} from "@/lib/holdplan/csv";
import type { LengthUnit, MassUnit } from "@/lib/holdplan/types";
import { useJobStore } from "@/store/job-store";

const FIELDS = [
  ["description", "Description"],
  ["qty", "Qty"],
  ["length", "Length"],
  ["width", "Width"],
  ["height", "Height"],
  ["weight", "Weight"],
  ["stackable", "Stackable"],
  ["notes", "Notes"],
] as const;

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const importCargo = useJobStore((s) => s.importCargo);
  const [guess, setGuess] = useState<ColumnGuess | null>(null);
  const [mapping, setMapping] = useState<ColumnGuess["mapping"]>({});
  const [paste, setPaste] = useState("");
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>("mm");
  const [massUnit, setMassUnit] = useState<MassUnit>("kg");

  function ingest(text: string) {
    const g = parseSpreadsheet(text);
    setGuess(g.rows.length || g.headers.length ? g : null);
    setMapping(g.mapping);
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setPaste("");
      ingest(text);
    };
    reader.readAsText(file);
  }

  function apply() {
    if (!guess) return;
    const cargo = rowsToCargo(guess, mapping, lengthUnit, massUnit);
    if (cargo.length === 0) {
      toast.error("No usable rows. Need length, width, height, and weight.");
      return;
    }
    const skipped = guess.rows.length - cargo.length;
    importCargo(cargo);
    toast.success(`Imported ${cargo.length} cargo lines${skipped > 0 ? ` (${skipped} rows skipped)` : ""}`);
    onOpenChange(false);
    setGuess(null);
    setPaste("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setGuess(null);
          setPaste("");
        }
        onOpenChange(v);
      }}
    >
      <DialogContent
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
      >
        <DialogHeader>
          <DialogTitle>Import packing list</DialogTitle>
          <DialogDescription>
            CSV with columns for description, qty, L, W, H, weight, stackable, notes. Map headers if they differ.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv,.txt,text/plain"
            className="text-xs text-muted file:mr-2 file:rounded-md file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-xs file:text-foreground"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          <Button variant="outline" size="sm" onClick={() => downloadText("packing-list-template.csv", packingListTemplate())}>
            Download template
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Label>Length</Label>
            <Select value={lengthUnit} onValueChange={(v) => setLengthUnit(v as LengthUnit)}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mm">mm</SelectItem>
                <SelectItem value="in">in</SelectItem>
              </SelectContent>
            </Select>
            <Label>Mass</Label>
            <Select value={massUnit} onValueChange={(v) => setMassUnit(v as MassUnit)}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kg">kg</SelectItem>
                <SelectItem value="lb">lb</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <textarea
          value={paste}
          onChange={(e) => {
            const text = e.target.value;
            setPaste(text);
            if (text.trim()) ingest(text);
            else setGuess(null);
          }}
          spellCheck={false}
          placeholder="Or paste CSV here — description, qty, length, width, height, weight"
          aria-label="Paste CSV"
          className="mt-3 h-24 w-full resize-y rounded-md border border-border bg-input p-2 font-mono text-xs text-foreground"
        />

        {guess ? (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FIELDS.map(([key, label]) => (
                <label key={key} className="space-y-1">
                  <span className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</span>
                  <select
                    className="h-8 w-full rounded-md border border-border bg-input px-2 text-xs"
                    value={mapping[key] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        [key]: e.target.value === "" ? undefined : Number(e.target.value),
                      }))
                    }
                  >
                    <option value="">—</option>
                    {guess.headers.map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>
                        {h || `col ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="max-h-40 overflow-auto rounded-md border border-border">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-surface-2 text-muted">
                  <tr>
                    {guess.headers.map((h, i) => (
                      <th key={i} className="px-2 py-1 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {guess.rows.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      {r.map((c, j) => (
                        <td key={j} className="px-2 py-1 tabular-nums">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={apply}>Import {guess.rows.length} rows</Button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">
            Units default to millimetres and kilograms. Switch above if the sheet is in inches / pounds.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
