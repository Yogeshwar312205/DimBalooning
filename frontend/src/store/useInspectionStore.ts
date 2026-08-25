import { create } from 'zustand';
import { InspectionSession } from '../types/inspection';
import { Balloon, Measurement } from '../types/balloon';
import api from '../services/api';

export type ToolType = 'SELECT' | 'BALLOON' | 'PAN';
export type FitMode = 'FIT_PAGE' | 'FIT_WIDTH' | 'CUSTOM';

export interface InspectorUser {
  id?: string;
  name: string;
  role?: string;
}

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
  rotation: number;
  onlineCollaborators: InspectorUser[];
  manualFallbackModalOpen: boolean;
  manualPendingCoord: ManualPendingCoord | null;
  isAutoExtracting: boolean;

  setSession: (session: InspectionSession) => void;
  setBalloons: (balloons: Balloon[]) => void;
  addBalloon: (balloon: Balloon) => void;
  addMultipleBalloons: (balloons: Balloon[]) => void;
  updateBalloonInStore: (balloon: Balloon) => void;
  deleteBalloonFromStore: (balloonId: string) => void;
  deleteSelectedBalloon: () => Promise<void>;
  updateMeasurementInStore: (measurement: Measurement) => void;
  setSelectedBalloonId: (id: string | null) => void;
  setActiveTool: (tool: ToolType) => void;
  setFitMode: (mode: FitMode) => void;
  setCurrentPage: (page: number) => void;
  setZoomLevel: (zoom: number) => void;
  rotateCanvas: () => void;
  setRotation: (rotation: number) => void;
  setOnlineCollaborators: (users: InspectorUser[]) => void;
  openManualFallbackModal: (coord: ManualPendingCoord) => void;
  closeManualFallbackModal: () => void;
  setIsAutoExtracting: (loading: boolean) => void;
}

export const useInspectionStore = create<InspectionStore>((set, get) => ({
  activeSession: null,
  balloons: [],
  selectedBalloonId: null,
  activeTool: 'SELECT',
  fitMode: 'FIT_PAGE',
  currentPage: 1,
  zoomLevel: 1.0,
  rotation: 0,
  onlineCollaborators: [],
  manualFallbackModalOpen: false,
  manualPendingCoord: null,
  isAutoExtracting: false,

  setSession: (session: InspectionSession) => {
    set({
      activeSession: session,
      balloons: session.balloons || [],
      selectedBalloonId: null,
      currentPage: 1,
      fitMode: 'FIT_PAGE',
      rotation: 0
    });
  },

  setBalloons: (balloons: Balloon[]) => {
    set({ balloons });
  },

  addBalloon: (balloon: Balloon) => {
    const existing = get().balloons;
    if (existing.some((b) => b.id === balloon.id)) return;
    set({
      balloons: [...existing, balloon],
      selectedBalloonId: balloon.id
    });
  },

  addMultipleBalloons: (newBalloons: Balloon[]) => {
    const existing = get().balloons;
    const existingIds = new Set(existing.map((b) => b.id));
    const toAdd = newBalloons.filter((b) => !existingIds.has(b.id));
    set({
      balloons: [...existing, ...toAdd]
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
  setZoomLevel: (zoom: number) => set({ zoomLevel: Math.max(0.2, Math.min(4.0, zoom)), fitMode: 'CUSTOM' }),
  rotateCanvas: () => set({ rotation: (get().rotation + 90) % 360 }),
  setRotation: (rotation: number) => set({ rotation: rotation % 360 }),
  setOnlineCollaborators: (users: InspectorUser[]) => set({ onlineCollaborators: users }),
  openManualFallbackModal: (coord) => set({ manualFallbackModalOpen: true, manualPendingCoord: coord }),
  closeManualFallbackModal: () => set({ manualFallbackModalOpen: false, manualPendingCoord: null }),
  setIsAutoExtracting: (loading: boolean) => set({ isAutoExtracting: loading })
}));