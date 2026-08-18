import { Drawing } from './drawing';
import { User } from './auth';
import { Balloon } from './balloon';

export type SessionStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED';

export interface InspectionSession {
  id: string;
  drawingId: string;
  drawing: Drawing;
  name: string;
  partNumber: string;
  partName: string;
  revision: string;
  batchNumber: string;
  status: SessionStatus;
  createdById: string;
  createdBy: User;
  createdAt: string;
  updatedAt: string;
  balloons?: Balloon[];
  collaborators?: Array<{
    id: string;
    userId: string;
    user: User;
    joinedAt: string;
  }>;
  _count?: {
    balloons: number;
  };
}

export interface DashboardStats {
  totalDrawings: number;
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  passCount: number;
  checkCount: number;
  failCount: number;
  pendingCount: number;
  passRate: number;
  recentSessions: InspectionSession[];
}
