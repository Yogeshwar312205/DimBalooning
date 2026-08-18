import { User } from './auth';

export type ReportType = 'EXCEL' | 'MARKED_PDF';

export interface Report {
  id: string;
  inspectionSessionId: string;
  type: ReportType;
  filePath: string;
  generatedById: string;
  generatedBy?: User;
  createdAt: string;
}
