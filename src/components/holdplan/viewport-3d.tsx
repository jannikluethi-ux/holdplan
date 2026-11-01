import { ContactShadows, GizmoHelper, GizmoViewport, Grid, Line, OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BufferGeometry,
  Color,
  BackSide,
  Float32BufferAttribute,
  PCFShadowMap,
  Plane,
  Raycaster,
  Spherical,
  TOUCH,
  Vector2,
  Vector3,
  type Group,
} from "three";
import { requireEquipment } from "@/lib/holdplan/equipment";
import {
  contourRings,
  extentsFor,
  placementAabb,
  snapTo,
  usableHeightAt,
} from "@/lib/holdplan/geometry";
import { computeMetrics } from "@/lib/holdplan/metrics";
import type { CargoPiece, EquipmentDef, Placement, WallMode } from "@/lib/holdplan/types";
import { placementStatus, validatePlacement, validateRoom } from "@/lib/holdplan/validation";
import { formatDims, formatMm, snapLabel, snapOptions, unitSystemOf } from "@/lib/holdplan/units";
import { useJobStore } from "@/store/job-store";

const M = 0.001;
const VOID = "#0B0E13";
const ACCENT = "#E6B325";
const OK = "#2EC9A2";
const WARN = "#E0A24B";
const FAIL = "#E35D5D";
const DECK = "#12151C";
const EDGE = "#3A4350";

export function Viewport3D() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center bg-hangar text-xs text-muted">
        Starting 3D viewport…
      </div>
    );
  }
  return (
    <div className="relative h-full min-h-[240px] w-full bg-hangar" style={{ touchAction: "none" }}>
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true, localClippingEnabled: true }}
        camera={{ position: [9, 6, 9], fov: 38, near: 0.05, far: 250 }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = PCFShadowMap;
        }}
        onPointerMissed={() => useJobStore.getState().selectPlacement(null)}
      >
        <color attach="background" args={[VOID]} />
        <SceneBody />
      </Canvas>
      <ViewportChrome />
    </div>
  );
}

function SceneBody() {
  const job = useJobStore((s) => s.job);
  const activeRoomId = useJobStore((s) => s.activeRoomId);
  const cameraMode = useJobStore((s) => s.cameraMode);
  const wallMode = useJobStore((s) => s.wallMode);
  const room = job?.rooms.find((r) => r.id === activeRoomId);
  const def = room ? requireEquipment(room.equipmentId) : null;
  const span = def ? Math.max(def.innerLengthMm, def.innerWidthMm, def.innerHeightMm) * M : 8;

  return (
    <>
      {cameraMode === "persp" ? (
        <PerspectiveCamera makeDefault fov={38} near={0.05} far={Math.max(250, span * 20)} />
      ) : (
        <OrthographicCamera makeDefault near={0.05} far={Math.max(250, span * 20)} zoom={80} />
      )}
      <hemisphereLight args={["#b7c2d0", "#0b0e13", 0.55]} />
      <directionalLight
        position={[span * 1.4, span * 1.8, span * 0.9]}
        intensity={1.18}
        castShadow
        shadow-mapSize={1024}
        color="#f4f0e6"
      />
      <directionalLight position={[-span * 1.1, span * 0.7, -span * 0.6]} intensity={0.34} color="#8fa3b8" />
      <directionalLight position={[0, span * 0.4, span * 1.4]} intensity={0.22} color="#c9d4e0" />
      <OrbitControls
        makeDefault
        enableDamping
        enableZoom
        enableRotate
        enablePan
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2 - 0.02}
        target={[0, (def?.innerHeightMm ?? 1000) * M * 0.25, 0]}
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
      />
      <TrackpadOrbit />
      <CameraFitter def={def} />
      <Grid
        infiniteGrid
        cellSize={0.1}
        sectionSize={1}
        fadeDistance={Math.max(14, span * 2.4)}
        fadeStrength={1.8}
        cellColor="#1a1f28"
        sectionColor="#2a313c"
        position={[0, 0.0005, 0]}
      />
      <OriginMark />
      {def ? <RoomMesh def={def} wallMode={wallMode} /> : <EmptyDeck />}
      {job && def && activeRoomId ? <CargoLayer def={def} roomId={activeRoomId} /> : null}
      {job && def && activeRoomId ? <CgMarker def={def} roomId={activeRoomId} /> : null}
      <ContactShadows
        position={[0, 0.001, 0]}
        opacity={0.38}
        scale={Math.max(8, span * 2.2)}
        blur={1.6}
        far={4}
        color="#000000"
      />
      <DragController />
      <OrbitGate />
      <CaptureBinder />
      <GizmoHelper alignment="bottom-right" margin={[48, 56]}>
        <GizmoViewport axisColors={["#b07070", "#6ea08a", "#6e86b0"]} labelColor="#e8edf4" />
      </GizmoHelper>
    </>
  );
}

function CameraFitter({ def }: { def: EquipmentDef | null }) {
  const cameraMode = useJobStore((s) => s.cameraMode);
  const activeRoomId = useJobStore((s) => s.activeRoomId);
  const { camera, controls } = useThree();

  useEffect(() => {
    const L = (def?.innerLengthMm ?? 8000) * M;
    const W = (def?.innerWidthMm ?? 2400) * M;
    const H = (def?.innerHeightMm ?? 2400) * M;
    const span = Math.max(W, H, L * 0.52);
    const dist = Math.max(2.4, span * 1.02);
    const targetY = H * 0.2;
    if (cameraMode === "top") camera.position.set(0.001, dist * 1.25, 0.001);
    else if (cameraMode === "side") camera.position.set(0, Math.max(H * 0.55, dist * 0.28), dist * 1.05);
    else if (cameraMode === "front") camera.position.set(dist * 1.05, Math.max(H * 0.55, dist * 0.28), 0);
    else camera.position.set(dist * 0.78, dist * 0.48, dist * 0.78);
    camera.near = Math.max(0.02, span / 250);
    camera.far = Math.max(200, span * 22);
    if ("zoom" in camera && cameraMode !== "persp") {
      (camera as { zoom: number }).zoom = Math.max(8, 260 / Math.max(2.4, span));
    }
    camera.updateProjectionMatrix();
    const c = controls as
      | { target?: Vector3; update?: () => void; enableDamping?: boolean }
      | undefined;
    if (c?.target) {
      const damping = c.enableDamping;
      c.enableDamping = false;
      c.target.set(0, targetY, 0);
      c.update?.();
      c.enableDamping = damping;
    } else {
      camera.lookAt(0, targetY, 0);
    }
  }, [camera, controls, def, cameraMode, activeRoomId]);

  return null;
}

function OriginMark() {
  return (
    <group position={[0, 0.012, 0]}>
      <Line points={[[-0.18, 0, 0], [0.18, 0, 0]]} color={ACCENT} lineWidth={1.2} />
      <Line points={[[0, 0, -0.18], [0, 0, 0.18]]} color={ACCENT} lineWidth={1.2} />
    </group>
  );
}

function EmptyDeck() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[8, 6]} />
      <meshStandardMaterial color={DECK} />
    </mesh>
  );
}

function RoomMesh({ def, wallMode }: { def: EquipmentDef; wallMode: WallMode }) {
  const L = def.innerLengthMm * M;
  const W = def.innerWidthMm * M;
  const opacity = wallMode === "opaque" ? 0.16 : wallMode === "xray" ? 0.07 : 0;
  const hide = wallMode === "hide";
  const clip = wallMode === "section" ? [new Plane(new Vector3(0, 0, -1), 0.002)] : [];
  const rings = useMemo(() => contourRings(def, Math.max(200, def.innerLengthMm / 24)), [def]);
  const geom = useMemo(() => ringsToGeometry(rings), [rings]);
  const open = def.contour.kind === "open";
  const edgeRings = rings.filter((_, i) => i % 2 === 0 || i === rings.length - 1);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[L, W]} />
        <meshStandardMaterial color={DECK} />
      </mesh>
      <Line
        points={[
          [-L / 2, 0.01, -W / 2],
          [L / 2, 0.01, -W / 2],
          [L / 2, 0.01, W / 2],
          [-L / 2, 0.01, W / 2],
          [-L / 2, 0.01, -W / 2],
        ]}
        color={ACCENT}
        lineWidth={1.4}
        transparent
        opacity={0.7}
      />
      {!hide && !open ? (
        <mesh geometry={geom} castShadow={false} renderOrder={-1}>
          <meshStandardMaterial
            color="#1a2433"
            transparent
            opacity={Math.max(0.05, opacity)}
            side={BackSide}
            depthWrite={false}
            clippingPlanes={clip}
          />
        </mesh>
      ) : null}
      {!hide && !open
        ? edgeRings.map((ring, i) => (
            <Line
              key={i}
              points={ring.points.map((p) => [ring.xMm * M, p.yMm * M, p.zMm * M] as [number, number, number])}
              color={ACCENT}
              lineWidth={1.4}
              transparent
              opacity={0.72}
            />
          ))
        : null}
      {open && def.contour.kind === "open" && def.contour.endWalls ? (
        <>
          <mesh position={[-L / 2, (def.contour.endWallHeightMm * M) / 2, 0]}>
            <boxGeometry args={[0.06, def.contour.endWallHeightMm * M, W]} />
            <meshStandardMaterial color={EDGE} transparent opacity={0.45} />
          </mesh>
          <mesh position={[L / 2, (def.contour.endWallHeightMm * M) / 2, 0]}>
            <boxGeometry args={[0.06, def.contour.endWallHeightMm * M, W]} />
            <meshStandardMaterial color={EDGE} transparent opacity={0.45} />
          </mesh>
        </>
      ) : null}
      {def.door ? <DoorFrame def={def} /> : null}
      {def.slots?.map((s) => (
        <mesh key={s.id} rotation={[-Math.PI / 2, 0, 0]} position={[s.xMm * M, 0.012, s.zMm * M]}>
          <planeGeometry args={[s.lengthMm * M * 0.96, s.widthMm * M * 0.96]} />
          <meshStandardMaterial color={ACCENT} transparent opacity={0.08} />
        </mesh>
      ))}
      {def.lashingPoints?.slice(0, 40).map((p, i) => (
        <mesh key={i} position={[p.xMm * M, 0.03, p.zMm * M]}>
          <cylinderGeometry args={[0.018, 0.018, 0.02, 8]} />
          <meshStandardMaterial color="#8b95a4" />
        </mesh>
      ))}
      {def.axles?.map((a) => (
        <mesh key={a.id} position={[a.xMm * M, -0.12, 0]}>
          <boxGeometry args={[0.12, 0.08, W + 0.4]} />
          <meshStandardMaterial color={EDGE} />
        </mesh>
      ))}
    </group>
  );
}

function DoorFrame({ def }: { def: EquipmentDef }) {
  if (!def.door) return null;
  const x = (def.door.end === "fwd" ? -def.innerLengthMm / 2 : def.innerLengthMm / 2) * M;
  const w = def.door.widthMm * M;
  const h = def.door.heightMm * M;
  const t = 0.045;
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, h + t / 2, 0]}>
        <boxGeometry args={[t, t, w + t * 2]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, h / 2, -w / 2]}>
        <boxGeometry args={[t, h, t]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, h / 2, w / 2]}>
        <boxGeometry args={[t, h, t]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.35} />
      </mesh>
      <Line
        points={[
          [0.02, 0, -w / 2],
          [0.02, h, -w / 2],
          [0.02, h, w / 2],
          [0.02, 0, w / 2],
        ]}
        color={ACCENT}
        lineWidth={2.4}
      />
    </group>
  );
}

function ringsToGeometry(rings: ReturnType<typeof contourRings>): BufferGeometry {
  const positions: number[] = [];
  const push = (a: { xMm: number; yMm: number; zMm: number }, b: typeof a, c: typeof a) => {
    positions.push(a.xMm * M, a.yMm * M, a.zMm * M, b.xMm * M, b.yMm * M, b.zMm * M, c.xMm * M, c.yMm * M, c.zMm * M);
  };
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i]!;
    const b = rings[i + 1]!;
    const n = Math.min(a.points.length, b.points.length);
    for (let j = 0; j < n - 1; j++) {
      const a0 = { xMm: a.xMm, ...a.points[j]! };
      const a1 = { xMm: a.xMm, ...a.points[j + 1]! };
      const b0 = { xMm: b.xMm, ...b.points[j]! };
      const b1 = { xMm: b.xMm, ...b.points[j + 1]! };
      push(a0, b0, b1);
      push(a0, b1, a1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function CargoLayer({ def, roomId }: { def: EquipmentDef; roomId: string }) {
  const job = useJobStore((s) => s.job)!;
  const selected = useJobStore((s) => s.selectedPlacementId);
  const colorMode = useJobStore((s) => s.colorMode);
  const sequenceIndex = useJobStore((s) => s.sequenceIndex);
  const ghost = useJobStore((s) => s.ghost);
  const draggingId = useJobStore((s) => s.draggingId);
  const issues = validateRoom(job, roomId);
  const placements = job.placements.filter((p) => p.roomId === roomId);
  const ordered = [...placements].sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm);

  return (
    <group>
      {ordered.map((p, idx) => {
        const piece = job.cargo.find((c) => c.id === p.pieceId);
        if (!piece) return null;
        const hidden = sequenceIndex != null && idx > sequenceIndex;
        const dim = sequenceIndex != null && idx !== sequenceIndex;
        const st = placementStatus(issues, p.id);
        const color = pieceColor(piece, st, colorMode);
        return (
          <CargoMesh
            key={p.id}
            piece={piece}
            placement={ghost && draggingId === p.id ? ghost : p}
            selected={selected === p.id}
            color={color}
            status={st}
            hidden={hidden}
            dim={dim}
            def={def}
          />
        );
      })}
    </group>
  );
}

function pieceColor(piece: CargoPiece, st: "ok" | "warn" | "fail", mode: string): string {
  if (mode === "validation") {
    if (st === "fail") return FAIL;
    if (st === "warn") return WARN;
    return OK;
  }
  if (mode === "customer") return hashColor(piece.customer || piece.description);
  if (mode === "stack") return hashColor(piece.stackGroup || piece.description);
  return piece.color;
}

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const palette = ["#6b7c8a", "#3d6b72", "#8a7348", "#7a5b6e", "#4d6a4e", "#6a5a3a", "#4a5e78"];
  return palette[Math.abs(h) % palette.length]!;
}

function CargoMesh({
  piece,
  placement,
  selected,
  color,
  status,
  hidden,
  dim,
  def,
}: {
  piece: CargoPiece;
  placement: Placement;
  selected: boolean;
  color: string;
  status: "ok" | "warn" | "fail";
  hidden: boolean;
  dim: boolean;
  def: EquipmentDef;
}) {
  const group = useRef<Group>(null);
  const selectPlacement = useJobStore((s) => s.selectPlacement);
  const setDragging = useJobStore((s) => s.setDragging);
  const setGhost = useJobStore((s) => s.setGhost);
  const ext = extentsFor(piece, placement.rotY);
  const lx = ext.lengthMm * M;
  const ly = ext.heightMm * M;
  const lz = ext.widthMm * M;
  const x = placement.xMm * M;
  const y = placement.yMm * M + ly / 2;
  const z = placement.zMm * M;
  if (hidden) return null;
  const opacity = dim ? 0.18 : 0.92;

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    selectPlacement(placement.id);
    setDragging(placement.id);
    setGhost(placement);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  return (
    <group ref={group} position={[x, 0, z]} onPointerDown={onPointerDown}>
      {piece.shape === "cylinder" ? (
        <mesh position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[lz / 2, lz / 2, lx, 28]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={opacity}
            roughness={0.46}
            metalness={0.08}
            emissive={selected ? new Color(ACCENT) : new Color("#000")}
            emissiveIntensity={selected ? 0.25 : 0}
          />
        </mesh>
      ) : piece.shape === "L-shape" ? (
        <LShape lx={lx} ly={ly} lz={lz} color={color} opacity={opacity} selected={selected} y={y} />
      ) : (
        <mesh position={[0, y, 0]} castShadow>
          <boxGeometry args={[lx, ly, lz]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={piece.shape === "mesh" ? opacity * 0.55 : opacity}
            wireframe={piece.shape === "mesh"}
            roughness={0.46}
            metalness={0.08}
            emissive={selected ? new Color(ACCENT) : new Color("#000")}
            emissiveIntensity={selected ? 0.22 : 0}
          />
        </mesh>
      )}
      {selected || status === "fail" ? <SelectionBox lx={lx} ly={ly} lz={lz} y={y} status={status} /> : null}
      {selected ? <DimensionOverlay piece={piece} placement={placement} def={def} ext={ext} /> : null}
    </group>
  );
}

function LShape({
  lx,
  ly,
  lz,
  color,
  opacity,
  selected,
  y,
}: {
  lx: number;
  ly: number;
  lz: number;
  color: string;
  opacity: number;
  selected: boolean;
  y: number;
}) {
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0, -lz * 0.25]} castShadow>
        <boxGeometry args={[lx, ly, lz * 0.5]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          emissive={selected ? ACCENT : "#000"}
          emissiveIntensity={selected ? 0.2 : 0}
        />
      </mesh>
      <mesh position={[-lx * 0.25, 0, lz * 0.25]} castShadow>
        <boxGeometry args={[lx * 0.5, ly, lz * 0.5]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          emissive={selected ? ACCENT : "#000"}
          emissiveIntensity={selected ? 0.2 : 0}
        />
      </mesh>
    </group>
  );
}

function SelectionBox({
  lx,
  ly,
  lz,
  y,
  status,
}: {
  lx: number;
  ly: number;
  lz: number;
  y: number;
  status: string;
}) {
  const c = status === "fail" ? FAIL : status === "warn" ? WARN : ACCENT;
  const hx = lx / 2;
  const hy = ly / 2;
  const hz = lz / 2;
  const pts: [number, number, number][] = [];
  const corners: [number, number, number][] = [
    [-hx, y - hy, -hz],
    [hx, y - hy, -hz],
    [hx, y - hy, hz],
    [-hx, y - hy, hz],
    [-hx, y + hy, -hz],
    [hx, y + hy, -hz],
    [hx, y + hy, hz],
    [-hx, y + hy, hz],
  ];
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  for (const [a, b] of edges) {
    pts.push(corners[a!]!, corners[b!]!);
  }
  return <Line points={pts} color={c} lineWidth={status === "fail" ? 2 : 1.8} segments />;
}

function DimensionOverlay({
  piece,
  placement,
  def,
  ext,
}: {
  piece: CargoPiece;
  placement: Placement;
  def: EquipmentDef;
  ext: { lengthMm: number; widthMm: number; heightMm: number };
}) {
  const aabb = placementAabb(piece, placement);
  const uh = usableHeightAt(def, placement.xMm, aabb.maxZ - 5);
  const clear = Number.isFinite(uh) ? uh - aabb.maxY : 0;
  const hl = ext.lengthMm * M * 0.5;
  const hw = ext.widthMm * M * 0.5;
  return (
    <group>
      <Line
        points={[
          [-hl, 0.02, hw + 0.08],
          [hl, 0.02, hw + 0.08],
        ]}
        color="#e8edf4"
        lineWidth={1}
        transparent
        opacity={0.45}
      />
      <Line
        points={[
          [hl + 0.08, 0.02, -hw],
          [hl + 0.08, 0.02, hw],
        ]}
        color="#e8edf4"
        lineWidth={1}
        transparent
        opacity={0.45}
      />
      {clear > 0 ? (
        <Line
          points={[
            [0, ext.heightMm * M, 0],
            [0, ext.heightMm * M + Math.min(clear, 400) * M, 0],
          ]}
          color={ACCENT}
          lineWidth={1}
          transparent
          opacity={0.4}
        />
      ) : null}
    </group>
  );
}

function CgMarker({ def, roomId }: { def: EquipmentDef; roomId: string }) {
  const job = useJobStore((s) => s.job)!;
  const m = computeMetrics(job, roomId);
  if (!m || m.weightKg <= 0) return null;
  const color = m.cgLongStatus === "fail" || m.cgLatStatus === "fail" ? FAIL : m.cgLongStatus === "warn" ? WARN : ACCENT;
  const x = m.cgXMm * M;
  const z = m.cgZMm * M;
  const h = def.innerHeightMm * M * 0.55;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.04, 0]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} />
      </mesh>
      <Line points={[[0, 0, 0], [0, h, 0]]} color={color} lineWidth={1} dashed dashSize={0.08} gapSize={0.05} />
      <Line points={[[-0.16, 0.02, 0], [0.16, 0.02, 0]]} color="#c07070" lineWidth={1.4} />
      <Line points={[[0, 0.02, -0.16], [0, 0.02, 0.16]]} color="#6e86b0" lineWidth={1.4} />
    </group>
  );
}

function DragController() {
  const draggingId = useJobStore((s) => s.draggingId);
  const job = useJobStore((s) => s.job);
  const snapMm = useJobStore((s) => s.snapMm);
  const setGhost = useJobStore((s) => s.setGhost);
  const setDragging = useJobStore((s) => s.setDragging);
  const movePlacement = useJobStore((s) => s.movePlacement);
  const { camera, gl } = useThree();
  const lastValid = useRef<Placement | null>(null);

  useEffect(() => {
    if (!draggingId || !job) return;
    const p0 = job.placements.find((x) => x.id === draggingId);
    if (p0) lastValid.current = p0;
    const plane = new Plane(new Vector3(0, 1, 0), 0);
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const hit = new Vector3();

    const pointOnFloor = (ev: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      return hit;
    };

    const onMove = (ev: PointerEvent) => {
      const state = useJobStore.getState();
      const currentJob = state.job;
      const id = state.draggingId;
      if (!currentJob || !id) return;
      const p = currentJob.placements.find((x) => x.id === id);
      if (!p) return;
      const pt = pointOnFloor(ev);
      if (!pt) return;
      const next: Placement = {
        ...p,
        xMm: snapTo(pt.x / M, state.snapMm),
        zMm: snapTo(pt.z / M, state.snapMm),
      };
      state.setGhost(next);
      const room = currentJob.rooms.find((r) => r.id === p.roomId);
      if (!room) return;
      const def = requireEquipment(room.equipmentId);
      const issues = validatePlacement(
        { ...currentJob, placements: currentJob.placements.map((q) => (q.id === p.id ? next : q)) },
        next,
        def,
      );
      if (!issues.some((i) => i.level === "fail")) lastValid.current = next;
    };

    const onUp = () => {
      const state = useJobStore.getState();
      const currentJob = state.job;
      const id = state.draggingId;
      const g = state.ghost;
      if (currentJob && id) {
        const p = currentJob.placements.find((x) => x.id === id);
        if (p && g) {
          const room = currentJob.rooms.find((r) => r.id === p.roomId);
          const def = room ? requireEquipment(room.equipmentId) : null;
          const issues = def
            ? validatePlacement(
                { ...currentJob, placements: currentJob.placements.map((q) => (q.id === p.id ? g : q)) },
                g,
                def,
              )
            : [];
          const commit = issues.some((i) => i.level === "fail") ? (lastValid.current ?? p) : g;
          state.movePlacement(p.id, commit.xMm, commit.yMm, commit.zMm);
        }
      }
      state.setDragging(null);
      state.setGhost(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingId, job, snapMm, setGhost, setDragging, movePlacement, camera, gl]);

  return null;
}

function OrbitGate() {
  const draggingId = useJobStore((s) => s.draggingId);
  const { controls } = useThree();
  useEffect(() => {
    const c = controls as { enabled?: boolean } | undefined;
    if (c && typeof c.enabled === "boolean") c.enabled = !draggingId;
  }, [draggingId, controls]);
  return null;
}

/** Mac trackpad: two-finger drag orbits; pinch (ctrl+wheel) zooms. Cargo drag disables this. */
function TrackpadOrbit() {
  const draggingId = useJobStore((s) => s.draggingId);
  const { gl, camera, controls } = useThree();
  const draggingRef = useRef(draggingId);
  draggingRef.current = draggingId;

  useEffect(() => {
    const el = gl.domElement;
    const spherical = new Spherical();
    const onWheel = (event: WheelEvent) => {
      const c = controls as { target?: Vector3; enabled?: boolean; update?: () => void } | undefined;
      if (!c?.target) return;
      // Own the wheel fully so drei OrbitControls cannot also zoom (Mac two-finger is wheel).
      event.preventDefault();
      event.stopImmediatePropagation();
      if (draggingRef.current || c.enabled === false) return;

      if (event.ctrlKey || event.metaKey) {
        const offset = camera.position.clone().sub(c.target);
        offset.multiplyScalar(event.deltaY > 0 ? 1.08 : 0.92);
        const len = offset.length();
        if (len < 0.45 || len > 220) return;
        camera.position.copy(c.target).add(offset);
        camera.lookAt(c.target);
        c.update?.();
        return;
      }

      const offset = camera.position.clone().sub(c.target);
      spherical.setFromVector3(offset);
      spherical.theta -= event.deltaX * 0.005;
      spherical.phi = Math.max(0.04, Math.min(Math.PI / 2 - 0.02, spherical.phi + event.deltaY * 0.005));
      offset.setFromSpherical(spherical);
      camera.position.copy(c.target).add(offset);
      camera.lookAt(c.target);
      c.update?.();
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel, { capture: true });
  }, [gl, camera, controls]);
  return null;
}

function CaptureBinder() {
  const { gl, scene, camera } = useThree();
  const setCapture = useJobStore((s) => s.setCapture);
  const api = useRef({ gl, scene, camera });
  api.current = { gl, scene, camera };

  useEffect(() => {
    setCapture(async () => {
      const { gl: renderer, scene: sc, camera: cam } = api.current;
      renderer.render(sc, cam);
      const iso = renderer.domElement.toDataURL("image/png");
      const pos = cam.position.clone();
      const up = cam.up.clone();
      const span = Math.max(8, cam.position.length() * 1.2);
      cam.up.set(0, 0, -1);
      cam.position.set(0, span, 0.01);
      cam.lookAt(0, 0, 0);
      renderer.render(sc, cam);
      const top = renderer.domElement.toDataURL("image/png");
      cam.position.copy(pos);
      cam.up.copy(up);
      cam.lookAt(0, 0, 0);
      return { iso, top };
    });
    return () => setCapture(null);
  }, [setCapture]);
  return null;
}

function ViewportChrome() {
  const cameraMode = useJobStore((s) => s.cameraMode);
  const setCameraMode = useJobStore((s) => s.setCameraMode);
  const wallMode = useJobStore((s) => s.wallMode);
  const setWallMode = useJobStore((s) => s.setWallMode);
  const colorMode = useJobStore((s) => s.colorMode);
  const setColorMode = useJobStore((s) => s.setColorMode);
  const snapMm = useJobStore((s) => s.snapMm);
  const setSnap = useJobStore((s) => s.setSnap);
  const job = useJobStore((s) => s.job);
  const activeRoomId = useJobStore((s) => s.activeRoomId);
  const sequenceIndex = useJobStore((s) => s.sequenceIndex);
  const setSequence = useJobStore((s) => s.setSequence);
  const selectedPlacementId = useJobStore((s) => s.selectedPlacementId);
  const count = job?.placements.filter((p) => p.roomId === activeRoomId).length ?? 0;
  const system = job ? unitSystemOf(job.lengthUnit, job.massUnit) : "imperial";
  const lu = job?.lengthUnit ?? "in";

  const selected = job?.placements.find((p) => p.id === selectedPlacementId);
  const selectedPiece = selected ? job?.cargo.find((c) => c.id === selected.pieceId) : undefined;
  const room = job?.rooms.find((r) => r.id === activeRoomId);
  const def = room ? requireEquipment(room.equipmentId) : null;
  const issues = job && activeRoomId ? validateRoom(job, activeRoomId) : [];
  const failIssue =
    (selected ? issues.find((i) => i.level === "fail" && i.placementId === selected.id) : undefined) ??
    issues.find((i) => i.level === "fail");
  const ext = selected && selectedPiece ? extentsFor(selectedPiece, selected.rotY) : null;
  const aabb = selected && selectedPiece ? placementAabb(selectedPiece, selected) : null;
  const clear = def && aabb && selected ? usableHeightAt(def, selected.xMm, aabb.maxZ - 5) - aabb.maxY : null;

  const CAM: Array<["persp" | "top" | "side" | "front", string]> = [
    ["persp", "Persp"],
    ["top", "Top"],
    ["side", "Side"],
    ["front", "Front"],
  ];
  const WALL: Array<[WallMode, string]> = [
    ["opaque", "Solid"],
    ["xray", "X-ray"],
    ["hide", "Hidden"],
    ["section", "Section"],
  ];

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap gap-0.5 rounded-md border border-border bg-surface/92 p-0.5 text-[11px]">
          {CAM.map(([m, label]) => (
            <button key={m} type="button" onClick={() => setCameraMode(m)} data-active={cameraMode === m} className="seg-btn">
              {label}
            </button>
          ))}
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-0.5 rounded-md border border-border bg-surface/92 p-0.5 text-[11px]">
          {WALL.map(([m, label]) => (
            <button key={m} type="button" onClick={() => setWallMode(m)} data-active={wallMode === m} className="seg-btn">
              {label}
            </button>
          ))}
          <span className="mx-1 w-px bg-border" />
          {snapOptions(system).map((s) => (
            <button key={s} type="button" onClick={() => setSnap(s)} data-active={snapMm === s} className="seg-btn">
              {snapLabel(s, system)}
            </button>
          ))}
          <span className="mx-1 w-px bg-border" />
          {(["validation", "customer", "stack"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setColorMode(m)} data-active={colorMode === m} className="seg-btn">
              {m}
            </button>
          ))}
          {count > 0 ? (
            <>
              <span className="mx-1 w-px bg-border" />
              <button
                type="button"
                className="seg-btn"
                onClick={() => setSequence(sequenceIndex == null ? 0 : sequenceIndex + 1 >= count ? null : sequenceIndex + 1)}
              >
                {sequenceIndex == null ? "sequence" : `step ${sequenceIndex + 1}/${count}`}
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2 pb-1">
        {failIssue ? (
          <div className="max-w-sm rounded-md border border-fail/40 bg-surface/95 px-2.5 py-1.5 font-mono text-[11px] leading-snug text-fail">
            {failIssue.message}
          </div>
        ) : (
          <span />
        )}
        {ext && selectedPiece ? (
          <div className="rounded-md border border-border bg-surface/95 px-2.5 py-1.5 font-mono text-[11px] tabular-nums text-muted">
            {formatDims(ext.lengthMm, ext.widthMm, ext.heightMm, lu)}
            {clear != null && Number.isFinite(clear) ? ` · crown ${formatMm(Math.max(0, clear), lu)}` : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}
