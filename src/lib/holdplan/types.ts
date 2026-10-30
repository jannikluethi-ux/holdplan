export type JobStatus = "draft" | "quoted" | "planned" | "shared";
export type CargoShape = "box" | "cylinder" | "L-shape" | "mesh";
export type CargoSource = "manual" | "excel";
export type LengthUnit = "mm" | "in";
export type MassUnit = "kg" | "lb";
export type UnitSystem = "metric" | "imperial";
export type RotY = 0 | 90 | 180 | 270;
export type SnapMm = 10 | 25 | 50 | 100;
export type WallMode = "opaque" | "xray" | "hide" | "section";
export type ColorMode = "customer" | "stack" | "validation";
export type CameraMode = "persp" | "top" | "side" | "front";
export type RoomFamily = "container" | "flatrack" | "uld" | "aircraft" | "truck";
export type EquipmentRegion = "EU" | "UK" | "US" | "AU" | "INTL";
export type ChargeableRuleId =
  | "iata-6000"
  | "express-5000"
  | "eu-road-333"
  | "eu-ldm-1750"
  | "uk-road-330"
  | "us-ltl-250"
  | "us-nmfc"
  | "ocean-wm"
  | "au-road-333";

export type ContourSpec =
  | { kind: "box" }
  | { kind: "crown"; wallHeightMm: number; topWidthMm: number }
  | {
      kind: "ld3";
      slopedSide: "port" | "starboard";
      slopeStartHeightMm: number;
      topWidthMm: number;
    }
  | { kind: "ld7"; slopeStartHeightMm: number; topWidthMm: number }
  | {
      kind: "aircraft";
      sideWallHeightMm: number;
      topWidthMm: number;
      noseLengthMm: number;
      noseEndWidthMm: number;
      noseEndHeightMm: number;
    }
  | { kind: "open"; endWalls: boolean; endWallHeightMm: number };

export interface DoorSpec {
  widthMm: number;
  heightMm: number;
  end: "fwd" | "aft";
}

export interface PositionSlot {
  id: string;
  name: string;
  xMm: number;
  zMm: number;
  lengthMm: number;
  widthMm: number;
  maxKg: number;
}

export interface AxleGroup {
  id: string;
  name: string;
  xMm: number;
  axleCount: number;
  maxKg: number;
}

export interface LashingPoint {
  xMm: number;
  zMm: number;
}

export interface EquipmentDef {
  id: string;
  name: string;
  shortName: string;
  family: RoomFamily;
  region: EquipmentRegion;
  description: string;
  innerLengthMm: number;
  innerWidthMm: number;
  innerHeightMm: number;
  maxPayloadKg: number;
  tareKg: number;
  gvwKg?: number;
  floorLimitKgM2: number;
  contour: ContourSpec;
  door?: DoorSpec;
  sideAccess?: boolean;
  slots?: PositionSlot[];
  axles?: AxleGroup[];
  kingpinXMm?: number;
  lashingPoints?: LashingPoint[];
  euroPallets?: number;
  usPallets?: number;
  ldm?: number;
}

export interface CargoPiece {
  id: string;
  description: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  weightKg: number;
  quantity: number;
  shape: CargoShape;
  stackable: boolean;
  maxStackWeightKg?: number;
  thisSideUp: boolean;
  floorOnly: boolean;
  notRotatable: boolean;
  dgr: boolean;
  dgrClass?: string;
  cgOffsetMm: { x: number; y: number; z: number };
  color: string;
  label?: string;
  source: CargoSource;
  notes?: string;
  customer?: string;
  stackGroup?: string;
  lCutLengthMm?: number;
  lCutWidthMm?: number;
}

export interface RoomInstance {
  id: string;
  equipmentId: string;
  name: string;
}

export interface Placement {
  id: string;
  pieceId: string;
  instanceIndex: number;
  roomId: string;
  xMm: number;
  yMm: number;
  zMm: number;
  rotY: RotY;
}

export interface Job {
  id: string;
  reference: string;
  customer: string;
  incoterms: string;
  notes: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  lengthUnit: LengthUnit;
  massUnit: MassUnit;
  chargeableRuleId: ChargeableRuleId;
  cargo: CargoPiece[];
  rooms: RoomInstance[];
  placements: Placement[];
  revision: number;
  keepAisle: boolean;
}

export interface JobSummary {
  id: string;
  reference: string;
  customer: string;
  status: JobStatus;
  updatedAt: string;
  lastOpenedAt: string;
  roomCount: number;
  pieceCount: number;
}

export interface ValidationIssue {
  level: "fail" | "warn";
  code: string;
  message: string;
  placementId?: string;
  pieceId?: string;
  roomId?: string;
}

export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface PieceExtents {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PackFailure {
  pieceId: string;
  instanceIndex: number;
  description: string;
  reason: string;
}

export interface ShareRecord {
  id: string;
  createdAt: string;
  job: Job;
}

export const ROT_Y_VALUES: RotY[] = [0, 90, 180, 270];
