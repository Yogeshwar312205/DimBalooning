import { create } from 'zustand';
import { InspectionSession } from '../types/inspection';
import { Balloon, Measurement } from '../types/balloon';
import { User } from '../types/auth';
import api from '../services/api';

export type ToolType = 'SELECT' | 'BALLOON' | 'PAN';
export type FitMode = 'FIT_PAGE' | 'FIT_WIDTH' | 'CUSTOM';

export interface ManualPendingCoord {
  x: number;
  y: number;
  pageNumber: number;
  createdBalloon?: Balloon;
}

interface InspectionStore {
  activeSession: InspectionSession | null;
  balloons: Balloon[];
  selectedBalloonId: string | null;
  activeTool: ToolType;
  fitMode: FitMode;
  currentPage: number;
  zoomLevel: number;
  onlineCollaborators: User[];
  manualFallbackModalOpen: boolean;
  manualPendingCoord: ManualPendingCoord | null;

  setSession: (session: InspectionSession) => void;
  addBalloon: (balloon: Balloon) => void;
  updateBalloonInStore: (balloon: Balloon) => void;
  deleteBalloonFromStore: (balloonId: string) => void;
  deleteSelectedBalloon: () => Promise<void>;
  updateMeasurementInStore: (measurement: Measurement) => void;
  setSelectedBalloonId: (id: string | null) => void;
  setActiveTool: (tool: ToolType) => void;
  setFitMode: (mode: FitMode) => void;
  setCurrentPage: (page: number) => void;
  setZoomLevel: (zoom: number) => void;
  syncZoomLevel: (zoom: number) => void;
  setOnlineCollaborators: (users: User[]) => void;
  openManualFallbackModal: (coord: ManualPendingCoord) => void;
  closeManualFallbackModal: () => void;
  autoDetectAllBalloons: () => Promise<any>;
}

export const useInspectionStore = create<InspectionStore>((set, get) => ({
  activeSession: null,
  balloons: [],
  selectedBalloonId: null,
  activeTool: 'SELECT',
  fitMode: 'FIT_PAGE',
  currentPage: 1,
  zoomLevel: 1.0,
  onlineCollaborators: [],
  manualFallbackModalOpen: false,
  manualPendingCoord: null,

  setSession: (session: InspectionSession) => {
    set({
      activeSession: session,
      balloons: session.balloons || [],
      selectedBalloonId: null,
      currentPage: 1,
      fitMode: 'FIT_PAGE'
    });
  },

  addBalloon: (balloon: Balloon) => {
    const existing = get().balloons;
    if (existing.some((b) => b.id === balloon.id)) return;
    set({
      balloons: [...existing, balloon],
      selectedBalloonId: balloon.id
    });
  },

  updateBalloonInStore: (updatedBalloon: Balloon) => {
    set({
      balloons: get().balloons.map((b) =>
        b.id === updatedBalloon.id ? { ...b, ...updatedBalloon } : b
      )
    });
  },

  deleteBalloonFromStore: (balloonId: string) => {
    set({
      balloons: get().balloons.filter((b) => b.id !== balloonId),
      selectedBalloonId: get().selectedBalloonId === balloonId ? null : get().selectedBalloonId
    });
  },

  deleteSelectedBalloon: async () => {
    const selectedId = get().selectedBalloonId;
    if (!selectedId) return;

    try {
      await api.delete(`/balloons/${selectedId}`);
      get().deleteBalloonFromStore(selectedId);
    } catch (err) {
      console.error('Failed to delete balloon:', err);
    }
  },

  updateMeasurementInStore: (updatedMeasurement: Measurement) => {
    set({
      balloons: get().balloons.map((b) => {
        if (b.id === updatedMeasurement.balloonId || b.measurement?.id === updatedMeasurement.id) {
          return {
            ...b,
            measurement: updatedMeasurement
          };
        }
        return b;
      })
    });
  },

  setSelectedBalloonId: (id: string | null) => set({ selectedBalloonId: id }),
  setActiveTool: (tool: ToolType) => set({ activeTool: tool }),
  setFitMode: (mode: FitMode) => set({ fitMode: mode }),
  setCurrentPage: (page: number) => set({ currentPage: page }),
  setZoomLevel: (zoom: number) =>
    set({
      zoomLevel: Math.round(Math.max(0.2, Math.min(4.0, zoom)) * 100) / 100,
      fitMode: 'CUSTOM'
    }),
  syncZoomLevel: (zoom: number) =>
    set({
      zoomLevel: Math.round(Math.max(0.2, Math.min(4.0, zoom)) * 100) / 100
    }),
  setOnlineCollaborators: (users: User[]) => set({ onlineCollaborators: users }),
  openManualFallbackModal: (coord) => set({ manualFallbackModalOpen: true, manualPendingCoord: coord }),
  closeManualFallbackModal: () => set({ manualFallbackModalOpen: false, manualPendingCoord: null }),
  autoDetectAllBalloons: async () => {
    const session = get().activeSession;
    const page = get().currentPage;
    if (!session) return { count: 0, message: 'No active session' };

    try {
      const res = await api.post('/balloons/auto-detect', {
        inspectionSessionId: session.id,
        pageNumber: page
      });
      if (res.data.balloons && res.data.balloons.length > 0) {
        const existing = get().balloons;
        const newBalloons = res.data.balloons.filter((nb: Balloon) => !existing.some(eb => eb.id === nb.id));
        set({ balloons: [...existing, ...newBalloons] });
      }
      return res.data;
    } catch (err: any) {
      console.error('Failed to auto detect balloons:', err);
      throw err;
    }
  }
}));
