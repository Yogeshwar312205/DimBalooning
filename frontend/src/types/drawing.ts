import { User } from './auth';

export interface Drawing {
  id: string;
  name: string;
  filePath: string;
  revision: string;
  pageCount: number;
  uploadedById: string;
  uploadedBy?: User;
  createdAt: string;
  updatedAt: string;
  _count?: {
    inspectionSessions: number;
  };
}
