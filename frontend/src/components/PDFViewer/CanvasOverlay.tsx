import React, { useEffect, useRef } from 'react';
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
    openManualFallbackModal
  } = useInspectionStore();

  // Keyboard shortcut: Delete or Backspace key to delete selected balloon
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't delete if user is typing inside an input field
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBalloonId) {
        e.preventDefault();
        deleteSelectedBalloon();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBalloonId, deleteSelectedBalloon]);

  // 1. Initialize Fabric.js Canvas
  useEffect(() => {
    if (!canvasElRef.current) return;

    const fabricCanvas = new fabric.Canvas(canvasElRef.current, {
      width,
      height,
      selection: activeTool === 'SELECT',
      hoverCursor: activeTool === 'BALLOON' ? 'crosshair' : activeTool === 'PAN' ? 'grab' : 'pointer'
    });

    fabricCanvasRef.current = fabricCanvas;

    return () => {
      fabricCanvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [width, height]);

  // Update Cursor style on tool change
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    fc.defaultCursor = activeTool === 'BALLOON' ? 'crosshair' : activeTool === 'PAN' ? 'grab' : 'default';
    fc.hoverCursor = activeTool === 'BALLOON' ? 'crosshair' : activeTool === 'PAN' ? 'grab' : 'pointer';
    fc.selection = activeTool === 'SELECT';
  }, [activeTool]);

  // 2. Collision Avoidance Logic: Nearest Free Position Algorithm
  const findCollisionFreePosition = (targetX: number, targetY: number, existingBalloons: Balloon[]) => {
    const radius = 22; // Balloon radius in canvas pixels
    let finalX = targetX;
    let finalY = targetY;
    let attempts = 0;
    let angle = 0;
    let distance = 0;

    const pageBalloons = existingBalloons.filter((b) => b.pageNumber === currentPage);

    while (attempts < 20) {
      let isColliding = false;

      for (const b of pageBalloons) {
        const bx = b.x * width;
        const by = b.y * height;
        const dist = Math.hypot(finalX - bx, finalY - by);
        
        if (dist < radius * 2.2) {
          isColliding = true;
          break;
        }
      }

      if (!isColliding) {
        return { x: finalX, y: finalY };
      }

      attempts++;
      angle += (Math.PI / 4); // 45 degrees
      distance = radius * 2.5 * Math.ceil(attempts / 8);
      finalX = targetX + Math.cos(angle) * distance;
      finalY = targetY + Math.sin(angle) * distance;

      finalX = Math.max(radius + 5, Math.min(width - radius - 5, finalX));
      finalY = Math.max(radius + 5, Math.min(height - radius - 5, finalY));
    }

    return { x: targetX, y: targetY };
  };

  // 3. Handle Canvas Clicks (Adding Balloons)
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    const handleMouseDown = async (options: fabric.IEvent) => {
      if (activeTool !== 'BALLOON' || !activeSession || isCreatingRef.current) return;
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
        const extracted = res.data.extracted;

        if (newBalloon) {
          addBalloon(newBalloon);
        }

        if (!extracted || !extracted.found || extracted.extractionMode === 'MANUAL_FALLBACK') {
          openManualFallbackModal({
            x: normX,
            y: normY,
            pageNumber: currentPage,
            createdBalloon: newBalloon
          });
        }
      } catch (err) {
        console.error('Failed to create balloon:', err);
        openManualFallbackModal({
          x: normX,
          y: normY,
          pageNumber: currentPage
        });
      } finally {
        isCreatingRef.current = false;
      }
    };

    fc.on('mouse:down', handleMouseDown);
    return () => {
      fc.off('mouse:down', handleMouseDown);
    };
  }, [activeTool, activeSession, currentPage, balloons, width, height]);

  // 4. Render Balloons onto Fabric Canvas
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
      const lx = hasLeader ? b.leaderStartX! * width : (px - 28);
      const ly = hasLeader ? b.leaderStartY! * height : (py + 20);

      const dist = Math.hypot(lx - px, ly - py);

      if (dist > 2) {
        // Target dot at exact coordinate on drawing
        targetDot = new fabric.Circle({
          left: lx,
          top: ly,
          radius: 3.5,
          fill: colors.border,
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false
        });

        // Leader line connecting target coordinate (lx, ly) to balloon circle center (px, py)
        leaderLine = new fabric.Line([lx, ly, px, py], {
          stroke: colors.border,
          strokeWidth: 2,
          strokeDashArray: [4, 4],
          selectable: false,
          evented: false
        });

        fc.add(targetDot);
        fc.add(leaderLine);
      }

      // Circle
      const circle = new fabric.Circle({
        radius: 16,
        fill: colors.fill,
        stroke: isSelected ? '#3B82F6' : colors.border,
        strokeWidth: isSelected ? 3.5 : 2.5,
        originX: 'center',
        originY: 'center',
        shadow: isSelected ? new fabric.Shadow({ color: 'rgba(59, 130, 246, 0.6)', blur: 12 }) : undefined
      });

      // Text (Balloon Number)
      const text = new fabric.Text(String(b.balloonNumber), {
        fontSize: String(b.balloonNumber).length > 2 ? 11 : 13,
        fontWeight: 'bold',
        fill: colors.text,
        fontFamily: 'Inter',
        originX: 'center',
        originY: 'center'
      });

      const balloonGroup = new fabric.Group([circle, text], {
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

        const updated = {
          ...b,
          x: newNormX,
          y: newNormY
        };

        updateBalloonInStore(updated);

        try {
          await api.put(`/balloons/${b.id}`, {
            x: newNormX,
            y: newNormY
          });
        } catch (err) {
          console.error('Failed to update balloon coordinates:', err);
        }
      });

      fc.add(balloonGroup);
    });

    fc.renderAll();
  }, [balloons, currentPage, selectedBalloonId, activeTool, width, height]);

  return (
    <div className={`absolute top-0 left-0 ${activeTool === 'PAN' ? 'pointer-events-none' : 'pointer-events-auto'}`}>
      <canvas ref={canvasElRef} />
    </div>
  );
};
