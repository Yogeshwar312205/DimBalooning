import { Server as SocketIOServer, Socket } from 'socket.io';

let ioInstance: SocketIOServer | null = null;
const sessionCollaborators: Map<string, Map<string, { id: string; name: string; socketId: string }>> = new Map();

export function initSocketHandler(io: SocketIOServer) {
  ioInstance = io;

  io.on('connection', (socket: Socket) => {
    console.log(`⚡ WebSocket connected: ${socket.id}`);

    socket.on('JOIN_INSPECTION_SESSION', ({ inspectionSessionId, userName }: { inspectionSessionId: string; userName?: string }) => {
      if (!inspectionSessionId) return;

      socket.join(inspectionSessionId);
      socket.data.sessionId = inspectionSessionId;

      if (!sessionCollaborators.has(inspectionSessionId)) {
        sessionCollaborators.set(inspectionSessionId, new Map());
      }

      const roomUsers = sessionCollaborators.get(inspectionSessionId)!;
      const inspectorName = userName || `Inspector-${socket.id.substring(0, 4)}`;

      roomUsers.set(socket.id, {
        id: socket.id,
        name: inspectorName,
        socketId: socket.id
      });

      const onlineList = Array.from(roomUsers.values());
      io.to(inspectionSessionId).emit('COLLABORATORS_UPDATED', { onlineUsers: onlineList });
      console.log(`👤 ${inspectorName} joined session room ${inspectionSessionId}`);
    });

    socket.on('LEAVE_INSPECTION_SESSION', ({ inspectionSessionId }: { inspectionSessionId: string }) => {
      if (!inspectionSessionId) return;
      socket.leave(inspectionSessionId);
      
      const roomUsers = sessionCollaborators.get(inspectionSessionId);
      if (roomUsers) {
        roomUsers.delete(socket.id);
        const onlineList = Array.from(roomUsers.values());
        io.to(inspectionSessionId).emit('COLLABORATORS_UPDATED', { onlineUsers: onlineList });
      }
    });

    socket.on('disconnect', () => {
      const sessionId = socket.data.sessionId;
      if (sessionId && sessionCollaborators.has(sessionId)) {
        const roomUsers = sessionCollaborators.get(sessionId)!;
        roomUsers.delete(socket.id);
        const onlineList = Array.from(roomUsers.values());
        io.to(sessionId).emit('COLLABORATORS_UPDATED', { onlineUsers: onlineList });
      }
      console.log(`⚡ WebSocket disconnected: ${socket.id}`);
    });
  });
}

export function broadcastToInspectionSession(sessionId: string, eventName: string, payload: any) {
  if (ioInstance) {
    ioInstance.to(sessionId).emit(eventName, payload);
  }
}