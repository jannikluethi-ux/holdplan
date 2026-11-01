import { Link, useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DEMO_JOB_ID } from "@/lib/holdplan/seed";
import { useJobStore } from "@/store/job-store";

const STATUS_VARIANT: Record<string, "default" | "ok" | "warn" | "accent"> = {
  draft: "default",
  quoted: "warn",
  planned: "ok",
  shared: "accent",
};

export function JobsHome() {
  const navigate = useNavigate();
  const ready = useJobStore((s) => s.ready);
  const summaries = useJobStore((s) => s.summaries);
  const bootstrap = useJobStore((s) => s.bootstrap);
  const createJob = useJobStore((s) => s.createJob);
  const removeJob = useJobStore((s) => s.removeJob);
  const [q, setQ] = useState("");

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return summaries;
    return summaries.filter(
      (j) =>
        j.reference.toLowerCase().includes(s) ||
        j.customer.toLowerCase().includes(s) ||
        j.status.includes(s),
    );
  }, [summaries, q]);

  async function onCreate() {
    const id = await createJob("Untitled job");
    void navigate({ to: "/jobs/$jobId", params: { jobId: id } });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-12 items-center justify-between border-b border-border px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <Mark />
          <div>
            <div className="text-sm font-semibold tracking-tight">Holdplan</div>
            <div className="hidden text-[11px] text-muted sm:block">Plan the real inner room — then put the cargo in it.</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/jobs/$jobId" params={{ jobId: DEMO_JOB_ID }}>
              Demo
            </Link>
          </Button>
          <Button onClick={() => void onCreate()}>
            <Plus /> New job
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6 lg:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Jobs</h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Import a packing list, pick a real inner room — EU/UK/US/AU truck, ULD, ISO, or aircraft — place cargo,
              check chargeable weight, and export a load plan.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search reference or customer"
              className="pl-8"
              aria-label="Search jobs"
            />
          </div>
        </div>

        {!ready ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
            Loading jobs…
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-2 text-[11px] font-medium tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Reference</th>
                  <th className="hidden px-4 py-2 font-medium md:table-cell">Customer</th>
                  <th className="hidden px-4 py-2 font-medium sm:table-cell">Rooms</th>
                  <th className="hidden px-4 py-2 font-medium sm:table-cell">Pieces</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="hidden px-4 py-2 font-medium lg:table-cell">Opened</th>
                  <th className="px-4 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j) => (
                  <tr key={j.id} className="border-b border-border last:border-0 hover:bg-surface-2/70">
                    <td className="px-4 py-2.5">
                      <Link
                        to="/jobs/$jobId"
                        params={{ jobId: j.id }}
                        className="font-medium text-foreground hover:text-accent"
                      >
                        {j.reference || "Untitled"}
                      </Link>
                      {j.id === DEMO_JOB_ID ? (
                        <Badge variant="accent" className="ml-2">
                          Demo
                        </Badge>
                      ) : null}
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted md:table-cell">{j.customer || "—"}</td>
                    <td className="hidden px-4 py-2.5 tabular-nums sm:table-cell">{j.roomCount}</td>
                    <td className="hidden px-4 py-2.5 tabular-nums sm:table-cell">{j.pieceCount}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={STATUS_VARIANT[j.status] ?? "default"}>{j.status}</Badge>
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted lg:table-cell">
                      {formatDistanceToNow(new Date(j.lastOpenedAt), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {j.id !== DEMO_JOB_ID ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${j.reference}`}
                          onClick={() => void removeJob(j.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
                      No jobs match. Create one, or open the seeded turbine charter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3">
          <Step n="1" title="Add cargo" body="Type pieces in or import a packing list (CSV / Excel columns)." />
          <Step n="2" title="Choose a room" body="EU 13.6 curtainsider, US 53' van, ULD crown, ISO door, 777F slots — not a rectangle." />
          <Step n="3" title="Place, check, export" body="Drag on the deck, run Suggest layout, share a PDF the warehouse can use." />
        </section>
      </main>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15 font-mono text-xs text-accent">
        {n}
      </div>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}

export function Mark() {
  return (
    <span
      aria-hidden
      className="grid size-7 place-items-center rounded-md border border-accent/40 bg-accent/10 font-mono text-[11px] font-semibold text-accent"
    >
      H
    </span>
  );
}
