export type MeasurementStatus = 'PASS' | 'CHECK' | 'FAIL' | 'PENDING';

export interface Measurement {
  id: string;
  balloonId: string;
  dimensionText: string | null;
  nominalValue: number | null;
  upperTolerance: number | null;
  lowerTolerance: number | null;
  lowerLimit: number | null;
  upperLimit: number | null;
  actualValue: number | null;
  unit: string;
  status: MeasurementStatus;
  remarks: string | null;
  updatedById?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Balloon {
  id: string;
  inspectionSessionId: string;
  balloonNumber: number;
  pageNumber: number;
  x: number; // Normalized coordinate [0..1]
  y: number; // Normalized coordinate [0..1]
  width: number;
  height: number;
  leaderStartX: number | null;
  leaderStartY: number | null;
  leaderEndX: number | null;
  leaderEndY: number | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  measurement?: Measurement;
}
