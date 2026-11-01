import { jsPDF } from "jspdf";
import { formatChargeable } from "./chargeable.ts";
import { requireEquipment } from "./equipment.ts";
import { computeMetrics } from "./metrics.ts";
import type { Job } from "./types.ts";
import { formatDims, formatFloor, formatKg, formatMm, formatVolume, unitSystemOf } from "./units.ts";
import { validateRoom } from "./validation.ts";

export async function exportLoadPlanPdf(
  job: Job,
  roomId: string | null,
  views: { iso: string; top: string },
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const W = 297;
  const H = 210;
  const margin = 12;
  const lu = job.lengthUnit;
  const mu = job.massUnit;
  const system = unitSystemOf(lu, mu);

  doc.setFillColor(14, 17, 22);
  doc.rect(0, 0, W, H, "F");
  doc.setTextColor(232, 237, 244);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("HOLDPLAN", margin, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(230, 179, 37);
  doc.text("Plan the real inner room", margin + 38, 16);

  doc.setTextColor(232, 237, 244);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(job.reference || "Untitled job", margin, 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(139, 149, 164);
  const room = job.rooms.find((r) => r.id === roomId);
  const eq = room ? requireEquipment(room.equipmentId) : null;
  const meta = [
    job.customer && `Customer ${job.customer}`,
    job.incoterms && job.incoterms,
    room && `${room.name}`,
    eq && eq.name,
    `Rev ${job.revision}`,
    new Date(job.updatedAt).toUTCString(),
  ]
    .filter(Boolean)
    .join("   ·   ");
  doc.text(meta, margin, 32);

  const imgW = 128;
  const imgH = 72;
  try {
    if (views.iso) doc.addImage(views.iso, "PNG", margin, 38, imgW, imgH);
  } catch {
    /* canvas may be empty */
  }
  try {
    if (views.top) doc.addImage(views.top, "PNG", margin + imgW + 6, 38, imgW, imgH);
  } catch {
    /* ignore */
  }
  doc.setFontSize(7);
  doc.setTextColor(139, 149, 164);
  doc.text("Isometric (planning)", margin, 38 + imgH + 4);
  doc.text("Top (deck)", margin + imgW + 6, 38 + imgH + 4);

  const metrics = roomId ? computeMetrics(job, roomId) : null;
  let y = 38 + imgH + 10;
  doc.setTextColor(232, 237, 244);
  doc.setFontSize(8);
  if (metrics && eq) {
    const ch = metrics.chargeable;
    const line = `Placed ${metrics.placedCount}/${metrics.totalCount}    Payload ${formatKg(metrics.weightKg, mu)} / ${formatKg(eq.maxPayloadKg, mu)}    Volume ${formatVolume(metrics.volumeM3, system)} / ${formatVolume(metrics.usableVolumeM3, system)}    CG long ${formatMm(metrics.cgXMm, lu)}  lat ${formatMm(metrics.cgZMm, lu)}    Floor ${formatFloor(metrics.heaviestFloorKgM2, system)}`;
    doc.text(line, margin, y);
    y += 5;
    doc.setTextColor(230, 179, 37);
    doc.text(
      `Chargeable  ${ch.rule.name}  ·  ${formatChargeable(ch, mu)}  ·  actual ${formatKg(ch.actualKg, mu)}  ·  vol ${formatKg(ch.volumetricKg, mu)}`,
      margin,
      y,
    );
    y += 6;
  }

  const issues = roomId ? validateRoom(job, roomId) : [];
  if (issues.length) {
    doc.setFontSize(7);
    for (const i of issues.slice(0, 4)) {
      doc.setTextColor(i.level === "fail" ? 227 : 224, i.level === "fail" ? 93 : 162, i.level === "fail" ? 93 : 75);
      doc.text(`${i.level.toUpperCase()}  ${i.message}`, margin, y);
      y += 4;
    }
  }

  y = Math.max(y + 2, 128);
  doc.setDrawColor(42, 49, 60);
  doc.line(margin, y, W - margin, y);
  y += 6;
  doc.setTextColor(139, 149, 164);
  doc.setFontSize(7);
  doc.text("Piece", margin, y);
  doc.text("Room", margin + 62, y);
  doc.text("L × W × H", margin + 100, y);
  doc.text(mu, margin + 150, y);
  doc.text("X", margin + 168, y);
  doc.text("Y", margin + 188, y);
  doc.text("Z", margin + 208, y);
  doc.text("Rot", margin + 228, y);
  y += 4;
  doc.setTextColor(232, 237, 244);
  const rows = job.placements.filter((p) => !roomId || p.roomId === roomId).slice(0, 14);
  for (const p of rows) {
    const piece = job.cargo.find((c) => c.id === p.pieceId);
    const rm = job.rooms.find((r) => r.id === p.roomId);
    if (!piece) continue;
    doc.text(`${piece.description}  #${p.instanceIndex + 1}`, margin, y);
    doc.text(rm?.name ?? "", margin + 62, y);
    doc.text(formatDims(piece.lengthMm, piece.widthMm, piece.heightMm, lu), margin + 100, y);
    doc.text(formatKg(piece.weightKg, mu), margin + 150, y);
    doc.text(formatMm(p.xMm, lu), margin + 168, y);
    doc.text(formatMm(p.yMm, lu), margin + 188, y);
    doc.text(formatMm(p.zMm, lu), margin + 208, y);
    doc.text(`${p.rotY}°`, margin + 228, y);
    y += 4.2;
    if (y > H - 18) break;
  }

  doc.setFontSize(6.5);
  doc.setTextColor(139, 149, 164);
  doc.text(
    "HOLDPLAN planning aid. Approximate CG, contour, axle and chargeable-weight checks only. Not a certified weight-and-balance, not a lashing certificate, not an airline W&B computer of record.",
    margin,
    H - 8,
  );

  const safe = (job.reference || "loadplan").replace(/[^\w-]+/g, "_");
  doc.save(`${safe}-rev${job.revision}.pdf`);
}
