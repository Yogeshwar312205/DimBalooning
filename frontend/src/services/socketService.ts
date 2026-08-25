import { io, Socket } from 'socket.io-client';
import { useInspectionStore } from '../store/useInspectionStore';

let socket: Socket | null = null;

export function connectInspectionSocket(inspectionSessionId: string) {
  if (!inspectionSessionId) return null;

  if (socket) {
    socket.disconnect();
  }

  socket = io('/', {
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    console.log('⚡ Socket.io connected to server');
    socket?.emit('JOIN_INSPECTION_SESSION', { 
      inspectionSessionId,
      userName: 'Lead Inspector'
    });
  });

  socket.on('COLLABORATORS_UPDATED', ({ onlineUsers }: { onlineUsers: any[] }) => {
    useInspectionStore.getState().setOnlineCollaborators(onlineUsers);
  });

  socket.on('BALLOON_CREATED', ({ balloon }: { balloon: any }) => {
    useInspectionStore.getState().addBalloon(balloon);
  });

  // REAL-TIME AUTO-SYNC: Auto-hydrates all extracted balloons without clicking Sync!
  socket.on('BALLOONS_AUTO_EXTRACTED', ({ balloons }: { balloons: any[] }) => {
    console.log(`⚡ WebSocket Auto-Sync: Received ${balloons.length} balloons from background worker!`);
    useInspectionStore.getState().addMultipleBalloons(balloons);
    useInspectionStore.getState().setIsAutoExtracting(false);
  });

  socket.on('BALLOON_UPDATED', ({ balloon }: { balloon: any }) => {
    useInspectionStore.getState().updateBalloonInStore(balloon);
  });

  socket.on('BALLOON_DELETED', ({ balloonId }: { balloonId: string }) => {
    useInspectionStore.getState().deleteBalloonFromStore(balloonId);
  });

  socket.on('MEASUREMENT_UPDATED', ({ measurement }: { measurement: any }) => {
    useInspectionStore.getState().updateMeasurementInStore(measurement);
  });

  return socket;
}

export function disconnectInspectionSocket(inspectionSessionId: string) {
  if (socket) {
    socket.emit('LEAVE_INSPECTION_SESSION', { inspectionSessionId });
    socket.disconnect();
    socket = null;
  }
}