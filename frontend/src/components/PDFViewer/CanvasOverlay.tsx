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
    openManualFallbackModal,
    isAutoExtracting // Need this to prevent clicks during AI extraction
  } = useInspectionStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;
    fc.defaultCursor = activeTool === 'BALLOON' ? 'crosshair' : activeTool === 'PAN' ? 'grab' : 'default';
    fc.hoverCursor = activeTool === 'BALLOON' ? 'crosshair' : activeTool === 'PAN' ? 'grab' : 'pointer';
    fc.selection = activeTool === 'SELECT';
  }, [activeTool]);

  const findCollisionFreePosition = (targetX: number, targetY: number, existingBalloons: Balloon[]) => {
    const radius = 22;
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
        if (Math.hypot(finalX - bx, finalY - by) < radius * 2.2) {
          isColliding = true;
          break;
        }
      }
      if (!isColliding) return { x: finalX, y: finalY };
      
      attempts++;
      angle += (Math.PI / 4);
      distance = radius * 2.5 * Math.ceil(attempts / 8);
      finalX = targetX + Math.cos(angle) * distance;
      finalY = targetY + Math.sin(angle) * distance;
      finalX = Math.max(radius + 5, Math.min(width - radius - 5, finalX));
      finalY = Math.max(radius + 5, Math.min(height - radius - 5, finalY));
    }
    return { x: targetX, y: targetY };
  };

  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    const handleMouseDown = async (options: fabric.IEvent) => {
      // Prevent manual balloon creation while the AI is spinning
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
        
        // Manual fallback is triggered for user-created balloons because isAiExtracted is false
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
        targetDot = new fabric.Circle({
          left: lx, top: ly, radius: 3.5, fill: colors.border, originX: 'center', originY: 'center', selectable: false, evented: false
        });
        leaderLine = new fabric.Line([lx, ly, px, py], {
          stroke: colors.border, strokeWidth: 2, strokeDashArray: [4, 4], selectable: false, evented: false
        });
        fc.add(targetDot);
        fc.add(leaderLine);
      }

      const circle = new fabric.Circle({
        radius: 16,
        fill: colors.fill,
        stroke: isSelected ? '#3B82F6' : colors.border,
        strokeWidth: isSelected ? 3.5 : 2.5,
        originX: 'center',
        originY: 'center',
        shadow: isSelected ? new fabric.Shadow({ color: 'rgba(59, 130, 246, 0.6)', blur: 12 }) : undefined
      });

      const text = new fabric.Text(String(b.balloonNumber), {
        fontSize: String(b.balloonNumber).length > 2 ? 11 : 13,
        fontWeight: 'bold',
        fill: colors.text,
        fontFamily: 'Inter',
        originX: 'center',
        originY: 'center'
      });

      // AI Indicator Array
      const groupItems = [circle, text];

      // If the balloon was extracted by the AI, add a tiny magical sparkle icon to the top right of the balloon
      if (b.isAiExtracted) {
        const aiIndicator = new fabric.Text('✨', {
          fontSize: 10,
          left: 10,
          top: -16,
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
  }, [balloons, currentPage, selectedBalloonId, activeTool, width, height]);

  return (
    <div className="absolute top-0 left-0 pointer-events-auto">
      <canvas ref={canvasElRef} />
    </div>
  );
};