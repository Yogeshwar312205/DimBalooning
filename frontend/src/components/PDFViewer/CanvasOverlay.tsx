import React, { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { useInspectionStore } from '../../store/useInspectionStore';
import { Balloon } from '../../types/balloon';
import api from '../../services/api';

interface CanvasOverlayProps {
  width: number;
  height: number;
}

const STATUS_COLORS: Record<string, { fill: string; border: string; text: string }> = {
  PASS: { fill: '#D1FAE5', border: '#10B981', text: '#065F46' },
  CHECK: { fill: '#FEF3C7', border: '#F59E0B', text: '#92400E' },
  FAIL: { fill: '#FEE2E2', border: '#EF4444', text: '#991B1B' },
  PENDING: { fill: '#DBEAFE', border: '#3B82F6', text: '#1E40AF' }
};

export const CanvasOverlay: React.FC<CanvasOverlayProps> = ({ width, height }) => {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const isCreatingRef = useRef<boolean>(false);

  const [debugMode, setDebugMode] = useState<boolean>(false);

  const {
    activeSession,
    balloons,
    selectedBalloonId,
    setSelectedBalloonId,
    deleteSelectedBalloon,
    activeTool,
    currentPage,
    addBalloon,
    updateBalloonInStore,
    openManualFallbackModal,
    isAutoExtracting
  } = useInspectionStore();

  // Keyboard shortcut listener: Delete/Backspace & 'D' for Visual Debug Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      // Toggle Visual Debug Overlay ('D' key)
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setDebugMode((prev) => !prev);
      }

      // Delete selected balloon
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBalloonId) {
        e.preventDefault();
        deleteSelectedBalloon();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBalloonId, deleteSelectedBalloon]);

  // Initialize Fabric.js Canvas
  useEffect(() => {
    if (!canvasElRef.current) return;

    const fabricCanvas = new fabric.Canvas(canvasElRef.current, {
      width,
      height,
      selection: activeTool === 'SELECT',
      hoverCursor: activeTool === 'BALLOON' ? 'crosshair' : activeTool === 'PAN' ? 'grab' : 'pointer',
      renderOnAddRemove: false // Improves performance for multi-balloon drawings
    });

    fabricCanvasRef.current = fabricCanvas;

    return () => {
      fabricCanvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [width, height]);

  // Update cursor styles
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    fc.defaultCursor = activeTool === 'BALLOON' ? 'crosshair' : activeTool === 'PAN' ? 'grab' : 'default';
    fc.hoverCursor = activeTool === 'BALLOON' ? 'crosshair' : activeTool === 'PAN' ? 'grab' : 'pointer';
    fc.selection = activeTool === 'SELECT';
  }, [activeTool]);

  // 32-Candidate Radial Spiral Placement Helper for manual clicks
  const findCollisionFreePosition = (targetX: number, targetY: number, existingBalloons: Balloon[]) => {
    const radius = 22;
    let attempts = 0;
    const radii = [radius * 1.8, radius * 2.6, radius * 3.4, radius * 4.2];
    const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4];
    
    const pageBalloons = existingBalloons.filter((b) => b.pageNumber === currentPage);

    for (const r of radii) {
      for (const theta of angles) {
        attempts++;
        const candidateX = targetX + Math.cos(theta) * r;
        const candidateY = targetY + Math.sin(theta) * r;

        if (candidateX < radius + 5 || candidateX > width - radius - 5 || candidateY < radius + 5 || candidateY > height - radius - 5) {
          continue;
        }

        const isColliding = pageBalloons.some((b) => {
          const bx = b.x * width;
          const by = b.y * height;
          return Math.hypot(candidateX - bx, candidateY - by) < radius * 2.0;
        });

        if (!isColliding) {
          return { x: candidateX, y: candidateY };
        }
      }
    }

    return { x: targetX + 25, y: targetY - 25 };
  };

  // Handle Manual Canvas Clicks
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    const handleMouseDown = async (options: fabric.IEvent) => {
      if (activeTool !== 'BALLOON' || !activeSession || isCreatingRef.current || isAutoExtracting) return;
      isCreatingRef.current = true;

      const pointer = fc.getPointer(options.e);
      const clickedX = pointer.x;
      const clickedY = pointer.y;

      const freePos = findCollisionFreePosition(clickedX, clickedY, balloons);
      const normX = freePos.x / width;
      const normY = freePos.y / height;

      try {
        const res = await api.post('/balloons', {
          inspectionSessionId: activeSession.id,
          pageNumber: currentPage,
          x: normX,
          y: normY,
          leaderStartX: clickedX / width,
          leaderStartY: clickedY / height
        });

        const newBalloon = res.data.balloon;
        if (newBalloon) addBalloon(newBalloon);

        openManualFallbackModal({
          x: normX,
          y: normY,
          pageNumber: currentPage,
          createdBalloon: newBalloon
        });
      } catch (err) {
        console.error('Failed to create balloon:', err);
      } finally {
        isCreatingRef.current = false;
      }
    };

    fc.on('mouse:down', handleMouseDown);
    return () => { fc.off('mouse:down', handleMouseDown); };
  }, [activeTool, activeSession, currentPage, balloons, width, height, isAutoExtracting]);

  // High-Speed Canvas Renderer
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    fc.clear();

    const pageBalloons = balloons.filter((b) => b.pageNumber === currentPage);

    pageBalloons.forEach((b) => {
      const px = b.x * width;
      const py = b.y * height;
      const status = (b.measurement?.status || 'PENDING').toUpperCase();
      const colors = STATUS_COLORS[status] || STATUS_COLORS.PENDING;
      const isSelected = b.id === selectedBalloonId;

      let leaderLine: fabric.Line | null = null;
      let targetDot: fabric.Circle | null = null;

      const hasLeader = b.leaderStartX !== null && b.leaderStartX !== undefined && b.leaderStartY !== null && b.leaderStartY !== undefined;
      const lx = hasLeader ? b.leaderStartX! * width : px;
      const ly = hasLeader ? b.leaderStartY! * height : py;
      const dist = Math.hypot(lx - px, ly - py);

      if (dist > 2) {
        // Target Anchor Dot
        targetDot = new fabric.Circle({
          left: lx,
          top: ly,
          radius: debugMode ? 5.0 : 3.0,
          fill: debugMode ? '#10B981' : colors.border, // Bright green in debug mode
          stroke: debugMode ? '#047857' : undefined,
          strokeWidth: debugMode ? 1.5 : 0,
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false
        });

        // Dotted Leader Line
        leaderLine = new fabric.Line([lx, ly, px, py], {
          stroke: colors.border,
          strokeWidth: isSelected ? 2.5 : 1.8,
          strokeDashArray: [4, 4],
          selectable: false,
          evented: false
        });

        fc.add(targetDot);
        fc.add(leaderLine);

        // Visual Debug Mode: Red Bounding Box around text anchor
        if (debugMode) {
          const debugBbox = new fabric.Rect({
            left: lx - 22,
            top: ly - 10,
            width: 44,
            height: 20,
            fill: 'rgba(239, 68, 68, 0.15)',
            stroke: '#EF4444',
            strokeWidth: 1,
            strokeDashArray: [2, 2],
            selectable: false,
            evented: false
          });
          fc.add(debugBbox);
        }
      }

      // Fast Lightweight Balloon Circle (No CPU Blur Shadows)
      const circle = new fabric.Circle({
        radius: 15,
        fill: colors.fill,
        stroke: isSelected ? '#2563EB' : colors.border,
        strokeWidth: isSelected ? 3.0 : 2.0,
        originX: 'center',
        originY: 'center'
      });

      const text = new fabric.Text(String(b.balloonNumber), {
        fontSize: String(b.balloonNumber).length > 2 ? 11 : 13,
        fontWeight: 'bold',
        fill: colors.text,
        fontFamily: 'Inter',
        originX: 'center',
        originY: 'center'
      });

      const groupItems: fabric.Object[] = [circle, text];

      if (b.isAiExtracted) {
        const aiIndicator = new fabric.Text('✨', {
          fontSize: 9,
          left: 9,
          top: -14,
          originX: 'center',
          originY: 'center'
        });
        groupItems.push(aiIndicator);
      }

      const balloonGroup = new fabric.Group(groupItems, {
        left: px,
        top: py,
        originX: 'center',
        originY: 'center',
        hasControls: false,
        hasBorders: false,
        selectable: activeTool === 'SELECT',
        data: { balloonId: b.id }
      });

      balloonGroup.on('mousedown', () => {
        if (activeTool === 'SELECT') {
          setSelectedBalloonId(b.id);
        }
      });

      balloonGroup.on('moving', () => {
        if (leaderLine) {
          const currentPx = balloonGroup.left || px;
          const currentPy = balloonGroup.top || py;
          leaderLine.set({ x2: currentPx, y2: currentPy });
          fc.renderAll();
        }
      });

      balloonGroup.on('modified', async () => {
        const newPx = balloonGroup.left || px;
        const newPy = balloonGroup.top || py;
        const newNormX = Math.max(0.01, Math.min(0.99, newPx / width));
        const newNormY = Math.max(0.01, Math.min(0.99, newPy / height));

        const updated = { ...b, x: newNormX, y: newNormY };
        updateBalloonInStore(updated);

        try {
          await api.put(`/balloons/${b.id}`, { x: newNormX, y: newNormY });
        } catch (err) {
          console.error('Failed to update balloon coordinates:', err);
        }
      });

      fc.add(balloonGroup);
    });

    fc.renderAll();
  }, [balloons, currentPage, selectedBalloonId, activeTool, width, height, debugMode]);

  return (
    <div className="absolute top-0 left-0 pointer-events-auto">
      <canvas ref={canvasElRef} />
    </div>
  );
};